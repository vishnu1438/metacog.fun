/* Cognitive Clash (Stroop) - reaction-time test. No points, no external APIs.
   Loaded by home.html?game=cognitive-clash into <div id="stroop-root">. */
(function () {
  "use strict";

  const QUESTIONS_PER_LEVEL = 7;
  const MAX_RECENT_HISTORY = 100;
  const CANDIDATES_PER_PICK = 12;
  const PB_KEY = "cc_personal_best_v1";

  const COLORS = {
    RED: "#ff4d4d", BLUE: "#3d8bff", GREEN: "#35d07f",
    YELLOW: "#ffd93d", PURPLE: "#b56bff", ORANGE: "#ff9a3d",
  };
  const RULE_TEXT = { ink: "SELECT THE INK COLOR", word: "SELECT THE WORD" };
  const POSITIONS = ["center", "left", "right", "up", "down"];

  const LEVELS = {
    easy: {
      label: "Easy", emoji: "🟢", order: 1,
      colors: ["RED", "BLUE", "GREEN", "YELLOW"],
      rules: ["ink"], positions: ["center"], buttonCounts: [4], gap: 600,
    },
    medium: {
      label: "Medium", emoji: "🟡", order: 2,
      colors: ["RED", "BLUE", "GREEN", "YELLOW", "PURPLE", "ORANGE"],
      rules: ["ink"], positions: POSITIONS, buttonCounts: [4, 5, 6], gap: 250,
    },
    hard: {
      label: "Hard", emoji: "🔴", order: 3,
      colors: ["RED", "BLUE", "GREEN", "YELLOW", "PURPLE", "ORANGE"],
      rules: ["ink", "word"], positions: POSITIONS, buttonCounts: [6], gap: 250,
    },
  };

  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rnd(arr.length)];
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ------------------------------ generator ------------------------------ */
  const recentList = [];            // fingerprints, oldest first
  const recentSet = new Set();
  const pairUsage = new Map();      // "diff|WORD>INK|rule" -> times used
  const recentRulePatterns = [];

  function makeCandidate(diff, cfg, rule) {
    const word = pick(cfg.colors);
    const ink = pick(cfg.colors.filter((c) => c !== word));
    const answer = rule === "ink" ? ink : word;
    const n = pick(cfg.buttonCounts);
    // Always include both word and ink (the interfering option), fill the rest randomly.
    const options = new Set([word, ink]);
    const rest = shuffle(cfg.colors.filter((c) => !options.has(c)));
    while (options.size < n && rest.length) options.add(rest.pop());
    const buttonOrder = shuffle([...options]);
    const targetPosition = pick(cfg.positions);
    const fingerprint = [diff, word, ink, rule, targetPosition, buttonOrder.join(",")].join("|");
    return {
      diff, word, ink, rule, answer, targetPosition, buttonOrder, fingerprint,
      pairKey: `${diff}|${word}>${ink}|${rule}`,
    };
  }

  function generateQuestion(diff, rule) {
    const cfg = LEVELS[diff];
    let best = null;
    // Reject fingerprints seen in recent history; among fresh candidates prefer least-used combos.
    for (let attempt = 0; attempt < 20 && !best; attempt++) {
      let bestUse = Infinity;
      const fresh = [];
      for (let i = 0; i < CANDIDATES_PER_PICK; i++) {
        const c = makeCandidate(diff, cfg, rule);
        if (!recentSet.has(c.fingerprint)) fresh.push(c);
      }
      for (const c of fresh) {
        const use = pairUsage.get(c.pairKey) || 0;
        if (use < bestUse || (use === bestUse && Math.random() < 0.5)) { best = c; bestUse = use; }
      }
    }
    if (!best) best = makeCandidate(diff, cfg, rule); // practically unreachable
    recentList.push(best.fingerprint);
    recentSet.add(best.fingerprint);
    if (recentList.length > MAX_RECENT_HISTORY) recentSet.delete(recentList.shift());
    pairUsage.set(best.pairKey, (pairUsage.get(best.pairKey) || 0) + 1);
    return best;
  }

  function generateRuleSequence(diff) {
    const rules = LEVELS[diff].rules;
    if (rules.length === 1) return Array(QUESTIONS_PER_LEVEL).fill(rules[0]);
    let seq, key, tries = 0;
    do {
      seq = Array.from({ length: QUESTIONS_PER_LEVEL }, () => pick(rules));
      key = seq.join(",");
      tries++;
    } while (
      tries < 200 &&
      (seq.filter((r) => r === "ink").length < 2 ||
        seq.filter((r) => r === "word").length < 2 ||
        recentRulePatterns.includes(key))
    );
    recentRulePatterns.push(key);
    if (recentRulePatterns.length > 20) recentRulePatterns.shift();
    return seq;
  }

  /* ------------------------------ state ------------------------------ */
  const root = document.getElementById("stroop-root");
  if (!root) return;

  const completed = {};       // level -> result, this page session
  let fullMode = false;
  let run = null;             // active level run
  let accepting = false;
  let startTime = 0;
  let advanceTimer = null;

  function loadPB() { try { return JSON.parse(localStorage.getItem(PB_KEY)) || {}; } catch (e) { return {}; } }
  function savePB(pb) { try { localStorage.setItem(PB_KEY, JSON.stringify(pb)); } catch (e) { /* ignore */ } }

  /* ------------------------------ styles ------------------------------ */
  const style = document.createElement("style");
  style.textContent = `
  #stroop-root{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f2f2f2;
    background:radial-gradient(circle at top,#1a1a1a,#000)}
  #stroop-root .cc-card{width:100%;max-width:460px;background:#121212;border:1px solid #2c2c2c;border-radius:18px;
    padding:32px 28px;box-shadow:0 20px 50px rgba(0,0,0,.6);text-align:center}
  #stroop-root h1{margin:0 0 8px;font-size:26px}
  #stroop-root h2{margin:0 0 14px;font-size:22px}
  #stroop-root .muted{color:#8a8a8a;font-size:14px}
  #stroop-root .back{display:block;text-align:left;font-size:13px;color:#8a8a8a;text-decoration:none;margin-bottom:16px}
  #stroop-root .back:hover{color:#f2f2f2}
  #stroop-root button{width:100%;padding:14px;border:1px solid #2c2c2c;border-radius:10px;background:#f2f2f2;color:#000;
    font-size:16px;font-weight:600;cursor:pointer;margin-top:12px}
  #stroop-root button:hover{filter:brightness(.9)}
  #stroop-root button.secondary{background:transparent;color:#8a8a8a}
  #stroop-root button.secondary:hover{background:#1a1a1a;filter:none}
  #stroop-root .lvl{display:flex;justify-content:space-between;align-items:center;text-align:left}
  #stroop-root .box{background:#0a0a0a;border:1px solid #2c2c2c;border-radius:12px;padding:14px;margin:14px 0;text-align:left;font-size:14px;line-height:1.5}
  #stroop-root .stage{height:130px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
  #stroop-root .word{font-size:52px;font-weight:800;letter-spacing:2px;transition:none}
  #stroop-root .rule{font-size:13px;letter-spacing:2px;color:#8a8a8a;height:18px;margin-bottom:6px}
  #stroop-root .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}
  #stroop-root .grid button{margin:0;background:#1a1a1a;color:#f2f2f2;font-size:17px;padding:16px 8px}
  #stroop-root .grid button:hover{background:#262626;filter:none}
  #stroop-root .grid button:disabled{opacity:.55;cursor:default}
  #stroop-root .grid button.right{outline:2px solid #35d07f}
  #stroop-root .grid button.bad{outline:2px solid #ff5d7a}
  #stroop-root .fb{height:44px;margin-top:14px;font-size:15px}
  #stroop-root .good{color:#35d07f}#stroop-root .bad-t{color:#ff5d7a}
  #stroop-root table{width:100%;border-collapse:collapse;font-size:14px;text-align:left}
  #stroop-root td{padding:4px 6px;border-bottom:1px solid #1e1e1e}
  #stroop-root td.r{text-align:right;font-variant-numeric:tabular-nums}
  #stroop-root .stat{display:flex;justify-content:space-between;padding:4px 0;font-size:15px}
  #stroop-root .pb{margin:12px 0;font-weight:700;color:#ffd93d}
  `;
  document.head.appendChild(style);

  /* ------------------------------ helpers ------------------------------ */
  const ms = (v) => `${Math.round(v)} ms`;
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
  const swatch = (name) => `<span style="color:${COLORS[name]};font-weight:800">${name}</span>`;
  function render(html) { root.innerHTML = `<div class="cc-card">${html}</div>`; }
  const backLink = `<a class="back" href="home.html">&larr; All games</a>`;

  /* ------------------------------ screens ------------------------------ */
  function menuScreen() {
    clearTimeout(advanceTimer);
    fullMode = false;
    const btn = (k) => {
      const l = LEVELS[k];
      const done = completed[k] ? ` <span class="good">✓ avg ${ms(completed[k].avg)}</span>` : "";
      return `<button class="secondary lvl" data-action="instr" data-level="${k}"><span>${l.emoji} ${l.label} · ${QUESTIONS_PER_LEVEL} questions</span><span>${done}</span></button>`;
    };
    render(`${backLink}
      <h1>🎨 Cognitive Clash</h1>
      <p class="muted">Tests reaction time, selective attention and inhibitory control.<br>No points. No time limit. Just your reaction time.</p>
      ${btn("easy")}${btn("medium")}${btn("hard")}
      <button data-action="full">Play all three levels</button>`);
  }

  function instructionScreen(level) {
    const l = LEVELS[level];
    let body;
    if (level === "hard") {
      body = `<p><b>The rule changes between questions.</b> Read the instruction above the word every time.</p>
        <p>${'<span class="muted">SELECT THE INK COLOR</span>'} — ${swatch("RED").replace(COLORS.RED, COLORS.BLUE)} shown in blue → choose <b style="color:${COLORS.BLUE}">BLUE</b></p>
        <p>${'<span class="muted">SELECT THE WORD</span>'} — same word → choose <b>RED</b></p>`;
    } else {
      body = `<p><b>Look at the COLOR of the word, not the word itself.</b></p>
        <p>Example: <span style="color:${COLORS.BLUE};font-weight:800">RED</span> — the word says RED, but the ink is BLUE. Select <b style="color:${COLORS.BLUE}">BLUE</b>.</p>
        ${level === "medium" ? '<p>Medium has 6 colors, a varying number of buttons, shifting word positions and faster transitions.</p>' : ""}`;
    }
    render(`${backLink}<h2>${l.emoji} ${l.label.toUpperCase()} — Instructions</h2>
      <div class="box">${body}
        <p>Tap a color button to answer. Your reaction time starts when the question appears and ends when you answer.</p>
        <p>There is <b>no overall time limit</b> — ${QUESTIONS_PER_LEVEL} questions, take as long as you need.</p>
      </div>
      <p><b>Ready?</b></p>
      <button data-action="start" data-level="${level}">Start ${l.label}</button>
      <button class="secondary" data-action="menu">Back</button>`);
  }

  function startLevel(level) {
    const rules = generateRuleSequence(level);
    run = { level, rules, index: 0, answers: [], current: null };
    nextQuestion();
  }

  function nextQuestion() {
    clearTimeout(advanceTimer);
    accepting = false;
    if (run.index >= QUESTIONS_PER_LEVEL) return finishLevel();
    const cfg = LEVELS[run.level];
    const q = generateQuestion(run.level, run.rules[run.index]);
    q.id = `${run.level}-${run.index + 1}`;
    run.current = q;

    // Blank the previous question first, then show the new one after the level's transition gap.
    drawFrame(q, false);
    advanceTimer = setTimeout(() => {
      drawFrame(q, true);
      // Two rAFs => the new question has actually been painted before the timer starts.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        startTime = performance.now();
        accepting = true;
      }));
    }, cfg.gap);
  }

  function offset(pos) {
    return { center: "0,0", left: "-70px,0", right: "70px,0", up: "0,-24px", down: "0,24px" }[pos];
  }

  function drawFrame(q, visible) {
    const l = LEVELS[run.level];
    const stage = visible
      ? `<div class="word" style="color:${COLORS[q.ink]};transform:translate(${offset(q.targetPosition)})">${q.word}</div>`
      : "";
    const buttons = q.buttonOrder
      .map((c) => `<button data-action="answer" data-color="${c}" ${visible ? "" : "disabled"}>${c}</button>`)
      .join("");
    render(`<div class="muted">🎨 COGNITIVE CLASH · ${l.emoji} ${l.label.toUpperCase()}</div>
      <p class="muted" style="margin:6px 0 14px">Question ${run.index + 1} / ${QUESTIONS_PER_LEVEL}</p>
      <div class="rule">${visible ? RULE_TEXT[q.rule] : ""}</div>
      <div class="stage">${stage}</div>
      <div class="grid">${buttons}</div>
      <div class="fb" id="cc-fb"></div>`);
  }

  function onAnswer(color) {
    if (!accepting) return;
    const rt = performance.now() - startTime; // raw, unrounded
    accepting = false;
    const q = run.current;
    const correct = color === q.answer;
    run.answers.push({ id: q.id, rule: q.rule, chosen: color, correct, rt });

    root.querySelectorAll(".grid button").forEach((b) => {
      b.disabled = true;
      if (b.dataset.color === q.answer) b.classList.add("right");
      else if (b.dataset.color === color) b.classList.add("bad");
    });
    const fb = document.getElementById("cc-fb");
    fb.innerHTML = correct
      ? `<span class="good">✓ Correct</span><br>⚡ Reaction Time: <b>${ms(rt)}</b>`
      : `<span class="bad-t">❌ Incorrect</span> — correct answer: ${swatch(q.answer)}<br>⚡ Reaction Time: <b>${ms(rt)}</b>`;

    run.index++;
    advanceTimer = setTimeout(nextQuestion, correct ? 700 : 1400);
  }

  function summarize(level, answers) {
    const good = answers.filter((a) => a.correct).map((a) => a.rt);
    return {
      level, answers,
      correct: good.length,
      accuracy: (good.length / answers.length) * 100,
      avg: good.length ? mean(good) : null,
      fastest: good.length ? Math.min(...good) : null,
      consistency: good.length > 1 ? sd(good) : null,
    };
  }

  function finishLevel() {
    const res = summarize(run.level, run.answers);
    completed[run.level] = res;
    const pb = loadPB();
    let pbMsg = "";
    if (res.avg !== null) {
      const prev = pb[run.level];
      if (prev === undefined) { pbMsg = `<div class="muted">First attempt recorded as your personal best.</div>`; pb[run.level] = res.avg; }
      else if (res.avg < prev) { pbMsg = `<div class="pb">🏆 NEW PERSONAL BEST!</div>`; pb[run.level] = res.avg; }
      savePB(pb);
    }
    const l = LEVELS[run.level];
    const rows = res.answers
      .map((a, i) => `<tr><td>Q${i + 1}</td><td class="r">${ms(a.rt)}</td><td class="r">${a.correct ? "✓" : "✗"}</td></tr>`)
      .join("");
    const nextKey = { easy: "medium", medium: "hard" }[run.level];
    let actions;
    if (fullMode && nextKey) {
      actions = `<button data-action="instr" data-level="${nextKey}">Next: ${LEVELS[nextKey].label}</button>`;
    } else if (fullMode && !nextKey) {
      actions = `<button data-action="overall">See overall results</button>`;
    } else {
      actions = `<button data-action="instr" data-level="${run.level}">Play ${l.label} again</button>`;
    }
    render(`<h2>🎨 ${l.label.toUpperCase()} RESULTS</h2>
      <div class="stat"><span>Questions</span><b>${res.answers.length} / ${QUESTIONS_PER_LEVEL}</b></div>
      <div class="stat"><span>Correct</span><b>${res.correct} / ${res.answers.length}</b></div>
      <div class="stat"><span>Accuracy</span><b>${res.accuracy.toFixed(1)}%</b></div>
      <div class="box"><table>${rows}</table></div>
      <div class="stat"><span>Average Reaction Time</span><b>${res.avg === null ? "—" : ms(res.avg)}</b></div>
      <div class="stat"><span>Fastest Reaction</span><b>${res.fastest === null ? "—" : ms(res.fastest)}</b></div>
      <div class="stat"><span>Consistency (std dev)</span><b>${res.consistency === null ? "—" : ms(res.consistency)}</b></div>
      <div class="stat"><span>Personal Best (avg)</span><b>${pb[run.level] === undefined ? "—" : ms(pb[run.level])}</b></div>
      <p class="muted" style="margin:8px 0 0">Averages use correct answers only.</p>
      ${pbMsg}${actions}
      <button class="secondary" data-action="menu">Menu</button>`);
  }

  function overallScreen() {
    const keys = ["easy", "medium", "hard"];
    const all = keys.map((k) => completed[k]);
    const good = all.flatMap((r) => r.answers.filter((a) => a.correct).map((a) => a.rt));
    const total = all.reduce((s, r) => s + r.answers.length, 0);
    const avg = good.length ? mean(good) : null;
    const fastest = good.length ? Math.min(...good) : null;
    const acc = (good.length / total) * 100;

    const pb = loadPB();
    let pbMsg = "";
    if (avg !== null) {
      const prev = pb.overall;
      if (prev === undefined) { pbMsg = `<div class="muted">First full run recorded as your personal best.</div>`; pb.overall = avg; }
      else if (avg < prev) { pbMsg = `<div class="pb">🏆 NEW PERSONAL BEST!</div>`; pb.overall = avg; }
      savePB(pb);
    }
    const trend = (a, b, label) => {
      if (a.avg === null || b.avg === null) return "";
      const d = a.avg - b.avg;
      return `<div class="stat"><span>${label}</span><b>${d >= 0 ? "↓" : "↑"} ${Math.round(Math.abs(d))} ms ${d >= 0 ? "faster" : "slower"}</b></div>`;
    };
    const lvlRows = keys.map((k) =>
      `<div class="stat"><span>${LEVELS[k].emoji} ${LEVELS[k].label}</span><b>${completed[k].avg === null ? "—" : ms(completed[k].avg)}</b></div>`).join("");

    render(`<h2>🎨 COGNITIVE CLASH COMPLETE</h2>
      <p class="muted">Average Reaction per level</p>${lvlRows}
      <div class="box" style="text-align:left">
        <div class="stat"><span>Overall Average</span><b>${avg === null ? "—" : ms(avg)}</b></div>
        <div class="stat"><span>Fastest Reaction</span><b>${fastest === null ? "—" : ms(fastest)}</b></div>
        <div class="stat"><span>Accuracy</span><b>${acc.toFixed(1)}%</b></div>
        <div class="stat"><span>Personal Best (overall avg)</span><b>${pb.overall === undefined ? "—" : ms(pb.overall)}</b></div>
      </div>
      ${trend(completed.easy, completed.medium, "Easy → Medium")}
      ${trend(completed.medium, completed.hard, "Medium → Hard")}
      ${pbMsg}
      <button data-action="full">Play all three again</button>
      <button class="secondary" data-action="menu">Menu</button>`);
  }

  /* ------------------------------ events ------------------------------ */
  root.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const a = t.dataset.action;
    if (a === "answer") return onAnswer(t.dataset.color);
    if (a === "menu") return menuScreen();
    if (a === "instr") return instructionScreen(t.dataset.level);
    if (a === "start") return startLevel(t.dataset.level);
    if (a === "full") { fullMode = true; delete completed.easy; delete completed.medium; delete completed.hard; return instructionScreen("easy"); }
    if (a === "overall") return overallScreen();
  });

  menuScreen();
})();