"""
Speed Math - Backend
---------------------
Small Flask API that generates arithmetic questions (add / subtract / multiply,
operands between 2-100) using the Google Gemini API. If Gemini is unavailable
(no key, rate limit, network error, bad response) it falls back to generating
the question locally with Python's `random`, so the game never breaks.

Endpoints:
    GET  /api/health            -> simple health check
    GET  /api/question          -> {"question": "23 + 45", "answer": 68, "source": "gemini"}

Run:
    pip install -r requirements.txt
    cp .env.example .env        # then add your GEMINI_API_KEY
    python app.py
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

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("speed-math")

app = Flask(__name__)

# In production, lock CORS down to your real frontend origin(s) via env var,
# e.g. ALLOWED_ORIGINS=https://speedmath.com,https://www.speedmath.com
# Defaults to "*" only for local dev convenience.
_allowed = os.getenv("ALLOWED_ORIGINS", "*")
CORS(app, origins=_allowed.split(",") if _allowed != "*" else "*")

# Rate limit: this endpoint can trigger a paid Gemini API call, so it needs a
# ceiling regardless of traffic size — a handful of bots hammering it is the
# actual cost risk, not real users. 30/min and 300/day is generous for a
# single-player game but blocks casual abuse/scripts.
limiter = Limiter(get_remote_address, app=app, default_limits=[])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

MIN_NUM, MAX_NUM = 2, 100
# Multiplication uses a narrower range for both operands (like classic
# "times tables" drills) so the products stay reasonable to compute fast.
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


def _local_fallback_question():
    """Generate a question locally if Gemini can't be reached."""
    op = random.choice(OPERATIONS)

    if op == "*":
        num1 = random.randint(MULT_MIN, MULT_MAX)
        num2 = random.randint(MULT_MIN, MULT_MAX)
        answer = num1 * num2
        return num1, num2, op, answer

    num1 = random.randint(MIN_NUM, MAX_NUM)
    num2 = random.randint(MIN_NUM, MAX_NUM)

    if op == "-" and num2 > num1:
        num1, num2 = num2, num1  # keep subtraction non-negative

    answer = num1 + num2 if op == "+" else num1 - num2
    return num1, num2, op, answer


def _ask_gemini():
    """Call Gemini and return (num1, num2, operator, answer) or raise on any problem."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")

    payload = {
        "contents": [{"role": "user", "parts": [{"text": SYSTEM_PROMPT}]}],
        "generationConfig": {
            "temperature": 1.0,
            "maxOutputTokens": 100,
        },
    }
    headers = {"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY}

    resp = requests.post(GEMINI_URL, headers=headers, json=payload, timeout=8)
    resp.raise_for_status()
    data = resp.json()

    text = data["candidates"][0]["content"]["parts"][0]["text"]
    # Strip accidental ```json fences just in case the model adds them
    text = re.sub(r"```json|```", "", text).strip()
    parsed = json.loads(text)

    num1, num2 = int(parsed["num1"]), int(parsed["num2"])
    operator = parsed["operator"]
    answer = int(parsed["answer"])

    # Validate against our own rules — never trust the model blindly
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

    correct = {"+": num1 + num2, "-": num1 - num2, "*": num1 * num2}[operator]
    if answer != correct:
        answer = correct  # trust our own arithmetic over the model's

    return num1, num2, operator, answer


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "gemini_configured": bool(GEMINI_API_KEY)})


@app.route("/api/question")
@limiter.limit("30 per minute;300 per day")
def question():
    source = "gemini"
    try:
        num1, num2, op, answer = _ask_gemini()
    except Exception as exc:  # noqa: BLE001 - any failure falls back, game must keep working
        log.warning("Gemini generation failed, using local fallback: %s", exc)
        num1, num2, op, answer = _local_fallback_question()
        source = "fallback"

    display_op = "×" if op == "*" else op
    return jsonify(
        {
            "question": f"{num1} {display_op} {num2}",
            "answer": answer,
            "source": source,
        }
    )


if __name__ == "__main__":
    # This block only runs "python app.py" (local dev). In production this
    # file is imported by gunicorn instead, so debug/host/port here don't
    # matter for the deployed app — see gunicorn command in the deploy notes.
    debug_mode = os.getenv("FLASK_DEBUG", "0") == "1"
    port = int(os.getenv("PORT", 5000))
    app.run(debug=debug_mode, host="127.0.0.1", port=port)