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

// ============================================================
// REACTION-TIME TRACKING
// ============================================================

let questionShownAt = 0;
let reactionTimes = [];

// Create reaction-time result dynamically
const reactionSummary = document.createElement("p");
reactionSummary.className = "subtitle";
reactionSummary.id = "reaction-summary";

finalTime.insertAdjacentElement(
  "afterend",
  reactionSummary
);


// ============================================================
// SCREEN MANAGEMENT
// ============================================================

function showScreen(name) {
  Object.values(screens).forEach((screen) => {
    screen.classList.add("hidden");
  });

  screens[name].classList.remove("hidden");
}


// ============================================================
// LOCAL QUESTION GENERATOR
// ============================================================
// Completely independent.
// No Flask.
// No Gemini.
// No API.
// No internet.
// ============================================================

function generateQuestion() {

  const operations = ["+", "-", "*"];

  const operation =
    operations[
      Math.floor(Math.random() * operations.length)
    ];

  let num1;
  let num2;
  let answer;


  // ADDITION
  if (operation === "+") {

    num1 =
      Math.floor(Math.random() * 99) + 2;

    num2 =
      Math.floor(Math.random() * 99) + 2;

    answer = num1 + num2;
  }


  // SUBTRACTION
  else if (operation === "-") {

    num1 =
      Math.floor(Math.random() * 99) + 2;

    num2 =
      Math.floor(Math.random() * 99) + 2;

    // Prevent negative answers
    if (num2 > num1) {
      [num1, num2] = [num2, num1];
    }

    answer = num1 - num2;
  }


  // MULTIPLICATION
  else {

    num1 =
      Math.floor(Math.random() * 11) + 2;

    num2 =
      Math.floor(Math.random() * 11) + 2;

    answer = num1 * num2;
  }


  return {
    question:
      operation === "*"
        ? `${num1} × ${num2}`
        : `${num1} ${operation} ${num2}`,

    answer: answer,
  };
}


// ============================================================
// LOAD QUESTION
// ============================================================

function loadQuestion() {

  if (!running) {
    return;
  }

  const data = generateQuestion();

  currentAnswer = data.answer;

  questionText.textContent =
    data.question;

  flashMsg.textContent = "";

  flashMsg.classList.remove("good");

  answerInput.disabled = false;

  answerInput.value = "";

  answerInput.classList.remove(
    "correct",
    "wrong"
  );

  answerInput.focus();


  // Start reaction timer AFTER the question
  // has actually appeared on screen.

  requestAnimationFrame(() => {

    requestAnimationFrame(() => {

      if (running) {

        questionShownAt =
          performance.now();

      }

    });

  });
}


// ============================================================
// INTERNAL GAME TIMER
// ============================================================
// The timer is invisible.
// It only determines when the game ends.
// ============================================================

function startTimer() {

  const endAt =
    Date.now() +
    gameDuration * 1000;


  timerInterval =
    setInterval(() => {

      timeRemaining =
        Math.max(
          0,
          (endAt - Date.now()) / 1000
        );


      if (timeRemaining <= 0) {
        endGame();
      }

    }, 100);
}


function stopTimer() {

  clearInterval(timerInterval);

  timerInterval = null;
}


// ============================================================
// INPUT HANDLING
// ============================================================

function handleInput() {

  if (
    !running ||
    answerInput.disabled
  ) {
    return;
  }

  const raw =
    answerInput.value.trim();


  if (raw === "") {
    return;
  }


  // Only numbers
  if (!/^\d+$/.test(raw)) {

    answerInput.classList.add("wrong");

    answerInput.classList.remove("correct");

    flashMsg.classList.remove("good");

    flashMsg.textContent =
      "Digits only.";

    return;
  }


  const typed = Number(raw);


  // ==========================================================
  // CORRECT ANSWER
  // ==========================================================

  if (typed === currentAnswer) {

    // Calculate reaction time for this question
    if (questionShownAt > 0) {

      const reactionTime =
        performance.now() -
        questionShownAt;

      reactionTimes.push(
        reactionTime
      );
    }


    score += 1;

    scoreEl.textContent =
      `Score: ${score}`;


    answerInput.classList.remove(
      "wrong"
    );

    answerInput.classList.add(
      "correct"
    );


    flashMsg.textContent =
      "Correct!";

    flashMsg.classList.add(
      "good"
    );


    // Immediately show next question
    loadQuestion();

    return;
  }


  // ==========================================================
  // WRONG ANSWER
  // ==========================================================

  if (
    raw.length >=
    String(currentAnswer).length
  ) {

    answerInput.classList.add(
      "wrong"
    );

    answerInput.classList.remove(
      "correct"
    );

    flashMsg.textContent =
      "Not quite - keep trying.";

    flashMsg.classList.remove(
      "good"
    );

  } else {

    answerInput.classList.remove(
      "wrong"
    );

  }
}


// ============================================================
// START GAME
// ============================================================

function beginGame() {

  score = 0;

  scoreEl.textContent =
    "Score: 0";

  flashMsg.textContent = "";

  flashMsg.classList.remove(
    "good"
  );


  // Clear previous reaction times
  reactionTimes = [];

  reactionSummary.textContent = "";


  running = true;

  timeRemaining =
    gameDuration;


  showScreen("game");


  // Start invisible timer
  startTimer();


  // Generate first question
  loadQuestion();
}


// ============================================================
// END GAME
// ============================================================

function endGame() {

  if (!running) {
    return;
  }


  running = false;


  stopTimer();


  answerInput.disabled = true;


  // Final score
  finalScore.textContent =
    `${score} points`;


  finalTime.textContent =
    `in ${gameDuration} seconds`;


  // ==========================================================
  // REACTION-TIME RESULTS
  // ==========================================================

  if (reactionTimes.length > 0) {

    const totalReactionTime =
      reactionTimes.reduce(
        (sum, value) =>
          sum + value,
        0
      );


    const average =
      totalReactionTime /
      reactionTimes.length;


    const fastest =
      Math.min(
        ...reactionTimes
      );


    reactionSummary.textContent =
      `⚡ Avg reaction: ` +
      `${Math.round(average)} ms · ` +
      `Fastest: ` +
      `${Math.round(fastest)} ms`;

  } else {

    reactionSummary.textContent =
      "⚡ No completed questions to measure reaction time.";

  }


  // Reset timing value AFTER calculating results
  questionShownAt = 0;


  showScreen("results");
}


// ============================================================
// START BUTTON
// ============================================================

startBtn.addEventListener(
  "click",
  () => {

    const seconds =
      parseInt(
        durationInput.value,
        10
      );


    if (
      isNaN(seconds) ||
      seconds < 10 ||
      seconds > 600
    ) {

      setupError.textContent =
        "Enter a duration between 10 and 600 seconds.";

      return;
    }


    setupError.textContent = "";

    gameDuration =
      seconds;


    beginGame();
  }
);


// ============================================================
// EVENTS
// ============================================================

answerInput.addEventListener(
  "input",
  handleInput
);


stopBtn.addEventListener(
  "click",
  endGame
);


restartBtn.addEventListener(
  "click",
  () => {

    showScreen("setup");

    answerInput.value = "";

    flashMsg.textContent = "";

    flashMsg.classList.remove(
      "good"
    );

    reactionSummary.textContent = "";

    questionShownAt = 0;

  }
);