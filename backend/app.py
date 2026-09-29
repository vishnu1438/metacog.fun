"""
Speed Math - Backend
---------------------
Small Flask API that generates arithmetic questions (add / subtract / multiply).

By default questions are generated locally with Python's `random` (instant,
free, never fails). Optionally, set USE_GEMINI=true and GEMINI_API_KEY in .env
to have the Google Gemini API generate them instead. If Gemini is enabled but
fails (rate limit, network error, bad response) the app silently falls back to
local generation, so the game never breaks.

Endpoints:
    GET  /api/health     -> simple health check
    GET  /api/question   -> {"question": "23 + 45", "answer": 68, "source": "local"}

Local dev:
    pip install -r requirements.txt
    cp .env.example .env
    python app.py

Production: gunicorn imports this file (see deploy/speedmath.service).
"""

import os
import re
import json
import random
import logging

import requests
from flask import Flask, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("speed-math")

app = Flask(__name__)

# We run behind Nginx. Without this, every visitor appears to come from
# 127.0.0.1 and would share ONE rate-limit bucket. Trust exactly one proxy hop.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# In production the frontend and API share one domain (Nginx proxies /api),
# so CORS is not needed and stays OFF unless ALLOWED_ORIGINS is set.
# Local dev (frontend on another port): set ALLOWED_ORIGINS=* in your .env.
_allowed = os.getenv("ALLOWED_ORIGINS", "").strip()
if _allowed == "*":
    CORS(app, origins="*")
elif _allowed:
    CORS(app, origins=[o.strip() for o in _allowed.split(",") if o.strip()])

# Rate limit per client IP. Memory storage is fine for a single gunicorn worker
# (the service runs 1 worker + threads, so counts are accurate).
# Limits are generous enough for a fast player (~1 question/second).
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],
    storage_uri="memory://",
)


@app.errorhandler(429)
def too_many_requests(_exc):
    return jsonify({"error": "rate_limited"}), 429


USE_GEMINI = os.getenv("USE_GEMINI", "false").strip().lower() in ("1", "true", "yes", "on")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
GEMINI_TIMEOUT = float(os.getenv("GEMINI_TIMEOUT", "4"))

MIN_NUM, MAX_NUM = 2, 100
# Multiplication uses a narrower range (like classic times-table drills).
MULT_MIN, MULT_MAX = 2, 12
OPERATIONS = ["+", "-", "*"]

# ---- The one place the "inbuilt prompt" lives -----------------------------
SYSTEM_PROMPT = (
    "You are a question generator for a speed-math game. "
    "Generate exactly ONE random arithmetic question using addition, subtraction, "
    "or multiplication only. Pick the operation randomly and vary it each time. "
    "RULES BY OPERATION: "
    "For addition and subtraction, both numbers MUST be whole integers between 2 and 100 (inclusive). "
    "For multiplication, BOTH numbers MUST be whole integers between 2 and 12 (inclusive). "
    "For subtraction, the first number must be greater than or equal to the second, "
    "so the answer is never negative. "
    "Respond with STRICT JSON only, no markdown, no code fences, no explanation, "
    "in exactly this shape: {\"num1\": <int>, \"num2\": <int>, \"operator\": \"+\" | \"-\" | \"*\", \"answer\": <int>}. "
    "The 'answer' field must be the mathematically correct result of num1 <operator> num2."
)


def _gemini_enabled():
    return USE_GEMINI and bool(GEMINI_API_KEY)


def _local_question():
    """Generate a question locally (default path, and Gemini fallback)."""
    op = random.choice(OPERATIONS)

    if op == "*":
        num1 = random.randint(MULT_MIN, MULT_MAX)
        num2 = random.randint(MULT_MIN, MULT_MAX)
        return num1, num2, op, num1 * num2

    num1 = random.randint(MIN_NUM, MAX_NUM)
    num2 = random.randint(MIN_NUM, MAX_NUM)

    if op == "-" and num2 > num1:
        num1, num2 = num2, num1  # keep subtraction non-negative

    answer = num1 + num2 if op == "+" else num1 - num2
    return num1, num2, op, answer


def _ask_gemini():
    """Call Gemini and return (num1, num2, operator, answer) or raise on any problem."""
    payload = {
        "contents": [{"role": "user", "parts": [{"text": SYSTEM_PROMPT}]}],
        "generationConfig": {
            "temperature": 1.0,
            # 2.5 models spend output tokens on "thinking" by default, which
            # with a tiny limit can leave an empty reply. Turn thinking off
            # and leave headroom.
            "maxOutputTokens": 256,
            "responseMimeType": "application/json",
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    headers = {"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY}

    resp = requests.post(GEMINI_URL, headers=headers, json=payload, timeout=GEMINI_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()

    parts = data["candidates"][0]["content"]["parts"]
    text = "".join(p.get("text", "") for p in parts)
    # Strip accidental ```json fences just in case the model adds them
    text = re.sub(r"```json|```", "", text).strip()
    parsed = json.loads(text)

    num1, num2 = int(parsed["num1"]), int(parsed["num2"])
    operator = parsed["operator"]

    # Validate against our own rules - never trust the model blindly
    if operator not in OPERATIONS:
        raise ValueError("bad operator from model")

    if operator == "*":
        if not (MULT_MIN <= num1 <= MULT_MAX and MULT_MIN <= num2 <= MULT_MAX):
            raise ValueError("multiplication numbers out of range from model")
    else:
        if not (MIN_NUM <= num1 <= MAX_NUM and MIN_NUM <= num2 <= MAX_NUM):
            raise ValueError("numbers out of range from model")
        if operator == "-" and num2 > num1:
            num1, num2 = num2, num1

    # Always compute the answer ourselves.
    answer = {"+": num1 + num2, "-": num1 - num2, "*": num1 * num2}[operator]
    return num1, num2, operator, answer


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "gemini_enabled": _gemini_enabled()})


@app.route("/api/question")
@limiter.limit("120 per minute;3000 per day")
def question():
    if _gemini_enabled():
        try:
            num1, num2, op, answer = _ask_gemini()
            source = "gemini"
        except Exception as exc:  # noqa: BLE001 - any failure falls back
            log.warning("Gemini generation failed, using local fallback: %s", exc)
            num1, num2, op, answer = _local_question()
            source = "fallback"
    else:
        num1, num2, op, answer = _local_question()
        source = "local"

    display_op = "\u00d7" if op == "*" else op
    resp = jsonify(
        {
            "question": f"{num1} {display_op} {num2}",
            "answer": answer,
            "source": source,
        }
    )
    resp.headers["Cache-Control"] = "no-store"
    return resp


if __name__ == "__main__":
    # Only used by "python app.py" (local dev). In production gunicorn imports
    # `app` from this file, so this block is skipped.
    debug_mode = os.getenv("FLASK_DEBUG", "0") == "1"
    port = int(os.getenv("PORT", 5000))
    app.run(debug=debug_mode, host="127.0.0.1", port=port)