/* ==========================================================================
   Scholar Speak — app.js  (vanilla ES2020+, no build)
   ========================================================================== */
'use strict';

const APP_VERSION = 'v1.0.0';
const PROGRESS_KEY = 'lexilab-progress-v1';
const SETTINGS_KEY = 'lexilab-settings-v1';
const SRS_INTERVALS = [0, 1, 3, 7, 14, 30]; // days by step
const MASTER_STEP = 5;
const MASTER_CORRECT = 5; // 正解が累計5回で習得(mastered)

/* ---------- State ---------- */
const State = {
  meta: null,
  entries: [],
  byId: new Map(),
  progress: {},        // id -> { status, step, due (ISO date), lastReviewed, correctCount }
  settings: { rate: 0.9, voiceURI: '' },
  // study session
  session: { queue: [], index: 0, active: false },
  studyMode: 'quiz',   // 'quiz'(4択・既定) | 'quiz2'(2択スピード) | 'card'(フラッシュカード)
  quizLock: false,     // block input during answer transition
  returnTo: null,      // 「もっと詳しく」で辞書に飛んだ後、学習に戻るための復帰情報
  // sentence practice
  sent: { items: [], index: 0 },
  voices: [],
};

/* ---------- DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* A term is "single" (no wrap allowed) when it has no internal space. */
const isSingleWord = (term) => !/\s/.test(String(term || '').trim());

/* Shrink a term element's font-size until it fits its box (no mid-word
   breaks). Single words never wrap; multi-word terms wrap at spaces first
   and then shrink. Lower bound 20px. Runs after layout. */
function fitTermFont(node, minPx = 20) {
  if (!node) return;
  requestAnimationFrame(() => {
    let size = parseFloat(getComputedStyle(node).fontSize) || 48;
    let guard = 0;
    while (guard++ < 200 &&
           (node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight) &&
           size > minPx) {
      size = Math.max(minPx, size - 2);
      node.style.fontSize = size + 'px';
    }
  });
}

/* ---------- Date helpers (day-based) ---------- */
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDaysStr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isDue = (p) => !p || !p.due || p.due <= todayStr();

/* ==========================================================================
   Persistence
   ========================================================================== */
function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    State.progress = raw ? JSON.parse(raw) : {};
  } catch { State.progress = {}; }
}
function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(State.progress)); } catch {}
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(State.settings, JSON.parse(raw));
  } catch {}
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(State.settings)); } catch {}
}

/* Ensure every entry has a progress record */
function ensureProgress() {
  for (const e of State.entries) {
    if (!State.progress[e.id]) {
      State.progress[e.id] = { status: 'new', step: 0, due: todayStr(), lastReviewed: null, correctCount: 0 };
    } else if (typeof State.progress[e.id].correctCount !== 'number') {
      // 既存進捗に correctCount が無ければ 0 とみなす
      State.progress[e.id].correctCount = 0;
    }
  }
}

/* ==========================================================================
   Data loading
   ========================================================================== */
async function loadData() {
  try {
    const res = await fetch('data/words.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json || !Array.isArray(json.entries)) throw new Error('bad schema');
    State.meta = json.meta || { version: 1, updated: '', decks: [] };
    State.entries = json.entries;
    State.byId = new Map(State.entries.map((e) => [e.id, e]));
    ensureProgress();
    saveProgress();
    return true;
  } catch (err) {
    console.warn('[Scholar Speak] data load failed:', err);
    return false;
  }
}

/* ==========================================================================
   SRS
   ========================================================================== */
function statusForStep(step) {
  if (step <= 0) return 'learning';
  if (step >= MASTER_STEP) return 'mastered';
  return 'review';
}

function applyGrade(id, grade) {
  const p = State.progress[id] || { status: 'new', step: 0, due: todayStr(), lastReviewed: null, correctCount: 0 };
  if (typeof p.correctCount !== 'number') p.correctCount = 0;
  if (grade === 'again') {
    p.step = 0;
  } else if (grade === 'hard') {
    // same step re-shown; keep step, due today (re-review soon)
    p.step = Math.max(0, p.step);
  } else if (grade === 'good') {
    p.step = Math.min(MASTER_STEP, p.step + 1);
    p.correctCount += 1; // 正解ごとに累積(不正解ではリセットしない)
  }
  const interval = SRS_INTERVALS[Math.min(p.step, SRS_INTERVALS.length - 1)];
  p.due = addDaysStr(interval);
  p.status = statusForStep(p.step);
  if (p.status === 'new') p.status = 'learning';
  // 習得判定: correctCount>=5 を最優先(SRS step 判定より優先)
  if (p.correctCount >= MASTER_CORRECT) p.status = 'mastered';
  p.lastReviewed = todayStr();
  State.progress[id] = p;
  saveProgress();
}

/* Build the study queue: mastered は除外。due と new を集めて毎回シャッフル。 */
function buildStudyQueue(deckId) {
  const pool = [];
  for (const e of State.entries) {
    if (deckId && e.deck !== deckId) continue;
    const p = State.progress[e.id];
    if (p && p.status === 'mastered') continue; // 習得済みは通常出題しない
    if (!p || p.status === 'new') { pool.push(e); continue; }
    if (isDue(p)) pool.push(e);
  }
  return shuffle(pool); // 出題順はランダム
}

/* ==========================================================================
   Stats
   ========================================================================== */
function computeStats(deckId) {
  let total = 0, mastered = 0, due = 0, fresh = 0, learning = 0, review = 0;
  for (const e of State.entries) {
    if (deckId && e.deck !== deckId) continue;
    total++;
    const p = State.progress[e.id];
    const st = p ? p.status : 'new';
    if (st === 'mastered') mastered++;
    else if (st === 'new') fresh++;
    else if (st === 'learning') learning++;
    else if (st === 'review') review++;
    // "due" = has a progress record, not mastered, and due date reached
    if (p && st !== 'new' && st !== 'mastered' && isDue(p)) due++;
  }
  const pct = total ? Math.round((mastered / total) * 100) : 0;
  return { total, mastered, due, fresh, learning, review, pct };
}

/* ==========================================================================
   TTS
   ========================================================================== */
function refreshVoices() {
  State.voices = (window.speechSynthesis ? speechSynthesis.getVoices() : []) || [];
}

// Novelty / low-quality voices to exclude entirely.
const NOVELTY_VOICE_RE = /\b(Compact|Eddy|Flo|Fred|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bahh|Albert|Bells|Boing|Bubbles|Cellos|Wobble|Whisper|Organ|Superstar|Trinoids|Zarvox|Jester|Good News|Bad News)\b/i;
// Preferred natural US names (tier 1).
const PREFERRED_NAMES = ['Samantha', 'Ava', 'Allison', 'Nicky', 'Joelle', 'Zoe', 'Evan', 'Nathan', 'Noelle', 'Aaron'];
const PREFERRED_RE = new RegExp('\\b(' + PREFERRED_NAMES.join('|') + ')\\b', 'i');

const isEn = (v) => /^en(\b|[-_])/i.test(v.lang);
const isEnUS = (v) => /^en[-_]US/i.test(v.lang) || v.lang === 'en-US';

/* Rank en voices best-first, dropping novelty voices. Shared by
   pickVoice() and the settings list so both agree. */
function rankedVoices() {
  const en = State.voices.filter((v) => isEn(v) && !NOVELTY_VOICE_RE.test(v.name || ''));
  const tier = (v) => {
    const name = v.name || '';
    if (isEnUS(v) && PREFERRED_RE.test(name)) return 0;             // (1) preferred natural US names
    if (isEnUS(v) && /Enhanced|Premium/i.test(name)) return 1;      // (2) Enhanced/Premium en-US
    if (isEnUS(v) && v.localService) return 2;                      // (3) other en-US localService
    if (isEnUS(v)) return 3;                                        // remaining en-US (e.g. remote)
    return 4;                                                       // (4) en-GB and other en
  };
  return en
    .map((v, i) => ({ v, i, t: tier(v) }))
    .sort((a, b) => (a.t - b.t) || (a.i - b.i))
    .map((x) => x.v);
}

function pickVoice() {
  const v = State.voices;
  if (!v.length) return null;
  if (State.settings.voiceURI) {
    const found = v.find((x) => x.voiceURI === State.settings.voiceURI);
    if (found) return found;
  }
  const ranked = rankedVoices();
  return ranked[0] || v.find((x) => isEnUS(x)) || v.find((x) => isEn(x)) || v[0];
}
function speak(text) {
  if (!window.speechSynthesis || !text) return;
  try {
    speechSynthesis.cancel(); // avoid queue clog / stuck utterances
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = 'en-US'; // always request US English
    u.rate = State.settings.rate || 0.9;
    u.pitch = 1;
    speechSynthesis.speak(u);
  } catch (e) { console.warn('TTS error', e); }
}

/* ==========================================================================
   Navigation
   ========================================================================== */
let currentTab = 'home';
function showScreen(name) {
  $$('.screen').forEach((s) => { s.hidden = s.dataset.screen !== name; });
}
function goTab(tab) {
  currentTab = tab;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  if (!State.entries.length) { showScreen('empty'); return; }
  showScreen(tab);
  $('#main').scrollTop = 0;
  if (tab === 'home') renderHome();
  else if (tab === 'study') startStudy();
  else if (tab === 'sentence') renderSentence();
  else if (tab === 'dictionary') renderDictionary();
  else if (tab === 'list') renderList();
  else if (tab === 'settings') renderSettings();
}

/* ==========================================================================
   HOME
   ========================================================================== */
function renderHome() {
  const s = computeStats();
  $('#homeDateSub').textContent = `${todayStr()} ・ 全 ${s.total} 語`;
  // ring
  const circ = 2 * Math.PI * 52; // ~326.7
  $('#ringFill').style.strokeDashoffset = String(circ * (1 - s.pct / 100));
  $('#ringPct').textContent = s.pct + '%';
  $('#statDue').textContent = s.due;
  $('#statNew').textContent = s.fresh;
  $('#statMastered').textContent = s.mastered;

  // decks
  const list = $('#deckList');
  list.innerHTML = '';
  const decks = (State.meta && State.meta.decks) ? State.meta.decks : [];
  // include any deck ids present in entries but missing from meta
  const seen = new Set(decks.map((d) => d.id));
  for (const e of State.entries) {
    if (e.deck && !seen.has(e.deck)) { seen.add(e.deck); decks.push({ id: e.deck, name: e.deck }); }
  }
  if (!decks.length) {
    list.appendChild(el('p', 'muted', 'デッキがありません'));
  }
  for (const d of decks) {
    const ds = computeStats(d.id);
    const dueN = ds.due;
    const btn = el('button', 'deck-item');
    btn.innerHTML = `
      <span class="deck-meta">
        <span class="deck-name">${esc(d.name || d.id)}</span>
        <span class="deck-sub">${ds.total} 語 ・ 習得 ${ds.pct}%</span>
      </span>
      <span class="deck-due ${dueN ? '' : 'zero'}">${dueN ? dueN + ' due' : '完了'}</span>`;
    btn.addEventListener('click', () => startStudy(d.id));
    list.appendChild(btn);
  }
}

/* ==========================================================================
   STUDY (flashcards)
   ========================================================================== */
function startStudy(deckId) {
  const queue = buildStudyQueue(deckId);
  State.session = { queue, index: 0, active: true, deckId };
  State.quizLock = false;
  State.returnTo = null; // 新規セッション開始で復帰情報をクリア
  currentTab = 'study';
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'study'));
  showScreen('study');
  $('#studyDone').hidden = true;
  $('.study-topbar').hidden = false;
  // 4択は最低4語、2択は最低2語の異なる意味が必要。足りなければカードに退避。
  if (State.studyMode === 'quiz' && State.entries.length < 4) State.studyMode = 'card';
  if (State.studyMode === 'quiz2' && State.entries.length < 2) State.studyMode = 'card';
  syncModeToggle();
  if (!queue.length) { finishStudy(true); return; }
  renderStudyStep();
}

/* Reflect current mode in the segmented toggle + show/hide panes. */
function syncModeToggle() {
  const isQuiz = State.studyMode === 'quiz' || State.studyMode === 'quiz2';
  $$('#studyModeToggle .mode-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.mode === State.studyMode));
  // Don't reveal study panes while the "session complete" screen is up.
  if (!$('#studyDone').hidden) {
    $('#studyBody').hidden = true;
    $('#quizBody').hidden = true;
    $('#studyActions').hidden = true;
    return;
  }
  $('#studyBody').hidden = isQuiz;      // カード面はクイズ中は隠す
  $('#studyActions').hidden = isQuiz;   // 自己評価ボタンはカードモードのみ
  $('#quizBody').hidden = !isQuiz;
}

/* Render the current queue item in whichever mode is active. */
function renderStudyStep() {
  if (State.studyMode === 'quiz' || State.studyMode === 'quiz2') renderQuiz();
  else renderCard();
}

function setStudyMode(mode) {
  if (mode === State.studyMode) return;
  if (mode === 'quiz' && State.entries.length < 4) return;  // 4択に足りない
  if (mode === 'quiz2' && State.entries.length < 2) return; // 2択に足りない
  State.studyMode = mode;
  State.quizLock = false;
  syncModeToggle();
  // If a session is running, re-render the current item in the new mode.
  if (State.session.active && $('#studyDone').hidden) renderStudyStep();
}

function renderCard() {
  const s = State.session;
  const total = s.queue.length;
  const e = s.queue[s.index];
  $('#studyCount').textContent = `${Math.min(s.index + 1, total)} / ${total}`;
  $('#studyProgress').style.width = `${(s.index / total) * 100}%`;

  const card = $('#flashcard');
  card.classList.remove('is-flipped');

  // FRONT
  const front = $('#cardFront');
  const termCls = isSingleWord(e.term) ? 'is-single' : 'is-multi';
  front.innerHTML = `
    <span class="fc-type-badge">${e.type === 'phrase' ? 'PHRASE' : 'WORD'}</span>
    <div class="fc-term ${termCls}">${esc(e.term)}</div>
    ${e.ipa ? `<div class="fc-ipa">${esc(e.ipa)}</div>` : ''}
    ${e.pos ? `<div class="fc-pos">${esc(e.pos)}${e.level ? ' ・ ' + esc(e.level) : ''}</div>` : ''}
    <button class="fc-speak" id="frontSpeak" aria-label="発音">🔊</button>
    <div class="fc-hint-flip">タップで意味を表示</div>`;
  fitTermFont($('.fc-term', front));

  // BACK
  $('#cardBack').innerHTML = buildCardBack(e);

  // wire
  $('#frontSpeak').addEventListener('click', (ev) => { ev.stopPropagation(); speak(e.term); });
  const backSpeak = $('#backSpeak', $('#cardBack'));
  if (backSpeak) backSpeak.addEventListener('click', (ev) => { ev.stopPropagation(); speak(e.term); });
  $$('.speak-inline', $('#cardBack')).forEach((b) => {
    b.addEventListener('click', (ev) => { ev.stopPropagation(); speak(b.dataset.say || ''); });
  });
}

/* ---------- Quiz (4-choice) mode ---------- */
const shuffle = (a) => {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/* Build 4 meaning_ja choices for entry e: correct + 3 distractors.
   Prefer distractors from the same deck; fall back to全体. No duplicate
   meaning strings. Returns null if fewer than 4 distinct meanings exist. */

/* クイズ表示用: 意味の先頭がカタカナ音写(例「パラダイム、〜」)なら外して説明部分だけにする */
function quizMeaning(m) {
  if (!m) return '';
  const stripped = m.replace(/^[ァ-ヴー・\s]+(?:な|の|する)?\s*[、，,]\s*/, '');
  return (stripped !== m && stripped.length >= 2) ? stripped : m;
}

/* choiceCount 個の選択肢を作る(正解1 + ダミー n-1)。
   4択なら 4、2択(スピード)なら 2。 */
function buildQuizChoices(e, choiceCount = 4) {
  const need = Math.max(1, choiceCount - 1); // 必要なダミー数
  const correct = quizMeaning(e.meaning_ja || '');
  if (!correct) return null;
  const used = new Set([correct]);
  const distractors = [];
  const collect = (pool) => {
    for (const x of shuffle(pool)) {
      if (distractors.length >= need) break;
      const m = quizMeaning(x.meaning_ja || '');
      if (!m || used.has(m)) continue;
      used.add(m);
      distractors.push(m);
    }
  };
  collect(State.entries.filter((x) => x.id !== e.id && x.deck === e.deck)); // same deck first
  if (distractors.length < need) collect(State.entries.filter((x) => x.id !== e.id)); // then全体
  if (distractors.length < need) return null;
  return shuffle([correct, ...distractors]);
}

/* エントリの代表例文(examples[0] を優先、無ければ sentences[0])を返す。 */
function primaryExample(e) {
  if (Array.isArray(e.examples) && e.examples.length && e.examples[0] && e.examples[0].en) return e.examples[0];
  if (Array.isArray(e.sentences) && e.sentences.length && e.sentences[0] && e.sentences[0].en) return e.sentences[0];
  return null;
}

function renderQuiz() {
  const s = State.session;
  const total = s.queue.length;
  const e = s.queue[s.index];
  State.quizLock = false;
  $('#studyCount').textContent = `${Math.min(s.index + 1, total)} / ${total}`;
  $('#studyProgress').style.width = `${(s.index / total) * 100}%`;

  const speedMode = State.studyMode === 'quiz2';
  const choiceCount = speedMode ? 2 : 4;
  const choices = buildQuizChoices(e, choiceCount);
  if (!choices) { // 十分な選択肢が作れない -> カードモードに退避
    State.studyMode = 'card';
    syncModeToggle();
    renderCard();
    return;
  }

  const termCls = isSingleWord(e.term) ? 'is-single' : 'is-multi';
  $('#quizPrompt').innerHTML = `
    <div class="quiz-term ${termCls}">${esc(e.term)}</div>
    ${e.ipa ? `<div class="quiz-ipa">${esc(e.ipa)}</div>` : ''}
    <button class="quiz-speak" id="quizSpeak" aria-label="発音">🔊</button>`;
  fitTermFont($('.quiz-term', $('#quizPrompt')));
  $('#quizSpeak').addEventListener('click', () => speak(e.term));

  $('#quizFeedback').textContent = '';
  $('#quizFeedback').className = 'quiz-feedback';
  const wrap = $('#quizChoices');
  wrap.className = 'quiz-choices' + (speedMode ? ' quiz-choices-speed' : '');
  wrap.innerHTML = '';
  for (const m of choices) {
    const btn = el('button', 'quiz-choice' + (speedMode ? ' quiz-choice-big' : ''));
    btn.textContent = m;
    btn.dataset.value = m;
    btn.addEventListener('click', () => answerQuiz(e, m, choices));
    wrap.appendChild(btn);
  }
  const idk = el('button', 'quiz-idk');
  idk.textContent = 'わからん';
  idk.addEventListener('click', () => answerQuiz(e, null, choices));
  wrap.appendChild(idk);

  // 英単語の自動読み上げ(表示した瞬間)。iOSでは初回のみ無音になり得るが仕様上許容。
  try { speak(e.term); } catch (_) {}
}

function answerQuiz(e, chosen, choices) {
  if (State.quizLock) return;
  State.quizLock = true;
  const correct = quizMeaning(e.meaning_ja || '');
  const isRight = chosen === correct; // chosen===null (わからん) は不正解扱い
  applyGrade(e.id, isRight ? 'good' : 'again');

  $$('#quizChoices .quiz-choice').forEach((btn) => {
    btn.disabled = true;
    const v = btn.dataset.value;
    if (v === correct) btn.classList.add('is-correct');
    else if (chosen !== null && v === chosen) btn.classList.add('is-wrong');
  });
  const idkBtn = $('#quizChoices .quiz-idk');
  if (idkBtn) idkBtn.remove(); // 「わからん」は撤去し、フィードバック内の操作に統一

  // 不正解・わからん は正解するまでキューに戻す(習得は正解累計5回で成立)
  if (!isRight) State.session.queue.push(e);

  // ---- 正解/不正解ともに詳細フィードバックを表示。「次へ」まで進まない ----
  const ex = primaryExample(e);
  const fb = $('#quizFeedback');
  fb.className = 'quiz-feedback ' + (isRight ? 'ok' : 'ng');
  fb.innerHTML = `
    <div class="qf-verdict ${isRight ? 'ok' : 'ng'}">${isRight ? '正解!' : (chosen === null ? 'わからん' : '不正解')}</div>
    ${isRight ? '' : `<div class="qf-answer"><span class="qf-answer-label">答え</span>${esc(correct)}</div>`}
    ${ex ? `<div class="qf-example">
      <div class="qf-ex-en">${esc(ex.en)}</div>
      ${ex.ja ? `<div class="qf-ex-ja">${esc(ex.ja)}</div>` : ''}
    </div>` : ''}
    <div class="qf-actions">
      <button class="btn btn-ghost qf-more" data-id="${esc(e.id)}">もっと詳しく</button>
      <button class="btn btn-primary qf-next" id="quizNextBtn">次へ →</button>
    </div>`;

  // 自動読み上げ: 正解時は例文英文、不正解時は英単語
  try {
    if (isRight && ex && ex.en) speak(ex.en);
    else speak(e.term);
  } catch (_) {}
}

function advanceQuiz() {
  const s = State.session;
  s.index++;
  if (s.index >= s.queue.length) { finishStudy(false); return; }
  renderStudyStep();
}

// 「次へ」「もっと詳しく」「学習に戻る」はイベント委任で確実に拾う(iOS Safari対策)
document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!t || !t.closest) return;
  if (t.closest('#quizNextBtn')) {
    ev.preventDefault();
    advanceQuiz();
    return;
  }
  const more = t.closest('.qf-more');
  if (more) {
    ev.preventDefault();
    openDetailInDictionary(more.dataset.id);
    return;
  }
  if (t.closest('#dictReturnBtn')) {
    ev.preventDefault();
    returnToStudy();
    return;
  }
});

function buildCardBack(e) {
  const parts = [];
  parts.push(`<div class="fc-back-head">
    <span class="fc-back-term">${esc(e.term)}</span>
    ${e.ipa ? `<span class="fc-back-ipa">${esc(e.ipa)}</span>` : ''}
    <button class="speak-inline" id="backSpeak" aria-label="発音">🔊</button>
  </div>`);
  parts.push(`<div class="fc-meaning">${esc(e.meaning_ja || '')}</div>`);
  if (e.gloss_en) parts.push(`<div class="fc-gloss">${esc(e.gloss_en)}</div>`);

  if (e.etymology) parts.push(block('語源', `<p>${esc(e.etymology)}</p>`));
  if (e.mnemonic) parts.push(block('覚え方', `<p>${esc(e.mnemonic)}</p>`));

  // context_quote — prominent
  if (e.context_quote && (e.context_quote.en || e.context_quote.ja)) {
    const q = e.context_quote;
    parts.push(`<div class="quote-block">
      <div class="quote-label">授業での使用例</div>
      ${q.en ? `<div class="quote-en">“${esc(q.en)}”</div>` : ''}
      ${q.ja ? `<div class="quote-ja">${esc(q.ja)}</div>` : ''}
      ${q.source ? `<div class="quote-src">— ${esc(q.source)}</div>` : ''}
    </div>`);
  }

  if (Array.isArray(e.examples) && e.examples.length) {
    const items = e.examples.map((ex) => `
      <div class="ex-item">
        <div class="ex-en">${esc(ex.en)}</div>
        ${ex.ja ? `<div class="ex-ja">${esc(ex.ja)}</div>` : ''}
        ${ex.scene ? `<div class="ex-scene">${esc(ex.scene)}</div>` : ''}
      </div>`).join('');
    parts.push(block('例文', items));
  }

  const lex = [];
  if (arr(e.synonyms)) lex.push(`<div class="fc-block-label">類義語</div><p>${e.synonyms.map(esc).join(', ')}</p>`);
  if (arr(e.paraphrases)) lex.push(`<div class="fc-block-label" style="margin-top:8px">言い換え</div><p>${e.paraphrases.map(esc).join(' / ')}</p>`);
  if (arr(e.antonyms)) lex.push(`<div class="fc-block-label" style="margin-top:8px">反意語</div><p>${e.antonyms.map(esc).join(', ')}</p>`);
  if (arr(e.collocations)) lex.push(`<div class="fc-block-label" style="margin-top:8px">コロケーション</div><p>${e.collocations.map(esc).join(' ・ ')}</p>`);
  if (lex.length) parts.push(`<div class="fc-block">${lex.join('')}</div>`);

  const tags = [];
  if (e.register) tags.push(e.register);
  if (arr(e.tags)) tags.push(...e.tags);
  if (tags.length) parts.push(`<div class="fc-block"><div class="tag-row">${tags.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('')}</div></div>`);

  return parts.join('');
}
const arr = (a) => Array.isArray(a) && a.length;
const block = (label, inner) => `<div class="fc-block"><div class="fc-block-label">${esc(label)}</div>${inner}</div>`;

function flipCard() {
  $('#flashcard').classList.toggle('is-flipped');
}

function gradeCurrent(grade) {
  const s = State.session;
  if (!s.active) return;
  const e = s.queue[s.index];
  applyGrade(e.id, grade);
  if (grade === 'again' || grade === 'hard') {
    // re-insert later in the queue
    s.queue.push(e);
  }
  s.index++;
  if (s.index >= s.queue.length) { finishStudy(false); return; }
  renderCard();
}

function finishStudy(empty) {
  State.session.active = false;
  $('#studyBody').hidden = true;
  $('#quizBody').hidden = true;
  $('.study-topbar').hidden = true;
  $('#studyActions').hidden = true;
  $('#studyDone').hidden = false;
  const s = computeStats(State.session.deckId);
  $('#doneSummary').textContent = empty
    ? '今日の復習はありません。新しいデッキを追加するか、ホームで確認してください。'
    : `お疲れさまでした。習得率は ${s.pct}% です。`;
}

/* ==========================================================================
   SENTENCE PRACTICE
   ========================================================================== */
function buildSentenceItems() {
  const items = [];
  for (const e of State.entries) {
    const list = Array.isArray(e.sentences) ? e.sentences : [];
    for (const sen of list) {
      if (sen && sen.en) items.push({ term: e.term, en: sen.en, ja: sen.ja || '', scene: sen.scene || 'presentation' });
    }
  }
  return items;
}

function renderSentence() {
  State.sent.items = buildSentenceItems();
  if (!State.sent.index || State.sent.index >= State.sent.items.length) State.sent.index = 0;
  showSentence();
}

function blankOut(text, term) {
  if (!term) return esc(text);
  try {
    // Replace whole word occurrences of term (and simple inflections) with blank
    const base = term.split(/\s+/)[0];
    const re = new RegExp(`\\b${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*\\b`, 'gi');
    return esc(text).replace(re, '<span class="blank">____</span>');
  } catch { return esc(text); }
}

function showSentence() {
  const items = State.sent.items;
  const n = items.length;
  $('#sentCount').textContent = n ? `${State.sent.index + 1} / ${n}` : '0 / 0';
  if (!n) {
    $('#sentJa').textContent = 'センテンスがありません';
    $('#sentTerm').textContent = '';
    $('#sentScene').textContent = '—';
    $('#sentEnWrap').hidden = true;
    $('#sentReveal').hidden = true;
    $('#sentControls').hidden = true;
    return;
  }
  const it = items[State.sent.index];
  $('#sentScene').textContent = it.scene;
  $('#sentTerm').textContent = `対象語: ${it.term}`;
  $('#sentJa').textContent = it.ja || '(和訳なし)';
  const blank = $('#blankToggle').checked;
  $('#sentEn').innerHTML = blank ? blankOut(it.en, it.term) : esc(it.en);
  // reset reveal
  $('#sentEnWrap').hidden = true;
  $('#sentControls').hidden = true;
  $('#sentReveal').hidden = false;
}

function revealSentence() {
  $('#sentEnWrap').hidden = false;
  $('#sentControls').hidden = false;
  $('#sentReveal').hidden = true;
}

/* ==========================================================================
   LIST / SEARCH
   ========================================================================== */
function populateFilters() {
  const dsel = $('#filterDeck');
  // keep the "all" first option
  dsel.length = 1;
  const decks = (State.meta && State.meta.decks) ? State.meta.decks.slice() : [];
  const seen = new Set(decks.map((d) => d.id));
  for (const e of State.entries) if (e.deck && !seen.has(e.deck)) { seen.add(e.deck); decks.push({ id: e.deck, name: e.deck }); }
  for (const d of decks) {
    const o = el('option');
    o.value = d.id; o.textContent = d.name || d.id;
    dsel.appendChild(o);
  }
  populateDictDeck();
}

function renderList() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const fd = $('#filterDeck').value;
  const ft = $('#filterType').value;
  const fs = $('#filterStatus').value;
  const list = $('#entryList');
  list.innerHTML = '';
  let count = 0;
  for (const e of State.entries) {
    if (fd && e.deck !== fd) continue;
    if (ft && e.type !== ft) continue;
    const st = (State.progress[e.id] && State.progress[e.id].status) || 'new';
    if (fs && st !== fs) continue;
    if (q) {
      const hay = `${e.term} ${e.meaning_ja || ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    count++;
    const item = el('button', 'entry-item');
    item.innerHTML = `
      <span class="entry-main">
        <span class="entry-term">${esc(e.term)}</span>
        <span class="entry-ja">${esc(e.meaning_ja || '')}</span>
      </span>
      <span class="status-dot status-${st}"></span>`;
    item.addEventListener('click', () => openSheet(e));
    list.appendChild(item);
  }
  $('#listCount').textContent = `${count} 件`;
  if (!count) list.appendChild(el('p', 'muted', '該当するカードがありません'));
}

/* ==========================================================================
   DICTIONARY (じっくり学習 / 読み物ページ)
   全単語を縦スクロールの読み物カードとして連続表示。各カードは展開済み。
   ========================================================================== */
const DICT_STATUS_LABEL = { new: '未学習', learning: '学習中', review: '復習', mastered: '習得済み' };

/* デッキ選択ドロップダウンを埋める(list側 populateFilters と同ロジック) */
function populateDictDeck() {
  const dsel = $('#dictDeck');
  if (!dsel) return;
  const cur = dsel.value;
  dsel.length = 1; // keep "全デッキ"
  const decks = (State.meta && State.meta.decks) ? State.meta.decks.slice() : [];
  const seen = new Set(decks.map((d) => d.id));
  for (const e of State.entries) if (e.deck && !seen.has(e.deck)) { seen.add(e.deck); decks.push({ id: e.deck, name: e.deck }); }
  for (const d of decks) {
    const o = el('option');
    o.value = d.id; o.textContent = d.name || d.id;
    dsel.appendChild(o);
  }
  // restore selection if still valid
  if (cur && seen.has(cur)) dsel.value = cur;
}

/* 1語まるごとの読み物カードのHTMLを組み立てる(タップ不要ですべて見える) */
function buildDictCard(e) {
  const st = (State.progress[e.id] && State.progress[e.id].status) || 'new';
  const stLabel = DICT_STATUS_LABEL[st] || st;
  const termCls = isSingleWord(e.term) ? 'is-single' : 'is-multi';
  const parts = [];

  // ---- Head: status badge, term, IPA, speak ----
  parts.push(`<div class="dict-head">
    <div class="dict-head-top">
      <span class="dict-type-badge">${e.type === 'phrase' ? 'PHRASE' : 'WORD'}</span>
      <span class="dict-status status-${st}">${esc(stLabel)}</span>
    </div>
    <div class="dict-term ${termCls}">${esc(e.term)}</div>
    <div class="dict-metarow">
      ${e.ipa ? `<span class="dict-ipa">${esc(e.ipa)}</span>` : ''}
      <button class="dict-speak" data-say="${esc(e.term)}" aria-label="発音">🔊</button>
    </div>
    ${(e.pos || e.level) ? `<div class="dict-pos">${esc(e.pos || '')}${(e.pos && e.level) ? ' ・ ' : ''}${esc(e.level || '')}</div>` : ''}
  </div>`);

  // ---- Meaning / gloss ----
  parts.push(`<div class="dict-meaning">${esc(e.meaning_ja || '')}</div>`);
  if (e.gloss_en) parts.push(`<div class="dict-gloss">${esc(e.gloss_en)}</div>`);

  // ---- Etymology / mnemonic ----
  if (e.etymology) parts.push(dictBlock('語源', `<p>${esc(e.etymology)}</p>`));
  if (e.mnemonic) parts.push(dictBlock('覚え方', `<p>${esc(e.mnemonic)}</p>`));

  // ---- context_quote: Hi-Vis Yellow band ----
  if (e.context_quote && (e.context_quote.en || e.context_quote.ja)) {
    const q = e.context_quote;
    parts.push(`<div class="quote-block">
      <div class="quote-label">授業での使用例</div>
      ${q.en ? `<div class="quote-en">“${esc(q.en)}”</div>` : ''}
      ${q.ja ? `<div class="quote-ja">${esc(q.ja)}</div>` : ''}
      ${q.source ? `<div class="quote-src">— ${esc(q.source)}</div>` : ''}
    </div>`);
  }

  // ---- Examples ----
  if (Array.isArray(e.examples) && e.examples.length) {
    const items = e.examples.map((ex) => `
      <div class="ex-item">
        <div class="ex-en">${esc(ex.en)}</div>
        ${ex.ja ? `<div class="ex-ja">${esc(ex.ja)}</div>` : ''}
        ${ex.scene ? `<div class="ex-scene">${esc(ex.scene)}</div>` : ''}
      </div>`).join('');
    parts.push(dictBlock('例文', items));
  }

  // ---- Sentences (暗唱文) with inline speak ----
  if (Array.isArray(e.sentences) && e.sentences.length) {
    const items = e.sentences.map((sen) => `
      <div class="ex-item">
        <div class="ex-en">${esc(sen.en)} <button class="speak-inline dict-say" data-say="${esc(sen.en)}" aria-label="発音">🔊</button></div>
        ${sen.ja ? `<div class="ex-ja">${esc(sen.ja)}</div>` : ''}
        ${sen.scene ? `<div class="ex-scene">${esc(sen.scene)}</div>` : ''}
      </div>`).join('');
    parts.push(dictBlock('暗唱文', items));
  }

  // ---- Related lexis (chips) ----
  const lexChips = (label, items, sep) => {
    if (!arr(items)) return '';
    return `<div class="dict-lex-row"><span class="dict-lex-label">${esc(label)}</span><span class="tag-row">${items.map((x) => `<span class="tag-chip">${esc(x)}</span>`).join('')}</span></div>`;
  };
  let lex = '';
  lex += lexChips('類義語', e.synonyms);
  lex += lexChips('言い換え', e.paraphrases);
  lex += lexChips('反意語', e.antonyms);
  lex += lexChips('コロケーション', e.collocations);
  if (lex) parts.push(`<div class="fc-block">${lex}</div>`);

  // ---- Tags ----
  const tags = [];
  if (e.register) tags.push(e.register);
  if (arr(e.tags)) tags.push(...e.tags);
  if (tags.length) parts.push(`<div class="fc-block"><div class="tag-row">${tags.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('')}</div></div>`);

  // ---- "覚えた" action (applyGrade good 相当) ----
  parts.push(`<div class="dict-actions">
    <button class="dict-learned-btn" data-id="${esc(e.id)}">✓ 覚えた</button>
  </div>`);

  return parts.join('');
}
const dictBlock = (label, inner) => `<div class="fc-block"><div class="fc-block-label">${esc(label)}</div>${inner}</div>`;

function renderDictionary(focusId) {
  const list = $('#dictList');
  if (!list) return;
  // 復帰バーは returnTo がある時だけ表示
  const returnBar = $('#dictReturnBar');
  if (returnBar) returnBar.hidden = !State.returnTo;
  const deck = $('#dictDeck').value;
  const q = $('#dictSearch').value.trim().toLowerCase();
  list.innerHTML = '';
  let count = 0;
  let focusCard = null;
  for (const e of State.entries) {
    if (deck && e.deck !== deck) continue;
    if (q) {
      const hay = `${e.term} ${e.meaning_ja || ''}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    count++;
    const card = el('article', 'dict-card card');
    card.dataset.id = e.id;
    card.innerHTML = buildDictCard(e);
    // fit term font (single words never wrap)
    fitTermFont($('.dict-term', card));
    list.appendChild(card);
    if (focusId && e.id === focusId) focusCard = card;
  }
  $('#dictCount').textContent = `${count} 語`;
  if (!count) list.appendChild(el('p', 'muted', '該当する単語がありません'));
  // 対象カードを先頭表示(可能ならスクロール)
  if (focusCard) {
    focusCard.classList.add('dict-card-focus');
    requestAnimationFrame(() => {
      try { focusCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) { focusCard.scrollIntoView(); }
    });
  }
}

/* クイズの「もっと詳しく」→ 辞書でその単語だけを表示。
   戻り先(returnTo)を記録してから辞書タブへ遷移する。 */
function openDetailInDictionary(id) {
  const e = State.byId.get(id);
  if (!e) return;
  // 現在の学習セッションの続き(同じキュー・同じindex・同じモード)を保存
  State.returnTo = {
    session: State.session,
    studyMode: State.studyMode,
    quizLock: State.quizLock,
  };
  currentTab = 'dictionary';
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'dictionary'));
  showScreen('dictionary');
  $('#main').scrollTop = 0;
  // その単語のデッキに絞り、検索で当該語のみに(先頭表示 & スクロール)
  const dsel = $('#dictDeck');
  if (dsel) dsel.value = e.deck || '';
  const q = $('#dictSearch');
  if (q) q.value = e.term;
  renderDictionary(id);
}

/* 辞書ページの「学習に戻る」→ 記録した学習セッションの続きに復帰。 */
function returnToStudy() {
  const rt = State.returnTo;
  State.returnTo = null;
  const bar = $('#dictReturnBar');
  if (bar) bar.hidden = true;
  // 検索フィルタを解除しておく(次に辞書を普通に開いた時のため)
  const q = $('#dictSearch');
  if (q) q.value = '';
  if (rt && rt.session) {
    State.session = rt.session;
    State.studyMode = rt.studyMode || State.studyMode;
    State.quizLock = false;
    currentTab = 'study';
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'study'));
    showScreen('study');
    $('#main').scrollTop = 0;
    $('#studyDone').hidden = true;
    $('.study-topbar').hidden = false;
    syncModeToggle();
    if (State.session.active && State.session.index < State.session.queue.length) {
      renderStudyStep();
    } else {
      finishStudy(false);
    }
  } else {
    goTab('study');
  }
}

/* Delegated events for dictionary: speak buttons + 覚えた button */
function wireDictionary() {
  const list = $('#dictList');
  if (!list) return;
  list.addEventListener('click', (ev) => {
    const t = ev.target;
    const say = t && t.closest && t.closest('[data-say]');
    if (say) { ev.stopPropagation(); speak(say.dataset.say || ''); return; }
    const learned = t && t.closest && t.closest('.dict-learned-btn');
    if (learned) {
      const id = learned.dataset.id;
      applyGrade(id, 'good');
      // update the card's status badge in place
      const card = learned.closest('.dict-card');
      if (card) {
        const st = (State.progress[id] && State.progress[id].status) || 'new';
        const badge = $('.dict-status', card);
        if (badge) { badge.textContent = DICT_STATUS_LABEL[st] || st; badge.className = 'dict-status status-' + st; }
        learned.classList.add('is-done');
        learned.textContent = '✓ 記録しました';
      }
    }
  });
  $('#dictDeck').addEventListener('change', renderDictionary);
  let dictT;
  $('#dictSearch').addEventListener('input', () => { clearTimeout(dictT); dictT = setTimeout(renderDictionary, 120); });
}

/* ==========================================================================
   BOTTOM SHEET (card detail)
   ========================================================================== */
function openSheet(e) {
  const c = $('#sheetContent');
  const st = (State.progress[e.id] && State.progress[e.id].status) || 'new';
  const stLabel = { new: '未学習', learning: '学習中', review: '復習', mastered: '習得済み' }[st] || st;
  c.innerHTML = `
    <div class="fc-back-head">
      <span class="fc-back-term">${esc(e.term)}</span>
      ${e.ipa ? `<span class="fc-back-ipa">${esc(e.ipa)}</span>` : ''}
      <button class="speak-inline" id="sheetSpeak" aria-label="発音">🔊</button>
    </div>
    <div style="margin-bottom:12px"><span class="tag-chip">${stLabel}</span>
      ${e.pos ? `<span class="tag-chip">${esc(e.pos)}</span>` : ''}
      ${e.level ? `<span class="tag-chip">${esc(e.level)}</span>` : ''}</div>
    ${buildCardBack(e)}`;
  const speak1 = $('#sheetSpeak', c);
  if (speak1) speak1.addEventListener('click', () => speak(e.term));
  const bs = $('#backSpeak', c);
  if (bs) bs.addEventListener('click', () => speak(e.term));
  $$('.speak-inline', c).forEach((b) => { if (b.dataset.say) b.addEventListener('click', () => speak(b.dataset.say)); });

  const bd = $('#sheetBackdrop');
  bd.hidden = false;
  requestAnimationFrame(() => bd.classList.add('show'));
}
function closeSheet() {
  const bd = $('#sheetBackdrop');
  bd.classList.remove('show');
  setTimeout(() => { bd.hidden = true; }, 300);
}

/* ==========================================================================
   SETTINGS
   ========================================================================== */
function renderSettings() {
  // voices
  const vsel = $('#voiceSelect');
  vsel.innerHTML = '';
  refreshVoices();
  const ranked = rankedVoices();
  const pool = ranked.length ? ranked : State.voices;
  if (!pool.length) {
    const o = el('option'); o.textContent = '(利用可能な音声なし)'; vsel.appendChild(o);
  }
  for (const v of pool) {
    const o = el('option');
    o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})`;
    if (v.voiceURI === State.settings.voiceURI) o.selected = true;
    vsel.appendChild(o);
  }
  $('#rateSlider').value = State.settings.rate;
  $('#rateVal').textContent = Number(State.settings.rate).toFixed(2);

  // stats
  const s = computeStats();
  $('#statGrid').innerHTML = `
    ${statBox(s.total, '総語数')}
    ${statBox(s.mastered, '習得済み')}
    ${statBox(s.review + s.learning, '学習中')}
    ${statBox(s.due, '本日due')}`;

  const upd = State.meta && State.meta.updated ? ' ・ data ' + State.meta.updated : '';
  $('#versionNote').textContent = `Scholar Speak ${APP_VERSION}${upd}`;
}
const statBox = (n, l) => `<div class="stat-box"><span class="stat-box-num">${n}</span><span class="stat-box-lbl">${esc(l)}</span></div>`;

/* ==========================================================================
   Event wiring
   ========================================================================== */
function wire() {
  // tabs
  $$('.tab').forEach((t) => t.addEventListener('click', () => goTab(t.dataset.tab)));

  // home
  $('#startStudyBtn').addEventListener('click', () => startStudy());

  // study
  $('#flashcard').addEventListener('click', flipCard);
  $$('.grade-btn').forEach((b) => b.addEventListener('click', () => gradeCurrent(b.dataset.grade)));
  $('#studyDoneHome').addEventListener('click', () => goTab('home'));
  $$('#studyModeToggle .mode-btn').forEach((b) =>
    b.addEventListener('click', () => setStudyMode(b.dataset.mode)));

  // sentence
  $('#sentReveal').addEventListener('click', revealSentence);
  $('#sentSpeak').addEventListener('click', () => {
    const it = State.sent.items[State.sent.index];
    if (it) speak(it.en);
  });
  $('#blankToggle').addEventListener('change', showSentence);
  $('#sentPrev').addEventListener('click', () => {
    if (!State.sent.items.length) return;
    State.sent.index = (State.sent.index - 1 + State.sent.items.length) % State.sent.items.length;
    showSentence();
  });
  $('#sentNext').addEventListener('click', () => {
    if (!State.sent.items.length) return;
    State.sent.index = (State.sent.index + 1) % State.sent.items.length;
    showSentence();
  });

  // list
  let searchT;
  $('#searchInput').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(renderList, 120); });
  $('#filterDeck').addEventListener('change', renderList);
  $('#filterType').addEventListener('change', renderList);
  $('#filterStatus').addEventListener('change', renderList);

  // dictionary
  wireDictionary();

  // sheet
  $('#sheetBackdrop').addEventListener('click', (e) => { if (e.target === $('#sheetBackdrop')) closeSheet(); });

  // settings
  $('#rateSlider').addEventListener('input', (e) => {
    State.settings.rate = parseFloat(e.target.value);
    $('#rateVal').textContent = State.settings.rate.toFixed(2);
    saveSettings();
  });
  $('#voiceSelect').addEventListener('change', (e) => { State.settings.voiceURI = e.target.value; saveSettings(); });
  $('#testVoice').addEventListener('click', () => speak('This is a sample sentence for pronunciation practice.'));
  $('#reloadData').addEventListener('click', reloadAll);
  $('#reloadBtn').addEventListener('click', reloadAll);
  $('#emptyReload').addEventListener('click', reloadAll);
  $('#resetProgress').addEventListener('click', () => {
    if (confirm('学習進捗をすべてリセットしますか?この操作は取り消せません。')) {
      State.progress = {};
      ensureProgress();
      saveProgress();
      renderSettings();
      alert('進捗をリセットしました。');
    }
  });

  // voices load async
  if (window.speechSynthesis) {
    refreshVoices();
    speechSynthesis.onvoiceschanged = () => { refreshVoices(); if (currentTab === 'settings') renderSettings(); };
  }
}

async function reloadAll() {
  const ok = await loadData();
  if (ok) {
    populateFilters();
    goTab(currentTab === 'empty' ? 'home' : currentTab);
  } else {
    showScreen('empty');
  }
}

/* ==========================================================================
   Boot
   ========================================================================== */
async function boot() {
  loadSettings();
  loadProgress();
  wire();
  const ok = await loadData();
  if (ok) {
    populateFilters();
    goTab('home');
  } else {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'home'));
    showScreen('empty');
  }
  // register SW
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW reg failed', e));
    });
  }
}

document.addEventListener('DOMContentLoaded', boot);
