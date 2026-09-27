// In production, Nginx reverse-proxies /api/* on this same domain to the
// Flask backend (see deploy notes), so a relative path just works and there's
// no CORS to configure. For local dev without Nginx, run the backend on
// :5000 and temporarily set this to "http://127.0.0.1:5000" instead.
const API_BASE = "";

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

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

async function fetchQuestion() {
  questionText.textContent = "Loading...";
  answerInput.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/question`);
    if (!res.ok) throw new Error("Bad response from server");
    const data = await res.json();
    currentAnswer = data.answer;
    questionText.textContent = data.question;
    answerInput.disabled = false;
    answerInput.value = "";
    answerInput.classList.remove("correct", "wrong");
    answerInput.focus();
  } catch (err) {
    questionText.textContent = "Couldn't reach the server";
    flashMsg.textContent = "Check that the backend is running on port 5000.";
  }
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

  const typed = Number(raw);

  if (typed === currentAnswer) {
    // Correct: auto-advance, no Enter needed.
    score += 1;
    scoreEl.textContent = `Score: ${score}`;
    answerInput.classList.remove("wrong");
    answerInput.classList.add("correct");
    flashMsg.textContent = "Correct!";
    flashMsg.classList.add("good");
    fetchQuestion();
    return;
  }

  // Wrong so far: only flag it once they've typed as many digits as the
  // answer has (so we don't flash red while they're mid-way through typing).
  if (raw.replace("-", "").length >= String(currentAnswer).length) {
    answerInput.classList.add("wrong");
    answerInput.classList.remove("correct");
    flashMsg.textContent = "Not quite — keep trying.";
    flashMsg.classList.remove("good");
  } else {
    answerInput.classList.remove("wrong");
  }
}

function beginGame() {
  score = 0;
  scoreEl.textContent = "Score: 0";
  flashMsg.textContent = "";
  running = true;
  timeRemaining = gameDuration;
  showScreen("game");
  startTimer();
  fetchQuestion();
}

function endGame() {
  if (!running) return; // avoid double-firing (manual Stop + timer hitting 0)
  running = false;
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