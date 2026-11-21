const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = "codeshala-mentor-v1";
const FALLBACK_CURRICULUM = {
  Python: ["Variables & Data Types", "Operators", "Conditionals", "Loops", "Functions", "Lists & Dicts", "Strings", "File Handling", "OOP"],
  HTML: ["Structure & Tags", "Links & Images", "Lists & Tables", "Forms", "Semantic HTML"],
  CSS: ["Selectors", "Box Model", "Flexbox", "Grid", "Responsive Design"],
  JavaScript: ["Variables & Types", "Functions", "Arrays & Objects", "DOM Manipulation", "Events", "Async & Fetch"],
};
const emptyState = { name: "", subject: "Python", level: "Beginner", theme: "dark", results: [], completed: [], chat: [] };
let state;
try {
  state = { ...emptyState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
} catch {
  state = { ...emptyState };
}
state.results = Array.isArray(state.results) ? state.results : [];
state.completed = Array.isArray(state.completed) ? state.completed : [];
state.chat = Array.isArray(state.chat) ? state.chat : [];
state.theme = state.theme === "light" ? "light" : "dark";

let curriculum = FALLBACK_CURRICULUM;
let recommendation = null;
let quizSession = null;
let currentView = "dashboard";
let recognition = null;

const save = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Browser storage is unavailable; this session's progress will not persist.", error);
    setConnectionStatus("offline", "Session-only progress · browser storage unavailable");
  }
};
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const subjectResults = () => state.results.filter((result) => result.subject === state.subject);
const topicKey = (topic) => `${state.subject}:${topic}`;
const isComplete = (topic) => state.completed.includes(topicKey(topic));
const resultPercent = (result) => Math.round((result.score / result.total) * 100);
const storeState = () => save();

async function api(path, body) {
  // Local-first fallback: the experience remains fully usable when FastAPI is not running.
  if (path === "/api/health") {
    return { status: "ok", ai_configured: false, mode: "local" };
  }
  if (path === "/api/curriculum") {
    return FALLBACK_CURRICULUM;
  }
  if (path === "/api/learning/recommend") {
    return localRecommendation(body);
  }
  if (path === "/api/chat") {
    return { demo: true, reply: localTutorReply(body), fallback_reason: "Offline local mentor mode" };
  }
  if (path === "/api/quiz/generate") {
    return {
      subject: body.subject,
      topic: body.topic,
      level: body.level,
      demo: true,
      fallback_reason: "Offline curated questions",
      questions: localQuizQuestions(body.subject, body.topic, body.count),
    };
  }
  if (path === "/api/quiz/evaluate") {
    const results = body.questions.map((question, index) => ({
      correct: body.answers[index] === question.answer,
      chosen: body.answers[index],
      answer: question.answer,
      explanation: question.explanation,
    }));
    const score = results.filter((item) => item.correct).length;
    const total = results.length;
    return { score, total, percent: Math.round((score / total) * 100), results };
  }
  if (path === "/api/code/explain") {
    return { demo: true, reply: localCodeReview(body), fallback_reason: "Offline static analysis mode" };
  }
  throw new Error(`This offline action is not available: ${path}`);
}

function renderRichText(text) {
  return String(text).split(/(```[\s\S]*?```)/g).map((part) => {
    if (part.startsWith("```")) {
      const code = part.replace(/^```[\w-]*\n?/, "").replace(/```$/, "");
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
    return escapeHtml(part)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
  }).join("");
}

function localRecommendation(body) {
  const topics = curriculum[body.subject] || FALLBACK_CURRICULUM[body.subject] || [];
  const status = {};
  const level = {};
  const percent = {};
  for (const topic of topics) {
    const attempts = (body.results || []).filter((result) => result.topic === topic).slice(-3);
    if (!attempts.length) {
      status[topic] = "new";
      continue;
    }
    const average = Math.round(attempts.reduce((sum, result) => sum + (result.score / result.total) * 100, 0) / attempts.length);
    percent[topic] = average;
    if (average < 60) {
      status[topic] = "weak";
      level[topic] = "Beginner";
    } else if (average < 80) {
      status[topic] = "learning";
      level[topic] = "Intermediate";
    } else {
      status[topic] = "strong";
      level[topic] = "Advanced";
    }
  }
  const weak = topics.filter((topic) => status[topic] === "weak");
  const newTopics = topics.filter((topic) => status[topic] === "new");
  const building = topics.filter((topic) => status[topic] === "learning");
  const ranked = [...weak, ...newTopics, ...building, ...topics.filter((topic) => status[topic] === "strong")];
  const next = [...new Set(ranked)].slice(0, 3).map((topic) => ({
    topic,
    reason: status[topic] === "weak"
      ? "Recent accuracy is below 60%. Start with a beginner review."
      : status[topic] === "new"
        ? "This topic has not been assessed yet. A quick quiz will establish your baseline."
        : status[topic] === "learning"
          ? "Recent accuracy is improving. Practice at an intermediate level."
          : "Strong progress. Try an advanced challenge or mark the lesson complete.",
  }));
  return { weak, status, level, percent, next };
}

function localQuizQuestions(subject, topic, count) {
  const sets = {
    Python: {
      "Loops": [
        ["Which loop visits each item in a list?", ["for", "if", "def", "try"], 0, "A for loop iterates over each item in an iterable."],
        ["What does range(3) produce?", ["0, 1, 2", "1, 2, 3", "1, 2", "0, 1"], 0, "Python range starts at zero and stops before the limit."],
        ["Which keyword exits a loop immediately?", ["break", "pass", "continue", "return"], 0, "break ends the nearest loop."]
      ],
      "Variables & Data Types": [
        ["Which value is a string?", ["42", "True", "'hello'", "3.14"], 2, "Text inside quotes is a string."],
        ["What does type(3.14) return?", ["int", "float", "str", "bool"], 1, "A number with a decimal point is a float."],
        ["Which name is valid in Python?", ["2name", "user-name", "user_name", "class"], 2, "Variable names should not start with digits or contain hyphens."]
      ],
    },
    HTML: {
      "Structure & Tags": [
        ["Where does visible page content belong?", ["<head>", "<body>", "<meta>", "<title>"], 1, "The body contains visible content."],
        ["Which declaration identifies HTML5?", ["<!doctype html>", "<html5>", "<document>", "<!html>"], 0, "The HTML5 doctype uses <!doctype html>."],
        ["Which element sets the tab title?", ["<header>", "<title>", "<caption>", "<h1>"], 1, "The title element belongs in head."]
      ],
    },
    JavaScript: {
      "Variables & Types": [
        ["Which declaration is block-scoped?", ["var", "let", "global", "define"], 1, "let is scoped to the nearest block."],
        ["Which declaration cannot be reassigned?", ["let", "var", "const", "static"], 2, "const prevents reassignment of the binding."],
        ["What does typeof 'hi' return?", ["text", "string", "char", "object"], 1, "typeof reports the primitive type."]
      ],
    },
  };
  const curated = sets[subject]?.[topic];
  if (curated) {
    return curated.slice(0, Math.min(count, curated.length)).map(([q, options, answer, explanation]) => ({ q, options, answer, explanation }));
  }
  return Array.from({ length: Math.min(count, 5) }, (_, index) => ({
    q: `Which statement best describes ${topic} in ${subject}?`,
    options: [
      `It is a core concept used to build and understand ${subject} programs`,
      "It is unrelated to the subject",
      "It can only be used by expert developers",
      "It is a hardware component",
    ],
    answer: 0,
    explanation: `${topic} is a practical ${subject} concept. Study examples, then explain the idea in your own words.`,
  }));
}

function localTutorReply(body) {
  const prompt = body.message.toLowerCase();
  const language = body.language;
  const hinglish = language === "Hinglish";
  const hindi = language === "Hindi";
  if (prompt.includes("loop") || prompt.includes("repeat") || prompt.includes("iteration")) {
    const intro = hindi
      ? "Loop ek code block ko baar-baar chalata hai."
      : hinglish
        ? "Loop ek code block ko repeat karta hai."
        : "A loop repeats a block of code.";
    return `${intro}\n\n\`\`\`python\nfor number in range(3):\n    print(number)\n\`\`\`\n\n${hindi ? "Is code mein" : hinglish ? "Is example mein" : "In this example"}, \`range(3)\` produces 0, 1, and 2. ${hindi ? "Har value ke liye loop ek baar chalta hai." : hinglish ? "Har value ke liye loop ek baar run hota hai." : "The loop runs once for each value."}\n\n${hindi ? "अगला कदम:" : hinglish ? "Quick check:" : "Quick check:"} ${hindi ? "range(1, 4) कौन-se values banayega?" : hinglish ? "range(1, 4) कौन-si values produce karega?" : "What values would range(1, 4) produce?"}`;
  }
  if (prompt.includes("variable") || prompt.includes("let") || prompt.includes("const")) {
    const intro = hinglish ? "Variable ek naam diya hua value container hai." : hindi ? "Variable ek named value container hai." : "A variable is a named place to store a value.";
    return `${intro}\n\n\`\`\`javascript\nlet score = 10;\nconst name = \"CodeShala\";\nscore = score + 5;\n\`\`\`\n\n${hinglish ? "\`let\` ko reassignment ke liye use karo aur \`const\` ko fixed value ke liye." : "Use \`let\` for values that change and \`const\` for bindings that stay fixed."}\n\nQuick check: which binding would you use for a player's changing score?`;
  }
  if (prompt.includes("flex") || prompt.includes("box") || prompt.includes("css")) {
    return hinglish
      ? "CSS Flexbox ek row ya column mein elements align karne ka powerful layout system hai.\n\n```css\n.container {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n}\n```\n\n`justify-content` main axis control karta hai aur `align-items` cross axis control karta hai.\n\nQuick check: equal horizontal spacing ke liye flex direction mein kya alignment helpful hoga?"
      : "CSS controls how an element looks and where it appears. Start with a selector, then add declarations inside braces.\n\n```css\n.card {\n  padding: 16px;\n  border-radius: 12px;\n}\n```\n\nQuick check: which property creates space inside a border?";
  }
  if (prompt.includes("html") || prompt.includes("tag") || prompt.includes("link")) {
    return hinglish
      ? "HTML page ki structure batata hai. `<a>` element link banata hai aur `href` destination deta hai.\n\n```html\n<a href=\"https://example.com\">Visit site</a>\n```\n\nTags ke beech visible text hota hai aur href browser ko batata hai ki kahan jana hai.\n\nQuick check: different page par jane ke liye kis attribute ko change karoge?"
      : "HTML describes page structure using semantic elements.\n\n```html\n<main>\n  <h1>My Learning Page</h1>\n</main>\n```\n\nUse semantic tags that explain the role of content.\n\nQuick check: what is the purpose of a main element?";
  }
  const base = hinglish
    ? `Aapka ${body.subject} sawaal "${body.message}" hai. Pehle concept ko simple definition, ek tiny example, aur ek practice step mein split karo.`
    : hindi
      ? `Aapka ${body.subject} prashn "${body.message}" hai. Pehle concept ko simple paribhasha aur ek chhote example mein samjhein.`
      : `Your ${body.subject} question is: "${body.message}". Break it into a clear definition, a tiny example, and one practice step.`;
  return `${base}\n\n1. Identify the smallest core idea.\n2. Read one short example.\n3. Change one value and predict the result.\n4. Explain the result in your own words.\n\nQuick check: which example would you try first?`;
}

function localCodeReview(body) {
  const code = body.code;
  const lines = code.split(/\r?\n/);
  const findings = [];
  if (body.language === "Python") {
    if (/^\s*(if|for|while|def)\b[^:\n]*$/m.test(code)) findings.push("A Python `if`, `for`, `while`, or `def` header may be missing its final colon.");
    if (/^([ ]*)[^#\n]*=[^=\n]*$/m.test(code) && /print\s*\([^)]*\)/.test(code) === false) findings.push("Check variable assignment and print syntax.");
  }
  if (body.language === "JavaScript") {
    if (/^(?!.*[;{}]\s*$).*console\.log/m.test(code)) findings.push("Review JavaScript statement and semicolon style.");
    if (/==(?!=)/.test(code)) findings.push("Prefer strict `===` comparison unless type coercion is intentionally needed.");
  }
  if (body.language === "HTML") {
    const opens = (code.match(/<[a-z][^/>]*>/gi) || []).length;
    const closes = (code.match(/<\/[a-z][^>]*>/gi) || []).length;
    if (opens > closes + 2) findings.push("Possible unmatched opening and closing HTML tags.");
    if (/alt\s*=/.test(code) === false && /<img\b/i.test(code)) findings.push("The `<img>` element should include meaningful alt text.");
  }
  if (body.language === "CSS") {
    if (/{[\s\S]*?(?<!})$/m.test(code)) findings.push("Check that every CSS rule closes with `}`.");
  }
  if (!findings.length) findings.push("No obvious syntax pattern was detected in this static review. Test small examples in a trusted runtime.");
  const heading = body.output_language === "Hindi" ? "स्थैतिक Code Review" : body.output_language === "Hinglish" ? "Static Code Review" : "Static Code Review";
  return `**${heading}**\n\n- This analysis is local and the code was **not executed**.\n- Reviewed ${lines.length} line${lines.length === 1 ? "" : "s"}.\n\n**Likely observations**\n${findings.map((item) => `- ${item}`).join("\n")}\n\n**Safer next step**\n- Explain what one line is supposed to do.\n- Review values and indentation in small sections.\n- Test in an isolated runtime before claiming the program works.\n\n\`\`\`${body.language.toLowerCase()}\n${code}\n\`\`\``;
}

function selectedResults() {
  return subjectResults().filter((result) => curriculum[state.subject]?.includes(result.topic));
}

async function refreshRecommendation() {
  try {
    recommendation = await api("/api/learning/recommend", {
      subject: state.subject,
      results: selectedResults().map(({ topic, score, total }) => ({ topic, score, total })),
      completed: curriculum[state.subject].filter(isComplete),
    });
  } catch {
    recommendation = null;
  }
}

function navigate(view) {
  if (!$("#view-" + view)) return;
  currentView = view;
  $$(".view").forEach((section) => {
    const active = section.id === `view-${view}`;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  const labels = { dashboard: "Overview", tutor: "AI tutor", quiz: "Practice quiz", roadmap: "Learning path", code: "Code clinic", analytics: "Progress" };
  $("#current-page").textContent = labels[view];
  $("#sidebar").classList.remove("open");
  $("#scrim").classList.remove("visible");
  $("#menu-button").setAttribute("aria-expanded", "false");

  if (view === "dashboard") renderDashboard();
  if (view === "roadmap") renderRoadmap();
  if (view === "analytics") renderAnalytics();
  if (view === "quiz") prepareQuiz();
  if (view === "tutor") renderChatHistory();
}

function renderDashboard() {
  const topics = curriculum[state.subject] || [];
  const results = selectedResults();
  const completedCount = topics.filter(isComplete).length;
  const totalScore = results.reduce((sum, result) => sum + result.score, 0);
  const totalAnswers = results.reduce((sum, result) => sum + result.total, 0);
  const average = totalAnswers ? Math.round((totalScore / totalAnswers) * 100) : null;
  const recentTopics = [...new Set(results.slice().reverse().map((result) => result.topic))].slice(0, 4);
  const topicBars = recentTopics.length
    ? `<div class="topic-progress">${recentTopics.map((topic) => {
      const attempts = results.filter((result) => result.topic === topic).slice(-3);
      const score = Math.round(attempts.reduce((sum, result) => sum + resultPercent(result), 0) / attempts.length);
      return `<div class="topic-progress-row"><span>${escapeHtml(topic)}</span><div class="progress-track"><i style="width:${score}%"></i></div><small>${score}%</small></div>`;
    }).join("")}</div>`
    : `<div class="empty-state"><strong>Your first signal starts here.</strong>Take a short quiz to see topic-by-topic progress.</div>`;
  const weakTopics = recommendation?.weak || [];
  const next = recommendation?.next || [];
  const recMarkup = next.length
    ? `<div class="recommend-list">${next.slice(0, 3).map((item) => `<div class="recommend-item"><div><strong>${escapeHtml(item.topic)}</strong><p>${escapeHtml(item.reason)}</p></div><button class="small-action" data-action="learn" data-topic="${escapeHtml(item.topic)}">Study</button></div>`).join("")}</div>`
    : `<div class="empty-state"><strong>No next step yet.</strong>Complete a quiz and your path will update from your score.</div>`;
  const weakMarkup = weakTopics.length
    ? `<div class="weak-list">${weakTopics.map((topic) => `<div class="weak-item"><span class="weak-topic">${escapeHtml(topic)}</span><span class="status-chip weak">Needs practice</span></div>`).join("")}</div>`
    : `<div class="empty-state"><strong>No weak topics detected.</strong>${results.length ? "Your recent scores are holding up." : "Weak spots appear after your quiz attempts."}</div>`;
  const latest = results.at(-1);
  const latestText = latest
    ? `Last attempt: ${escapeHtml(latest.topic)} · ${latest.score}/${latest.total} correct. Offline quiz; your answers saved on this device.`
    : "Your personal learning path gets more specific with every quiz you take.";

  $("#view-dashboard").innerHTML = `
    <div class="hero-row"><div><span class="eyebrow">YOUR PERSONAL LEARNING SPACE</span><h1 id="welcome-title">Welcome${state.name ? `, ${escapeHtml(state.name)}` : " to CodeShala"}.</h1><p>Small steps, useful feedback, and a learning path that responds to you.</p></div><div class="hero-actions"><span class="subject-chip">${escapeHtml(state.subject)} · ${escapeHtml(state.level)}</span><button class="primary-button" data-action="start-quiz">Take a quick quiz <span>↗</span></button></div></div>
    <div class="stat-grid">
      <article class="stat-card"><div class="stat-head"><span>LESSONS COMPLETED</span><span class="stat-icon">✓</span></div><div class="stat-value">${completedCount}<small>of ${topics.length}</small></div><div class="progress-track"><i style="width:${topics.length ? completedCount / topics.length * 100 : 0}%"></i></div></article>
      <article class="stat-card stat-accent-violet"><div class="stat-head"><span>QUIZ ACCURACY</span><span class="stat-icon">%</span></div><div class="stat-value">${average === null ? "—" : `${average}%`}</div><div class="stat-foot">${results.length ? `${results.length} real attempt${results.length === 1 ? "" : "s"} saved` : "No quiz attempts yet"}</div></article>
      <article class="stat-card stat-accent-coral"><div class="stat-head"><span>FOCUS TOPICS</span><span class="stat-icon">◎</span></div><div class="stat-value">${weakTopics.length}</div><div class="stat-foot">${results.length ? "Based on recent quiz performance" : "Appears after your first quiz"}</div></article>
      <article class="stat-card stat-accent-lime"><div class="stat-head"><span>QUIZZES TAKEN</span><span class="stat-icon">◇</span></div><div class="stat-value">${results.length}</div><div class="stat-foot">Across ${new Set(results.map((result) => result.topic)).size} topic${new Set(results.map((result) => result.topic)).size === 1 ? "" : "s"}</div></article>
    </div>
    <div class="dashboard-grid">
      <article class="surface"><div class="surface-heading"><div><h2>Your learning signals</h2><p>Recent accuracy by topic, from your own quiz attempts</p></div><span class="subject-chip">${escapeHtml(state.subject)}</span></div>${topicBars}</article>
      <article class="surface"><div class="surface-heading"><div><h2>Needs a second look</h2><p>Topics below 60% recent accuracy</p></div></div>${weakMarkup}</article>
    </div>
    <div class="dashboard-grid" style="margin-top:13px">
      <article class="surface"><div class="surface-heading"><div><h2>Suggested next</h2><p>Ordered from your learning history and topic coverage</p></div><button class="text-button" data-action="view-roadmap">Full path ↗</button></div>${recMarkup}</article>
      <article class="surface"><div class="surface-heading"><div><h2>Last session</h2><p>A little context goes a long way</p></div><span class="stat-icon">↺</span></div><p style="margin:0;color:var(--muted);font-size:11px">${latestText}</p></article>
    </div>
    <div class="activity-strip"><span class="activity-mark">✳</span><div><strong>Learn. Practice. Improve.</strong><p>Your answers shape the next lesson. Sample quizzes are labeled and attempts you submit still count as your real results.</p></div></div>`;
}

function renderRoadmap() {
  const topics = curriculum[state.subject] || [];
  const status = recommendation?.status || {};
  const levels = recommendation?.level || {};
  const percents = recommendation?.percent || {};
  $("#view-roadmap").innerHTML = `
    <div class="roadmap-intro"><div><span class="eyebrow">YOUR SUBJECT, YOUR PACE</span><h1 id="roadmap-title">${escapeHtml(state.subject)} learning path.</h1><p>Quiz status reflects your last three attempts per topic. Mark a lesson complete when you finish it.</p></div><button class="primary-button" data-action="start-quiz">Practice a topic <span>↗</span></button></div>
    <div class="roadmap-list">${topics.map((topic, index) => {
      const topicStatus = status[topic] || "new";
      const done = isComplete(topic);
      const next = recommendation?.next?.find((item) => item.topic === topic);
      const explanation = next?.reason || (topicStatus === "strong" ? "Strong recent scores. Move forward or try a challenge." : "Complete a quiz to get a performance-based recommendation.");
      return `<article class="path-row ${topicStatus} ${done ? "done" : ""}"><span class="path-index">${done ? "✓" : String(index + 1).padStart(2, "0")}</span><div class="path-main"><strong>${escapeHtml(topic)}</strong><p>${escapeHtml(explanation)}</p></div><div class="path-meta"><span class="status-chip ${topicStatus}">${topicStatus}${levels[topic] ? ` · ${levels[topic]}` : ""}</span>${percents[topic] !== undefined ? `<span class="path-percent">${percents[topic]}%</span>` : ""}<div class="path-actions"><button class="small-action" data-action="learn" data-topic="${escapeHtml(topic)}">Learn</button><button class="small-action" data-action="quiz-topic" data-topic="${escapeHtml(topic)}">Quiz</button><button class="small-action" data-action="toggle-complete" data-topic="${escapeHtml(topic)}">${done ? "Undo" : "Done"}</button></div></div></article>`;
    }).join("")}</div>
    <div class="roadmap-legend"><span><i class="legend-dot weak"></i>Needs review</span><span><i class="legend-dot learning"></i>Building confidence</span><span><i class="legend-dot strong"></i>Strong</span><span><i class="legend-dot new"></i>Not assessed</span></div>`;
}

function prepareQuiz() {
  const topicSelect = $("#quiz-topic");
  const activeTopic = topicSelect.value;
  topicSelect.innerHTML = (curriculum[state.subject] || []).map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`).join("");
  const suggested = recommendation?.next?.[0]?.topic;
  if ((curriculum[state.subject] || []).includes(activeTopic)) topicSelect.value = activeTopic;
  else if (suggested) topicSelect.value = suggested;
  updateQuizHint();
}

function updateQuizHint() {
  const topic = $("#quiz-topic").value;
  const suggested = recommendation?.level?.[topic];
  if (suggested) {
    $("#quiz-level").value = suggested;
    $("#quiz-hint").textContent = `Suggested difficulty: ${suggested}, based on your recent scores for ${topic}.`;
  } else {
    $("#quiz-hint").textContent = "This topic has no quiz history yet. Your first score sets a baseline.";
  }
}

async function generateQuiz() {
  const button = $("#generate-quiz");
  const content = $("#quiz-content");
  button.disabled = true;
  content.innerHTML = `<div class="empty-state"><strong>Preparing your questions...</strong>Using ${isDemoMode ? "curated sample content" : "your selected level"}.</div>`;
  try {
    quizSession = await api("/api/quiz/generate", {
      subject: state.subject,
      topic: $("#quiz-topic").value,
      level: $("#quiz-level").value,
      count: 5,
    });
    renderQuizQuestions();
  } catch (error) {
    content.innerHTML = `<div class="empty-state"><strong>Could not build this quiz.</strong>${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
}

function renderQuizQuestions() {
  if (!quizSession) return;
  const notice = quizSession.demo
    ? `<div class="demo-notice">OFFLINE QUIZ · ${quizSession.questions.length} local practice questions. No AI or backend is used; your submitted answers still update your progress.</div>`
    : `<div class="subject-chip">AI-generated · ${escapeHtml(quizSession.level)}</div>`;
  $("#quiz-content").innerHTML = `${notice}${quizSession.questions.map((question, index) => `<article class="quiz-question"><div class="question-count">QUESTION ${String(index + 1).padStart(2, "0")}</div><h3 class="question-text">${escapeHtml(question.q)}</h3><div class="option-list">${question.options.map((option, optionIndex) => `<label class="quiz-option"><input type="radio" name="question-${index}" value="${optionIndex}"><span>${escapeHtml(option)}</span></label>`).join("")}</div></article>`).join("")}<button class="primary-button quiz-submit" data-action="submit-quiz">Check my answers <span>↗</span></button>`;
}

async function submitQuiz() {
  if (!quizSession) return;
  const answers = quizSession.questions.map((_, index) => {
    const selected = $(`input[name="question-${index}"]:checked`, $("#quiz-content"));
    return selected ? Number(selected.value) : -1;
  });
  if (answers.includes(-1)) {
    $("#quiz-hint").textContent = "Choose an answer for each question before checking your results.";
    $("#quiz-hint").style.color = "var(--coral)";
    return;
  }
  const submitButton = $("[data-action='submit-quiz']");
  if (submitButton) submitButton.disabled = true;
  try {
    const outcome = await api("/api/quiz/evaluate", { questions: quizSession.questions, answers });
    const result = {
      subject: quizSession.subject,
      topic: quizSession.topic,
      level: quizSession.level,
      score: outcome.score,
      total: outcome.total,
      date: Date.now(),
      source: quizSession.demo ? "demo" : "ai",
    };
    state.results.push(result);
    save();
    await refreshRecommendation();
    $("#quiz-hint").style.color = "";
    $("#quiz-content").innerHTML = `<div class="quiz-result-head"><div class="score-ring">${outcome.percent}%</div><div><strong>${outcome.score} of ${outcome.total} correct</strong><p>${quizSession.demo ? "Offline question set; your answers update your learning history." : "Your result is saved. The roadmap now reflects this attempt."}</p></div></div><div class="answer-review">${outcome.results.map((item, index) => `<article class="review-row"><strong>${index + 1}. ${escapeHtml(quizSession.questions[index].q)}</strong><span class="${item.correct ? "review-correct" : "review-incorrect"}">${item.correct ? "CORRECT" : "REVISIT THIS"}</span><p>${escapeHtml(quizSession.questions[index].explanation || "Review the concept and try another practice question.")}</p></article>`).join("")}</div><button class="primary-button" data-action="view-roadmap">See updated learning path <span>↗</span></button>`;
    $("#quiz-hint").textContent = "Your attempt has been added to your personal learning history.";
  } catch (error) {
    $("#quiz-content").insertAdjacentHTML("afterbegin", `<div class="demo-notice">${escapeHtml(error.message)}</div>`);
    if (submitButton) submitButton.disabled = false;
  }
}

function renderChatHistory() {
  const container = $("#chat-messages");
  container.innerHTML = "";
  if (!state.chat.length) {
    container.innerHTML = `<div class="chat-welcome"><span class="welcome-icon">✳</span><strong>Let's make it click.</strong><p>Ask a question about ${escapeHtml(state.subject)}, share an error, or use one of the prompts below to get started.</p></div>`;
    return;
  }
  state.chat.forEach((message) => appendChatMessage(message.role, message.content, message.demo));
  container.scrollTop = container.scrollHeight;
}

function appendChatMessage(role, text, demo = false) {
  const message = document.createElement("div");
  message.className = `message ${role === "user" ? "user" : "assistant"}`;
  if (demo && role !== "user") {
    const badge = document.createElement("span");
    badge.className = "demo-chip";
    badge.textContent = "OFFLINE · local mentor";
    message.append(badge, document.createElement("br"));
  }
  const content = document.createElement("span");
  content.innerHTML = renderRichText(text);
  message.append(content);
  $("#chat-messages").append(message);
  $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
}

async function sendChat(text) {
  const input = $("#chat-input");
  const prompt = (text ?? input.value).trim();
  if (!prompt) return;
  const history = state.chat.slice(-10).map(({ role, content }) => ({ role, content }));
  input.value = "";
  if (!state.chat.length) $("#chat-messages").innerHTML = "";
  state.chat.push({ role: "user", content: prompt });
  appendChatMessage("user", prompt);
  const submit = $(".send-button");
  submit.disabled = true;
  try {
    const response = await api("/api/chat", {
      message: prompt,
      history,
      subject: state.subject,
      level: state.level,
      language: $("#chat-language").value,
    });
    state.chat.push({ role: "assistant", content: response.reply, demo: response.demo });
    appendChatMessage("assistant", response.reply, response.demo);
    if ($("#speak-replies").checked && !response.demo && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(response.reply.replace(/[`*#]/g, ""));
      utterance.lang = { Hindi: "hi-IN", Hinglish: "en-IN", English: "en-US" }[$("#chat-language").value];
      window.speechSynthesis.speak(utterance);
    }
    save();
  } catch (error) {
    state.chat.push({ role: "assistant", content: `Tutor unavailable: ${error.message}`, demo: true });
    appendChatMessage("assistant", `Tutor unavailable: ${error.message}`, true);
    save();
  } finally {
    submit.disabled = false;
    input.focus();
  }
}

function startVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    window.alert("Voice input is not supported in this browser. You can still type your question.");
    return;
  }
  if (recognition) recognition.abort();
  recognition = new Recognition();
  recognition.lang = { Hindi: "hi-IN", Hinglish: "en-IN", English: "en-US" }[$("#chat-language").value];
  recognition.onresult = (event) => {
    $("#chat-input").value = event.results[0][0].transcript;
    $("#chat-input").focus();
  };
  recognition.onerror = () => {
    $("#quiz-hint").textContent = "Voice input did not start. Type your question instead.";
  };
  recognition.start();
}

async function explainCode() {
  const code = $("#code-input").value.trim();
  const result = $("#code-result");
  if (!code) {
    result.hidden = false;
    result.textContent = "Paste a code snippet first.";
    return;
  }
  result.hidden = false;
  result.textContent = "Reviewing statically. The code will not be executed.";
  const button = $("#explain-code");
  button.disabled = true;
  try {
    const response = await api("/api/code/explain", {
      language: $("#code-language").value,
      code,
      output_language: $("#code-output-language").value,
    });
    result.innerHTML = `${response.demo ? `<div class="demo-notice">OFFLINE MODE · Local static checks only. Your code was not executed.</div>` : ""}${renderRichText(response.reply)}`;
  } catch (error) {
    result.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function renderAnalytics() {
  const results = selectedResults();
  const values = results.map(resultPercent);
  const width = 620;
  const height = 190;
  const x = (index) => values.length < 2 ? width / 2 : 30 + index * (width - 60) / (values.length - 1);
  const y = (value) => 158 - value * 1.28;
  const gridLines = [0, 50, 100].map((value) => `<line class="chart-gridline" x1="30" y1="${y(value)}" x2="${width - 15}" y2="${y(value)}"/><text class="chart-label" x="2" y="${y(value) + 3}">${value}%</text>`).join("");
  const line = values.length ? `<polyline class="chart-line" points="${values.map((value, index) => `${x(index)},${y(value)}`).join(" ")}"/>${values.map((value, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(value)}" r="4"><title>Attempt ${index + 1}: ${value}%</title></circle>`).join("")}` : "";
  const average = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  const firstToLast = values.length > 1 ? values.at(-1) - values[0] : null;
  const byTopic = [...new Set(results.map((result) => result.topic))].map((topic) => {
    const topicAttempts = results.filter((result) => result.topic === topic);
    const score = Math.round(topicAttempts.reduce((sum, result) => sum + resultPercent(result), 0) / topicAttempts.length);
    return { topic, score, count: topicAttempts.length };
  });
  const history = results.slice().reverse().slice(0, 8);
  $("#view-analytics").innerHTML = `
    <div class="page-heading"><div><span class="eyebrow">EVIDENCE, NOT GUESSWORK</span><h1 id="analytics-title">Your progress, over time.</h1><p>Only quiz attempts you submit appear here. Your history is stored in this browser.</p></div><span class="subject-chip">${escapeHtml(state.subject)}</span></div>
    <div class="analytics-grid">
      <article class="surface"><div class="surface-heading"><div><h2>Quiz accuracy trend</h2><p>Attempt-by-attempt score percentage</p></div></div>${values.length ? `<div class="chart-wrap"><svg class="score-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Quiz accuracy trend chart">${gridLines}${line}</svg></div><div class="chart-summary"><div><strong>${average}%</strong><span>Overall accuracy</span></div><div><strong>${firstToLast === null ? "—" : `${firstToLast > 0 ? "+" : ""}${firstToLast}pt`}</strong><span>${firstToLast === null ? "Take another quiz to see change" : "Change since first attempt"}</span></div><div><strong>${results.length}</strong><span>Attempts</span></div></div>` : `<div class="empty-state"><strong>No score history yet.</strong>Take a quiz to start your progress chart. No sample scores are preloaded.</div>`}</article>
      <article class="surface"><div class="surface-heading"><div><h2>Topic accuracy</h2><p>Your submitted attempts, averaged per topic</p></div></div>${byTopic.length ? `<div class="analytics-topic-list">${byTopic.map((item) => `<div class="analytics-topic"><span>${escapeHtml(item.topic)}</span><small>${item.score}% · ${item.count} quiz${item.count === 1 ? "" : "zes"}</small><div class="progress-track"><i style="width:${item.score}%"></i></div></div>`).join("")}</div>` : `<div class="empty-state"><strong>Nothing to compare yet.</strong>Topic-level trends will appear after your first submitted quiz.</div>`}</article>
      <article class="surface"><div class="surface-heading"><div><h2>Recent attempts</h2><p>Most recent first</p></div></div>${history.length ? `<div class="history-list">${history.map((item) => `<div class="history-row"><span>${escapeHtml(item.topic)} · Offline</span><span>${item.score}/${item.total} · ${resultPercent(item)}%</span></div>`).join("")}</div>` : `<div class="empty-state"><strong>Your history starts with your first quiz.</strong>Each real submission is saved on this device.</div>`}</article>
      <article class="surface"><div class="surface-heading"><div><h2>Completed lessons</h2><p>Lessons you marked complete in your learning path</p></div></div><div class="history-list">${curriculum[state.subject].filter(isComplete).map((topic) => `<div class="history-row"><span>${escapeHtml(topic)}</span><span>Complete</span></div>`).join("") || `<div class="empty-state"><strong>No completed lessons yet.</strong>Use “Done” on your learning path after finishing a lesson.</div>`}</div></article>
    </div>`;
}

function setConnectionStatus(mode, message) {
  const status = $("#connection-status");
  status.className = `connection-status ${mode}`;
  status.textContent = message;
  isDemoMode = mode !== "live";
}

let isDemoMode = true;

function applyTheme() {
  const isLight = state.theme === "light";
  document.documentElement.dataset.theme = state.theme;
  const button = $("#theme-toggle");
  button.innerHTML = `<span aria-hidden="true">${isLight ? "☾" : "☼"}</span>`;
  button.setAttribute("aria-label", `Switch to ${isLight ? "dark" : "light"} mode`);
  button.title = `Switch to ${isLight ? "dark" : "light"} mode`;
  button.setAttribute("aria-pressed", String(isLight));
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  save();
}

function updateProfile() {
  $("#student-name").value = state.name;
  $("#subject-select").value = state.subject;
  $("#level-select").value = state.level;
  $("#avatar").textContent = (state.name.trim()[0] || "S").toUpperCase();
}

function toggleCompleted(topic) {
  const key = topicKey(topic);
  state.completed = isComplete(topic) ? state.completed.filter((item) => item !== key) : [...state.completed, key];
  save();
  renderRoadmap();
}

function learnTopic(topic) {
  navigate("tutor");
  sendChat(`Teach me "${topic}" in ${state.subject}, step by step, with a simple example.`);
}

function quizTopic(topic) {
  navigate("quiz");
  $("#quiz-topic").value = topic;
  updateQuizHint();
}

async function selectSubject(subject) {
  state.subject = subject;
  save();
  $("#code-language").value = subject;
  await refreshRecommendation();
  navigate(currentView);
}

async function initialize() {
  applyTheme();
  const date = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date());
  $("#today-label").textContent = date;
  $("#subject-select").innerHTML = Object.keys(FALLBACK_CURRICULUM).map((subject) => `<option>${subject}</option>`).join("");
  if (!FALLBACK_CURRICULUM[state.subject]) state.subject = "Python";
  if (!["Beginner", "Intermediate", "Advanced"].includes(state.level)) state.level = "Beginner";
  updateProfile();
  $("#code-language").value = state.subject;

  try {
    const [health, remoteCurriculum] = await Promise.all([api("/api/health"), api("/api/curriculum")]);
    curriculum = remoteCurriculum;
    setConnectionStatus(
      "demo",
      "Offline mode · local learning tools ready"
    );
  } catch (error) {
    setConnectionStatus("offline", "Backend unavailable · local profile still saved");
    console.warn(error.message);
  }
  updateProfile();
  await refreshRecommendation();
  navigate("dashboard");
}

$(".main-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) navigate(button.dataset.view);
});

$("#menu-button").addEventListener("click", () => {
  const open = $("#sidebar").classList.toggle("open");
  $("#scrim").classList.toggle("visible", open);
  $("#menu-button").setAttribute("aria-expanded", String(open));
});
$("#theme-toggle").addEventListener("click", toggleTheme);
$("#scrim").addEventListener("click", () => {
  $("#sidebar").classList.remove("open");
  $("#scrim").classList.remove("visible");
  $("#menu-button").setAttribute("aria-expanded", "false");
});
$("#student-name").addEventListener("input", (event) => {
  state.name = event.target.value;
  $("#avatar").textContent = (state.name.trim()[0] || "S").toUpperCase();
  save();
});
$("#subject-select").addEventListener("change", (event) => selectSubject(event.target.value));
$("#level-select").addEventListener("change", (event) => {
  state.level = event.target.value;
  save();
  if (currentView === "dashboard") renderDashboard();
});
$("#quiz-topic").addEventListener("change", updateQuizHint);
$("#generate-quiz").addEventListener("click", generateQuiz);
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendChat();
});
$("#chat-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("#chat-form").requestSubmit();
  }
});
$("#voice-input").addEventListener("click", startVoiceInput);
$("#clear-chat").addEventListener("click", () => {
  state.chat = [];
  save();
  renderChatHistory();
});
$("#explain-code").addEventListener("click", explainCode);
$("#view-tutor").addEventListener("click", (event) => {
  const button = event.target.closest("[data-prompt]");
  if (button) sendChat(button.dataset.prompt);
});

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const { action: command, topic } = action.dataset;
  if (command === "learn") learnTopic(topic);
  if (command === "quiz-topic") quizTopic(topic);
  if (command === "toggle-complete") toggleCompleted(topic);
  if (command === "start-quiz") navigate("quiz");
  if (command === "view-roadmap") navigate("roadmap");
  if (command === "submit-quiz") submitQuiz();
});

initialize();