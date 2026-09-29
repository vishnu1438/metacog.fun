// In production, Nginx reverse-proxies /api/* on the same domain to the Flask
// backend, so a relative path just works (no CORS). When you open the page from
// localhost / 127.0.0.1 (local dev), talk to the Flask dev server on :5000
// instead - set ALLOWED_ORIGINS=* in backend/.env for that.
const IS_LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = IS_LOCAL && location.port !== "5000" ? "http://127.0.0.1:5000" : "";

const el = (id) => document.getElementById(id);

const screens = {
  setup: el("setup-screen"),
  game: el("game-screen"),
  results: el("results-screen"),
};

const durationInput = el("duration");
const startBtn = el("start-btn");
const setupError = el("setup-error");

const scoreEl = el("score");
const timerEl = el("timer");
const questionText = el("question-text");
const answerInput = el("answer-input");
const flashMsg = el("flash-msg");
const stopBtn = el("stop-btn");

const finalScore = el("final-score");
const finalTime = el("final-time");
const restartBtn = el("restart-btn");

let currentAnswer = null;
let score = 0;
let gameDuration = 60;
let timeRemaining = 60;
let timerInterval = null;
let running = false;

let prefetched = null; // Promise for the NEXT question, fetched in the background
let requestId = 0; // invalidates in-flight loads when the game ends/restarts
let retryTimer = null;

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

async function requestQuestion() {
  const res = await fetch(`${API_BASE}/api/question`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (typeof data.answer !== "number" || typeof data.question !== "string") {
    throw new Error("Malformed response");
  }
  return data;
}

// Fetch the next question while the player is still solving the current one,
// so there is no waiting between questions.
function prefetchNext() {
  prefetched = requestQuestion().catch(() => null);
}

async function loadQuestion() {
  const myId = ++requestId;
  clearTimeout(retryTimer);
  answerInput.disabled = true;

  let data = null;
  if (prefetched) {
    data = await prefetched;
    prefetched = null;
  }
  if (!running || myId !== requestId) return;

  if (!data) {
    questionText.textContent = "Loading...";
    try {
      data = await requestQuestion();
    } catch (err) {
      if (!running || myId !== requestId) return;
      questionText.textContent = "Couldn't reach the server";
      flashMsg.classList.remove("good");
      flashMsg.textContent = "Retrying...";
      retryTimer = setTimeout(loadQuestion, 1500);
      return;
    }
    if (!running || myId !== requestId) return;
  }

  currentAnswer = data.answer;
  questionText.textContent = data.question;
  if (flashMsg.textContent === "Retrying...") flashMsg.textContent = "";
  answerInput.disabled = false;
  answerInput.value = "";
  answerInput.classList.remove("correct", "wrong");
  answerInput.focus();

  prefetchNext();
}

function startTimer() {
  const endAt = Date.now() + gameDuration * 1000;
  timerEl.textContent = `${gameDuration.toFixed(1)}s`;

  timerInterval = setInterval(() => {
    timeRemaining = Math.max(0, (endAt - Date.now()) / 1000);
    timerEl.textContent = `${timeRemaining.toFixed(1)}s`;

    if (timeRemaining <= 0) {
      endGame();
    }
  }, 100);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function handleInput() {
  if (!running || answerInput.disabled) return;

  const raw = answerInput.value.trim();
  if (raw === "") return;

  if (!/^\d+$/.test(raw)) {
    answerInput.classList.add("wrong");
    answerInput.classList.remove("correct");
    flashMsg.classList.remove("good");
    flashMsg.textContent = "Digits only.";
    return;
  }

  const typed = Number(raw);

  if (typed === currentAnswer) {
    // Correct: auto-advance, no Enter needed.
    score += 1;
    scoreEl.textContent = `Score: ${score}`;
    answerInput.classList.remove("wrong");
    answerInput.classList.add("correct");
    flashMsg.textContent = "Correct!";
    flashMsg.classList.add("good");
    loadQuestion();
    return;
  }

  // Wrong so far: only flag it once they've typed as many digits as the
  // answer has (so we don't flash red while they're mid-way through typing).
  if (raw.length >= String(currentAnswer).length) {
    answerInput.classList.add("wrong");
    answerInput.classList.remove("correct");
    flashMsg.textContent = "Not quite - keep trying.";
    flashMsg.classList.remove("good");
  } else {
    answerInput.classList.remove("wrong");
  }
}

function beginGame() {
  score = 0;
  scoreEl.textContent = "Score: 0";
  flashMsg.textContent = "";
  flashMsg.classList.remove("good");
  running = true;
  prefetched = null;
  timeRemaining = gameDuration;
  showScreen("game");
  startTimer();
  loadQuestion();
}

function endGame() {
  if (!running) return; // avoid double-firing (manual Stop + timer hitting 0)
  running = false;
  requestId++; // cancel any in-flight question load
  clearTimeout(retryTimer);
  prefetched = null;
  stopTimer();
  answerInput.disabled = true;
  finalScore.textContent = `${score} points`;
  finalTime.textContent = `in ${gameDuration} seconds`;
  showScreen("results");
}

startBtn.addEventListener("click", () => {
  const seconds = parseInt(durationInput.value, 10);
  if (isNaN(seconds) || seconds < 10 || seconds > 600) {
    setupError.textContent = "Enter a duration between 10 and 600 seconds.";
    return;
  }
  setupError.textContent = "";
  gameDuration = seconds;
  beginGame();
});

answerInput.addEventListener("input", handleInput);
stopBtn.addEventListener("click", endGame);
restartBtn.addEventListener("click", () => showScreen("setup"));