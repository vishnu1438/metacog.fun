/* =========================================================
   MetaCog — MEMORY GRID
   Visual / Spatial Memory Game
   No API, no backend
   ========================================================= */

(function () {
  "use strict";

  /* =========================================================
     CONFIGURATION
     ========================================================= */

  const GRID_SIZES = [2, 3, 4, 5];

  // 2 rounds per grid size  ->  4 sizes x 2 = 8 rounds per level
  const QUESTIONS_PER_GRID = 2;
  const TOTAL_QUESTIONS = 8;

  const EMOJI_POOL = ["🗿", "🍄", "🔞"];

  const LEVELS = {
    easy: {
      name: "Easy",
      icon: "🟢",
      memorizeTime: { 2: 3500, 3: 4500, 4: 5500, 5: 6500 },
      emojiCount: { 2: [2, 2], 3: [3, 4], 4: [4, 5], 5: [5, 6] },
      difficultyWeight: 1
    },
    medium: {
      name: "Medium",
      icon: "🟡",
      memorizeTime: { 2: 3000, 3: 3800, 4: 4600, 5: 5400 },
      emojiCount: { 2: [3, 3], 3: [4, 5], 4: [5, 6], 5: [6, 8] },
      difficultyWeight: 1.5
    },
    hard: {
      name: "Hard",
      icon: "🔴",
      memorizeTime: { 2: 2500, 3: 3200, 4: 3900, 5: 4600 },
      emojiCount: { 2: [4, 4], 3: [5, 6], 4: [6, 8], 5: [8, 10] },
      difficultyWeight: 2
    }
  };

  /* =========================================================
     STATE
     ========================================================= */

  const root = document.getElementById("game-root") || document.body;

  let currentLevel = "easy";
  let currentQuestionNumber = 0;
  let currentGridSize = 2;
  let currentQuestion = null;
  let currentEmojiIndex = 0;
  let results = [];
  let previousPatterns = [];
  let locked = false;
  let fullGameMode = false;
  let fullGameLevelIndex = 0;
  let questionToken = 0; // guards against stale timers

  // Recall-phase state
  let recallQueue = [];   // jumbled order of cell positions to ask about
  let foundCells = [];    // cells already opened correctly

  const fullGameLevels = ["easy", "medium", "hard"];

  /* =========================================================
     CSS
     ========================================================= */

  const style = document.createElement("style");

  style.textContent = `

    #memory-grid-root {
      width: 100%;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 50px 20px;
      color: #f2f2f2;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    #memory-grid-root * { box-sizing: border-box; }

    .mg-card {
      width: min(760px, 100%);
      background: #111111;
      border: 1px solid #2c2c2c;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 15px 45px rgba(0,0,0,.35);
    }

    .mg-back {
      display: inline-block;
      color: #8a8a8a;
      text-decoration: none;
      margin-bottom: 18px;
      font-size: 14px;
    }
    .mg-back:hover { color: #f2f2f2; }

    .mg-title {
      text-align: center;
      font-size: 27px;
      font-weight: 800;
      margin: 8px 0 10px;
    }

    .mg-description {
      text-align: center;
      color: #8a8a8a;
      line-height: 1.55;
      margin-bottom: 20px;
    }

    .mg-level {
      width: 100%;
      display: block;
      background: #111111;
      color: #f2f2f2;
      border: 1px solid #2c2c2c;
      border-radius: 12px;
      padding: 15px;
      margin-top: 12px;
      font-size: 16px;
      cursor: pointer;
      text-align: left;
    }
    .mg-level:hover { background: #1a1a1a; border-color: #3a3a3a; }

    .mg-button {
      width: 100%;
      border: 0;
      border-radius: 10px;
      background: #f2f2f2;
      color: #000000;
      padding: 14px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 14px;
    }
    .mg-button:hover { background: #dddddd; }

    .mg-secondary {
      background: transparent;
      color: #8a8a8a;
      border: 1px solid #2c2c2c;
    }
    .mg-secondary:hover { background: #1a1a1a; color: #f2f2f2; }

    .mg-info {
      background: #0a0a0a;
      border: 1px solid #2c2c2c;
      border-radius: 12px;
      padding: 18px;
      margin: 18px 0;
      line-height: 1.6;
      font-size: 14px;
    }

    .mg-game-header {
      text-align: center;
      color: #8a8a8a;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .mg-game-header strong { color: #f2f2f2; }

    .mg-game-area {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 150px;
      gap: 22px;
      align-items: center;
    }

    .mg-grid-wrapper {
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .mg-grid {
      width: min(400px, 100%);
      aspect-ratio: 1 / 1;
      display: grid;
      gap: 8px;
      container-type: inline-size;
      /* Equal, fixed rows and columns: boxes never change size,
         whether empty, filled, open or closed */
      grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr));
      grid-template-rows: repeat(var(--n, 3), minmax(0, 1fr));
    }

    .mg-cell {
      width: 100%;
      height: 100%;
      overflow: hidden;
      padding: 0;
      line-height: 1;
      font-family: inherit;
      min-width: 0;
      min-height: 0;
      border-radius: 9px;
      border: 1px solid #303030;
      background: #1a1a1a;
      color: #f2f2f2;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      /* Emoji size depends only on grid width and grid size,
         so it is identical in the memorize and recall phases */
      font-size: calc(100cqw / var(--n, 3) * 0.55);
      transition: background .12s ease, border-color .12s ease,
                  box-shadow .12s ease, transform .08s ease;
    }
    .mg-cell:hover { background: #242424; }
    .mg-cell:active { transform: scale(.97); }

    .mg-cell.correct {
      background: #12351f;
      border-color: #35d07f;
      box-shadow: inset 0 0 0 2px #35d07f;
      cursor: default;
    }

    .mg-cell.wrong {
      background: #3b141d;
      border-color: #ff4d6d;
      box-shadow: inset 0 0 0 2px #ff4d6d;
    }

    .mg-emoji-panel {
      width: 150px;
      aspect-ratio: 1 / 1;
      background: #0a0a0a;
      border: 1px solid #2c2c2c;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mg-recall-emoji {
      font-size: clamp(55px, 8vw, 78px);
      line-height: 1;
      user-select: none;
    }

    /* Blink when a new emoji is asked (even if it is the same emoji) */
    .mg-recall-emoji.blink {
      animation: mg-blink .5s ease-out;
    }

    @keyframes mg-blink {
      0%   { opacity: 0; transform: scale(.6); }
      60%  { opacity: 1; transform: scale(1.12); }
      100% { opacity: 1; transform: scale(1); }
    }

    .mg-result-box {
      background: #0a0a0a;
      border: 1px solid #2c2c2c;
      border-radius: 12px;
      padding: 18px;
      margin: 20px 0;
    }

    .mg-stat {
      display: flex;
      justify-content: space-between;
      padding: 9px 0;
      border-bottom: 1px solid #1f1f1f;
    }
    .mg-stat:last-child { border-bottom: 0; }

    .mg-iq-label {
      text-align: center;
      color: #8a8a8a;
      font-size: 14px;
      margin-top: 10px;
    }

    .mg-iq {
      text-align: center;
      font-size: 70px;
      font-weight: 800;
      line-height: 1;
      margin: 12px 0;
    }

    .mg-memory-level {
      text-align: center;
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .mg-result-description {
      text-align: center;
      color: #8a8a8a;
      line-height: 1.5;
      margin-bottom: 20px;
    }

    .mg-green { color: #35d07f; }
    .mg-red { color: #ff4d6d; }

    @media (max-width: 650px) {
      #memory-grid-root { padding: 25px 12px; }
      .mg-card { padding: 20px 14px; }
      .mg-game-area { grid-template-columns: 1fr; gap: 15px; }
      .mg-emoji-panel { width: 100%; height: 90px; aspect-ratio: auto; }
    }

  `;

  document.head.appendChild(style);

  /* =========================================================
     HELPERS
     ========================================================= */

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffle(array) {
    const result = array.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Positions with low repetition versus recent patterns.
  function generatePositions(size, count) {
    const total = size * size;
    let best = null;
    let lowestSimilarity = Infinity;

    for (let attempt = 0; attempt < 100; attempt++) {
      const positions = shuffle(Array.from({ length: total }, (_, i) => i))
        .slice(0, count)
        .sort((a, b) => a - b);

      let similarity = 0;

      for (const old of previousPatterns) {
        if (old.size !== size) continue;
        const overlap = positions.filter(p => old.positions.includes(p)).length;
        const ratio = overlap / Math.max(count, old.positions.length);
        similarity = Math.max(similarity, ratio);
      }

      if (similarity < lowestSimilarity) {
        lowestSimilarity = similarity;
        best = positions;
      }

      if (similarity <= 0.30) return positions;
    }

    return best;
  }

  function generateEmojis(count) {
    const emojis = [];
    for (let i = 0; i < count; i++) {
      emojis.push(EMOJI_POOL[randomInt(0, EMOJI_POOL.length - 1)]);
    }
    return emojis;
  }

  /* =========================================================
     GENERATE QUESTION
     ========================================================= */

  function generateQuestion(level, size) {
    const config = LEVELS[level];
    const range = config.emojiCount[size];
    const count = randomInt(range[0], range[1]);

    const positions = generatePositions(size, count);
    const emojis = generateEmojis(count);

    const cells = Array(size * size).fill(null);

    // positions[i] holds emojis[i]
    positions.forEach((position, index) => {
      cells[position] = emojis[index];
    });

    const question = {
      size,
      cells,
      positions,
      emojis,
      memorizeTime: config.memorizeTime[size]
    };

    previousPatterns.push({ size, positions: positions.slice() });
    if (previousPatterns.length > 20) previousPatterns.shift();

    return question;
  }

  /* =========================================================
     RENDER
     ========================================================= */

  function render(content) {
    root.innerHTML = `
      <div id="memory-grid-root">
        <div class="mg-card">
          ${content}
        </div>
      </div>
    `;
  }

  /* =========================================================
     MENU
     ========================================================= */

  function showMenu() {
    render(`

      <a class="mg-back" href="home.html">← All games</a>

      <div class="mg-title">🧠 Memory Grid</div>

      <div class="mg-description">
        Tests visual memory, spatial memory and working memory.
      </div>

      <button class="mg-level" data-action="start" data-level="easy">
        🟢 <b>Easy</b> · ${TOTAL_QUESTIONS} rounds
      </button>

      <button class="mg-level" data-action="start" data-level="medium">
        🟡 <b>Medium</b> · ${TOTAL_QUESTIONS} rounds
      </button>

      <button class="mg-level" data-action="start" data-level="hard">
        🔴 <b>Hard</b> · ${TOTAL_QUESTIONS} rounds
      </button>

      <button class="mg-button" data-action="all-levels">
        Play all three levels
      </button>

    `);
  }

  /* =========================================================
     INSTRUCTIONS
     ========================================================= */

  function showInstructions(level) {
    const config = LEVELS[level];

    render(`

      <a class="mg-back" href="home.html">← All games</a>

      <div class="mg-title">
        ${config.icon} ${config.name.toUpperCase()} — Instructions
      </div>

      <div class="mg-info">

        <p><b>Memorize the emojis and their positions.</b></p>

        <p>The emojis appear inside the grid for a short time.</p>

        <p>
          After they disappear, an emoji is shown on the side.
          Tap the box where that emoji was hidden.
        </p>

        <p>
          The box opens to show what is inside.
          If you are <b>right</b> (green), the box stays open and the next
          emoji appears. If you are <b>wrong</b> (red), the box closes again.
        </p>

        <p>The emojis are asked in a shuffled order.</p>

        <p>
          Grid size increases: <b>2×2 → 3×3 → 4×4 → 5×5</b>
        </p>

        <p>
          2 rounds are played for each grid size
          (${TOTAL_QUESTIONS} rounds per level).
        </p>

      </div>

      <button class="mg-button" data-action="begin" data-level="${level}">
        Start ${config.name}
      </button>

      <button class="mg-button mg-secondary" data-action="menu">
        Back
      </button>

    `);
  }

  /* =========================================================
     START LEVEL
     ========================================================= */

  function startLevel(level) {
    currentLevel = level;
    currentQuestionNumber = 0;
    currentGridSize = 2;
    currentQuestion = null;
    currentEmojiIndex = 0;
    results = [];
    previousPatterns = [];
    locked = false;
    startQuestion();
  }

  /* =========================================================
     START QUESTION
     ========================================================= */

  function startQuestion() {
    locked = false;

    const gridIndex = Math.floor(currentQuestionNumber / QUESTIONS_PER_GRID);
    currentGridSize = GRID_SIZES[Math.min(gridIndex, GRID_SIZES.length - 1)];

    currentQuestion = generateQuestion(currentLevel, currentGridSize);
    currentEmojiIndex = 0;

    // Jumbled order in which the emojis will be asked
    recallQueue = shuffle(currentQuestion.positions);
    foundCells = [];

    showMemoryPhase();

    const token = ++questionToken;

    setTimeout(() => {
      if (!currentQuestion || token !== questionToken) return;
      showRecallPhase();
    }, currentQuestion.memorizeTime);
  }

  /* =========================================================
     MEMORY PHASE
     ========================================================= */

  function showMemoryPhase() {
    const q = currentQuestion;

    const cells = q.cells
      .map(emoji => `<div class="mg-cell">${emoji || ""}</div>`)
      .join("");

    render(`

      <div class="mg-game-header">
        🧠 MEMORY GRID · ${LEVELS[currentLevel].icon}
        <strong>${LEVELS[currentLevel].name.toUpperCase()}</strong>
        <br>
        Round <strong>${currentQuestionNumber + 1}</strong> / ${TOTAL_QUESTIONS}
        · ${currentGridSize}×${currentGridSize}
      </div>

      <div class="mg-game-area">

        <div class="mg-grid-wrapper">
          <div class="mg-grid"
               style="--n: ${currentGridSize};">
            ${cells}
          </div>
        </div>

        <!-- Same layout as recall phase so the grid keeps the same size -->
        <div class="mg-emoji-panel" style="visibility:hidden;"></div>

      </div>

    `);
  }

  /* =========================================================
     RECALL PHASE
     ========================================================= */

  function showRecallPhase() {
    currentEmojiIndex = 0;
    locked = false;
    renderRecall(null, null, true);
  }

  // The emoji currently being asked about
  function getTargetEmoji() {
    return currentQuestion.cells[recallQueue[currentEmojiIndex]];
  }

  /*
     feedbackPosition / feedbackType: the cell just clicked.
     - correct: the cell is opened and stays open
     - wrong:   the cell is opened briefly in red, then closes
  */
  function renderRecall(feedbackPosition = null, feedbackType = null, blink = false) {
    const q = currentQuestion;
    const currentEmoji = getTargetEmoji();

    const cells = Array.from({ length: q.size * q.size }, (_, position) => {
      let className = "mg-cell";
      let content = "";

      if (foundCells.includes(position)) {
        // Previously found cells stay open
        className += " correct";
        content = q.cells[position] || "";
      }

      if (feedbackPosition === position) {
        // Open the clicked box to reveal what is inside
        content = q.cells[position] || "";
        if (feedbackType === "correct") className += " correct";
        if (feedbackType === "wrong") className += " wrong";
      }

      return `
        <button class="${className}"
                data-action="select-cell"
                data-position="${position}">${content}</button>
      `;
    }).join("");

    render(`

      <div class="mg-game-header">
        🧠 MEMORY GRID · ${LEVELS[currentLevel].icon}
        <strong>${LEVELS[currentLevel].name.toUpperCase()}</strong>
        <br>
        Round <strong>${currentQuestionNumber + 1}</strong> / ${TOTAL_QUESTIONS}
        · ${q.size}×${q.size}
      </div>

      <div class="mg-game-area">

        <div class="mg-grid-wrapper">
          <div class="mg-grid"
               style="--n: ${q.size};">
            ${cells}
          </div>
        </div>

        <div class="mg-emoji-panel">
          <div class="mg-recall-emoji${blink ? " blink" : ""}">${currentEmoji}</div>
        </div>

      </div>

    `);
  }

  /* =========================================================
     CELL SELECTION
     ========================================================= */

  function selectCell(position) {
    if (locked) return;

    // Already opened boxes can't be chosen again
    if (foundCells.includes(position)) return;

    locked = true;

    const q = currentQuestion;
    const target = getTargetEmoji();

    // Correct if the chosen box really holds the emoji shown
    // (works even when the same emoji is hidden in several boxes)
    const isCorrect = q.cells[position] === target;

    results.push({
      level: currentLevel,
      gridSize: q.size,
      emoji: target,
      correct: isCorrect
    });

    if (isCorrect) {
      foundCells.push(position);
      renderRecall(position, "correct");
      setTimeout(goToNextEmoji, 650);
    } else {
      // Show what was inside in red, then close the box
      renderRecall(position, "wrong");
      setTimeout(() => {
        renderRecall();      // box closed again
        goToNextEmoji();
      }, 750);
    }
  }

  /* =========================================================
     NEXT EMOJI
     ========================================================= */

  function goToNextEmoji() {
    if (currentEmojiIndex < recallQueue.length - 1) {
      currentEmojiIndex++;
      locked = false;
      renderRecall(null, null, true);
      return;
    }

    goToNextQuestion();
  }

  /* =========================================================
     NEXT QUESTION
     ========================================================= */

  function goToNextQuestion() {
    currentQuestionNumber++;

    if (currentQuestionNumber >= TOTAL_QUESTIONS) {
      finishLevel();
      return;
    }

    setTimeout(startQuestion, 350);
  }

  /* =========================================================
     CALCULATE ACCURACY
     ========================================================= */

  function calculateAccuracy() {
    if (!results.length) return 0;
    const correct = results.filter(r => r.correct).length;
    return correct / results.length;
  }

  /* =========================================================
     MEMORY IQ  (game score, not a clinical IQ test)
     ========================================================= */

  function calculateMemoryIQ() {
    if (!results.length) return 70;

    let weightedCorrect = 0;
    let weightedTotal = 0;

    results.forEach(result => {
      let gridWeight;
      if (result.gridSize === 2) gridWeight = 1;
      else if (result.gridSize === 3) gridWeight = 1.15;
      else if (result.gridSize === 4) gridWeight = 1.35;
      else gridWeight = 1.60;

      const weight = gridWeight * LEVELS[result.level].difficultyWeight;

      weightedTotal += weight;
      if (result.correct) weightedCorrect += weight;
    });

    const performance = weightedTotal === 0 ? 0 : weightedCorrect / weightedTotal;

    const points = [
      [0.00, 70],
      [0.30, 80],
      [0.50, 90],
      [0.65, 100],
      [0.80, 110],
      [0.90, 120],
      [1.00, 130]
    ];

    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i];
      if (performance <= x1) {
        const [x0, y0] = points[i - 1];
        const ratio = (performance - x0) / (x1 - x0);
        return Math.round(y0 + ratio * (y1 - y0));
      }
    }

    return 130;
  }

  /* =========================================================
     MEMORY LEVEL
     ========================================================= */

  function getMemoryLevel(iq) {
    if (iq >= 125) {
      return {
        title: "Exceptional Visual Memory",
        description: "Excellent ability to remember visual information and spatial positions."
      };
    }
    if (iq >= 115) {
      return {
        title: "Excellent Visual Memory",
        description: "You demonstrated very strong visual and spatial memory."
      };
    }
    if (iq >= 105) {
      return {
        title: "Strong Visual Memory",
        description: "Your visual memory performance is above average."
      };
    }
    if (iq >= 90) {
      return {
        title: "Good Visual Memory",
        description: "Your visual memory performance is in a solid range."
      };
    }
    return {
      title: "Developing Visual Memory",
      description: "Keep practicing to improve your visual and spatial memory."
    };
  }

  /* =========================================================
     GRID STATISTICS
     ========================================================= */

  function getGridAccuracy(size) {
    const gridResults = results.filter(r => r.gridSize === size);
    if (!gridResults.length) return 0;
    const correct = gridResults.filter(r => r.correct).length;
    return Math.round((correct / gridResults.length) * 100);
  }

  /* =========================================================
     FINAL RESULTS
     ========================================================= */

  function finishLevel() {
    const accuracy = calculateAccuracy();
    const accuracyPercent = Math.round(accuracy * 100);
    const iq = calculateMemoryIQ();
    const memory = getMemoryLevel(iq);

    saveBest(iq, accuracyPercent);

    render(`

      <a class="mg-back" href="home.html">← All games</a>

      <div class="mg-title">
        🧠 ${LEVELS[currentLevel].name.toUpperCase()} RESULTS
      </div>

      <div class="mg-iq-label">MEMORY POWER</div>

      <div class="mg-iq">${iq}</div>

      <div class="mg-memory-level">${memory.title}</div>

      <div class="mg-result-description">${memory.description}</div>

      <div class="mg-result-box">

        <div class="mg-stat">
          <span>Rounds</span>
          <b>${TOTAL_QUESTIONS} / ${TOTAL_QUESTIONS}</b>
        </div>

        <div class="mg-stat">
          <span>Correct Selections</span>
          <b class="mg-green">
            ${results.filter(r => r.correct).length} / ${results.length}
          </b>
        </div>

        <div class="mg-stat">
          <span>Overall Accuracy</span>
          <b>${accuracyPercent}%</b>
        </div>

        <div class="mg-stat">
          <span>2×2 Accuracy</span>
          <b>${getGridAccuracy(2)}%</b>
        </div>

        <div class="mg-stat">
          <span>3×3 Accuracy</span>
          <b>${getGridAccuracy(3)}%</b>
        </div>

        <div class="mg-stat">
          <span>4×4 Accuracy</span>
          <b>${getGridAccuracy(4)}%</b>
        </div>

        <div class="mg-stat">
          <span>5×5 Accuracy</span>
          <b>${getGridAccuracy(5)}%</b>
        </div>

      </div>

      <button class="mg-button" data-action="again">Play Again</button>

      <button class="mg-button mg-secondary" data-action="menu">Menu</button>

    `);
  }

  /* =========================================================
     PERSONAL BEST
     ========================================================= */

  function saveBest(iq, accuracy) {
    try {
      const key = "metacog_memory_best";
      const old = JSON.parse(localStorage.getItem(key) || "null");

      const current = { iq, accuracy, date: new Date().toISOString() };

      if (
        !old ||
        iq > old.iq ||
        (iq === old.iq && accuracy > old.accuracy)
      ) {
        localStorage.setItem(key, JSON.stringify(current));
      }
    } catch (error) {
      /* localStorage is optional */
    }
  }

  /* =========================================================
     ALL LEVELS MODE
     ========================================================= */

  function startAllLevels() {
    fullGameMode = true;
    fullGameLevelIndex = 0;
    startLevel(fullGameLevels[fullGameLevelIndex]);
  }

  /* =========================================================
     EVENT HANDLER
     ========================================================= */

  root.addEventListener("click", function (event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;

    if (action === "start") {
      fullGameMode = false;
      showInstructions(button.dataset.level);
      return;
    }

    if (action === "begin") {
      startLevel(button.dataset.level);
      return;
    }

    if (action === "select-cell") {
      selectCell(Number(button.dataset.position));
      return;
    }

    if (action === "again") {
      startLevel(currentLevel);
      return;
    }

    if (action === "menu") {
      fullGameMode = false;
      questionToken++;
      showMenu();
      return;
    }

    if (action === "all-levels") {
      startAllLevels();
      return;
    }
  });

  /* =========================================================
     INITIALIZE
     ========================================================= */

  showMenu();

})();