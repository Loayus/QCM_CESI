/* QCM Trainer - logique du site (chargement YAML, passage du QCM, notation, correction) */

const $ = (id) => document.getElementById(id);
const LETTERS = "ABCDEFGHIJ";
const IMAGES_DIR = "images/";

const ICONS = {
  calculator: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><rect x="8" y="5.5" width="8" height="3" rx=".8" fill="currentColor" stroke="none"/><path d="M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01M8.5 16h.01M12 16h.01M15.5 16h.01" stroke-width="2.4"/>',
  code:       '<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 5l-3 14"/>',
  book:       '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.500-.5 6.500 0 8.500 1.500 2-1.500 5-2 8.500-1.500V5C17 4.500 14 5 12 6.500zM12 6.500v13"/>',
  brain:      '<path d="M12 5v14M12 6c-1-2.500-5-2.500-6 0-2.500 0-3.500 3-2 4.500-1.500 1.500-1 4.500 1.500 5 .5 2.500 4 3 6.500 1M12 6c1-2.500 5-2.500 6 0 2.500 0 3.500 3 2 4.500 1.500 1.500 1 4.500-1.500 5-.5 2.500-4 3-6.500 1"/>',
  flask:      '<path d="M9.500 3h5M10.500 3v6L5 19a1.500 1.500 0 0 0 1.300 2.200h11.400A1.500 1.500 0 0 0 19 19l-5.500-10V3M8 15h8"/>',
  globe:      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  bank:       '<path d="M3 9.500 12 4l9 5.500M5 10v8M9.500 10v8M14.500 10v8M19 10v8M3 20h18"/>',
};
const iconSvg = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.book}</svg>`;
const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

let quiz = null;     // QCM en cours
let answers = [];    // answers[i] = Set des index cochés

/* ---------- utilitaires ---------- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// **gras**, `code`, retours à la ligne ; les formules $...$ sont rendues ensuite par KaTeX
const fmt = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
const fmtNum = (x) => (Math.round(x * 100) / 100).toString().replace(".", ",");

function renderMath(el) {
  if (window.renderMathInElement) {
    renderMathInElement(el, { delimiters: [{ left: "$", right: "$", display: false }], throwOnError: false });
  }
}
function showError(msg) { $("error").textContent = msg; $("error").hidden = !msg; }
function show(screen) {
  for (const s of ["home", "quiz", "result"]) $("screen-" + s).hidden = (s !== screen);
  window.scrollTo(0, 0);
}
async function fetchYaml(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + " : HTTP " + r.status);
  return jsyaml.load(await r.text());
}

/* ---------- images ---------- */
// Image ; si le fichier est absent, on affiche "image abs".
function imgHtml(src) {
  return `<img class="qimg" src="${IMAGES_DIR}${esc(src)}" alt="" data-src="${esc(src)}" onerror="imgFallback(this)">`;
}
function imgFallback(img) {
  const span = document.createElement("span");
  span.className = "abs";
  span.textContent = "image abs (" + img.dataset.src + ")";
  img.replaceWith(span);
}
// Image et/ou bloc de code d'une question
function media(q) {
  let h = "";
  if (q.image) h += imgHtml(q.image);
  if (q.code) h += `<pre><code>${esc(q.code.replace(/\n+$/, ""))}</code></pre>`;
  return h;
}
function propBody(p) {
  if (p.image) return imgHtml(p.image);
  if (p.texte == null) return "";
  return p.code ? `<pre><code>${esc(p.texte.replace(/\n+$/, ""))}</code></pre>` : fmt(p.texte);
}

/* ---------- accueil ---------- */
async function init() {
  let idx;
  try {
    idx = await fetchYaml("qcm/index.yml");
  } catch (e) {
    showError("Impossible de charger la liste des QCM. Le site doit être lancé via un serveur local : python3 -m http.server 8000");
    return;
  }
  const list = $("list");
  for (const item of idx.qcm) {
    const row = document.createElement("button");
    row.className = "qcm-row";
    row.innerHTML = `<span class="qcm-icon ${esc(item.couleur || "violet")}">${iconSvg(item.icone)}</span>
      <span class="qcm-text"><span class="qcm-name">${esc(item.titre)}</span><span class="qcm-meta"></span></span>${CHEVRON}`;
    row.onclick = async () => {
      try { start(await fetchYaml("qcm/" + item.fichier), item.titre); }
      catch (e) { showError("Impossible de charger ce QCM : " + e.message); }
    };
    list.appendChild(row);
    // nombre de questions, affiché une fois le fichier chargé
    fetchYaml("qcm/" + item.fichier).then((d) => {
      row.querySelector(".qcm-meta").textContent = d.questions.length + " questions";
    }).catch(() => {});
  }
}

/* ---------- passage du QCM ---------- */
function start(data, titre) {
  showError("");
  if (!data || !Array.isArray(data.questions) || !data.questions.length) { showError("Ce fichier ne contient aucune question."); return; }
  quiz = data;
  quiz._titre = titre || data.titre || "QCM";
  answers = quiz.questions.map(() => new Set());
  $("quiz-title").textContent = quiz._titre;

  const box = $("questions");
  box.innerHTML = "";
  quiz.questions.forEach((q, qi) => {
    const multi = q.type === "multiple";
    const card = document.createElement("div");
    card.className = "card";
    let h = `<div class="qhead"><span>Question ${qi + 1}</span><span class="kind">${multi ? "Réponses multiples" : "Réponse unique"}</span></div>`;
    if (q.enonce) h += `<p class="enonce">${fmt(q.enonce)}</p>`;
    h += media(q);
    q.propositions.forEach((p, pi) => {
      h += `<label class="prop"><input type="${multi ? "checkbox" : "radio"}" name="q${qi}" data-q="${qi}" data-p="${pi}">
        <span class="letter">${LETTERS[pi]}</span><span class="body">${propBody(p)}</span></label>`;
    });
    card.innerHTML = h;
    box.appendChild(card);
  });
  box.querySelectorAll("input").forEach((inp) => (inp.onchange = onAnswer));
  renderMath(box);
  updateProgress();
  show("quiz");
}

function onAnswer(ev) {
  const qi = +ev.target.dataset.q, pi = +ev.target.dataset.p;
  if (quiz.questions[qi].type !== "multiple") answers[qi] = new Set();
  if (ev.target.checked) answers[qi].add(pi); else answers[qi].delete(pi);
  updateProgress();
}
function updateProgress() {
  const done = answers.filter((s) => s.size > 0).length, n = quiz.questions.length;
  $("progress-text").textContent = done + " / " + n;
  $("bar").style.width = (100 * done / n) + "%";
}

/* ---------- notation ---------- */
function gradeQuestion(q, given) {
  const expected = new Set(q.propositions.map((p, i) => (p.correcte ? i : -1)).filter((i) => i >= 0));
  let disc = 0;
  q.propositions.forEach((_, i) => { if (expected.has(i) !== given.has(i)) disc++; });
  let pts = 0;
  if (given.size > 0) {
    // Une seule bonne réponse : tout ou rien, même si la question est de type "multiple".
    const kind = expected.size === 1 ? "unique" : q.type;
    const table = (kind === q.type && q.bareme) || (quiz.bareme && quiz.bareme[kind]) || {};
    pts = table[disc] ?? 0;
  }
  return { expected, disc, pts, answered: given.size > 0 };
}

function showResult() {
  const n = quiz.questions.length, sur = quiz.note_sur || 20;
  const results = quiz.questions.map((q, i) => gradeQuestion(q, answers[i]));
  const total = results.reduce((a, r) => a + r.pts, 0);
  const full = results.filter((r) => r.pts === 1).length;
  const zero = results.filter((r) => r.pts === 0).length;

  $("result-title").textContent = quiz._titre;
  $("score").innerHTML = `<div class="big">${fmtNum(total / n * sur)} <small>/ ${sur}</small></div>
    <div class="sub">${fmtNum(total)} points sur ${n}</div>
    <div class="stats"><span class="pill ok">${full} correcte(s)</span>
    <span class="pill mid">${n - full - zero} partielle(s)</span><span class="pill ko">${zero} à 0</span></div>`;

  const box = $("corrections");
  box.innerHTML = "";
  quiz.questions.forEach((q, qi) => {
    const r = results[qi], given = answers[qi];
    const cls = r.pts === 1 ? "ok" : r.pts === 0 ? "ko" : "mid";
    const card = document.createElement("div");
    card.className = "card res " + cls;
    card.dataset.cls = cls;
    const detail = !r.answered ? " - pas de réponse" : r.disc ? ` - ${r.disc} discordance${r.disc > 1 ? "s" : ""}` : "";
    let h = `<div class="qhead"><span>Question ${qi + 1}</span><span class="pts">${fmtNum(r.pts)} / 1${detail}</span></div>`;
    if (q.enonce) h += `<p class="enonce">${fmt(q.enonce)}</p>`;
    h += media(q);
    q.propositions.forEach((p, pi) => {
      const exp = r.expected.has(pi), mine = given.has(pi);
      const state = exp && mine ? "good" : exp ? "missed" : mine ? "bad" : "";
      let tags = "";
      if (exp) tags += `<span class="tag exp">Attendue</span>`;
      if (mine) tags += `<span class="tag ${exp ? "mine" : "err"}">Ta réponse</span>`;
      h += `<div class="prop static ${state}"><span class="letter">${LETTERS[pi]}</span><span class="body">${propBody(p)}</span>${tags}</div>`;
    });
    if (q.explication || q.explication_image) {
      h += `<div class="explication"><b class="t">Explication</b>${q.explication ? fmt(q.explication) : ""}${q.explication_image ? imgHtml(q.explication_image) : ""}</div>`;
    }
    card.innerHTML = h;
    box.appendChild(card);
  });
  renderMath(box);
  $("only-errors").checked = false;
  filterErrors();
  show("result");
}

function filterErrors() {
  const only = $("only-errors").checked;
  document.querySelectorAll("#corrections .res").forEach((c) => (c.hidden = only && c.dataset.cls === "ok"));
}

/* ---------- événements ---------- */
$("submit").onclick = () => {
  const missing = answers.filter((s) => s.size === 0).length;
  if (missing && !confirm(missing + " question(s) sans réponse (0 point). Terminer quand même ?")) return;
  showResult();
};
$("only-errors").onchange = filterErrors;
$("retry").onclick = () => start(quiz, quiz._titre);
const goHome = (e) => { if (e) e.preventDefault(); showError(""); show("home"); };
$("home").onclick = goHome;
$("brand").onclick = goHome;
$("back").onclick = () => { if (confirm("Quitter ce QCM ? Tes réponses seront perdues.")) goHome(); };

init();
