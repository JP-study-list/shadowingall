/* ================= 共用常數 ================= */
const PLAY_ICON  = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
const STOP_ICON  = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14"/></svg>';
const MOON_SVG   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
const SUN_SVG    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const BOOKMARK_SVG = `<svg viewBox="0 0 16 20" fill="currentColor"><path d="M2 0h12a2 2 0 0 1 2 2v18l-8-4-8 4V2a2 2 0 0 1 2-2z"/></svg>`;

/* ================= 頁面狀態 ================= */
let lessonData = [];       // 目前這課的 data 陣列（從 JSON 載入）
let speeds = {}, repeats = {}, textHidden = {}, chineseVisible = {}, furiganaVisible = {};
let currentAudio = null, currentBtn = null, currentRow = null, playAllQueue = null;
let isDark = false;

let bookmarks = JSON.parse(localStorage.getItem('shadowing-bookmarks') || '{}');

/* ================= 深色模式（與 index.html 共用同一把 localStorage key） ================= */
function applyTheme(dark) {
  isDark = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const btn = document.getElementById('darkToggle');
  if (btn) btn.innerHTML = dark ? SUN_SVG : MOON_SVG;
}

function toggleDark() {
  applyTheme(!isDark);
  localStorage.setItem('shadowing-dark', isDark ? '1' : '0');
}

/* ================= 書籤（含舊版孤立 key 的一次性搬移） ================= */
function migrateLegacyBookmarks(lessonNum) {
  const legacyKey = 'shadowing' + lessonNum + '-bookmarks';
  const legacy = localStorage.getItem(legacyKey);
  if (!legacy) return;
  try {
    bookmarks = { ...JSON.parse(legacy), ...bookmarks };
    localStorage.setItem('shadowing-bookmarks', JSON.stringify(bookmarks));
  } catch { /* 舊資料損毀就略過 */ }
  localStorage.removeItem(legacyKey);
}

function toggleBookmark(id) {
  bookmarks[id] = !bookmarks[id];
  if (bookmarks[id]) {
    lessonData.forEach(l => {
      if (l.id !== id) {
        bookmarks[l.id] = false;
        const b = document.getElementById('bookmark-' + l.id);
        if (b) b.classList.remove('marked');
      }
    });
  }
  localStorage.setItem('shadowing-bookmarks', JSON.stringify(bookmarks));
  document.getElementById('bookmark-' + id).classList.toggle('marked', bookmarks[id]);
}

/* ================= 播放控制 ================= */
function stopAll() {
  if (currentAudio) { currentAudio.onended = null; currentAudio.pause(); currentAudio = null; }
  if (currentBtn) { currentBtn.innerHTML = PLAY_ICON; currentBtn.classList.remove('playing'); currentBtn = null; }
  if (currentRow) { currentRow.classList.remove('is-playing'); currentRow = null; }
  if (playAllQueue) {
    const allBtn = document.getElementById('playall-' + playAllQueue.lessonId);
    if (allBtn) { allBtn.innerHTML = PLAY_ICON + ' 全部再生'; allBtn.classList.remove('playing'); }
    playAllQueue = null;
  }
}

function playAudio(lessonId, uttIndex, fromPlayAll) {
  const lesson = lessonData.find(l => l.id === lessonId);
  const btn = document.getElementById('btn-' + lessonId + '-' + uttIndex);
  const row = document.getElementById('utt-' + lessonId + '-' + uttIndex);
  const isSame = currentAudio && currentAudio._lessonId === lessonId && currentAudio._uttIndex === uttIndex;

  if (currentAudio) { currentAudio.onended = null; currentAudio.pause(); currentAudio = null; }
  if (currentBtn) { currentBtn.innerHTML = PLAY_ICON; currentBtn.classList.remove('playing'); currentBtn = null; }
  if (currentRow) { currentRow.classList.remove('is-playing'); currentRow = null; }
  if (!fromPlayAll && playAllQueue) {
    const allBtn = document.getElementById('playall-' + playAllQueue.lessonId);
    if (allBtn) { allBtn.innerHTML = PLAY_ICON + ' 全部再生'; allBtn.classList.remove('playing'); }
    playAllQueue = null;
  }

  if (isSame && !fromPlayAll) return;

  const audio = new Audio(lesson.utterances[uttIndex].audio);
  audio.playbackRate = speeds[lessonId];
  audio._lessonId = lessonId;
  audio._uttIndex = uttIndex;

  btn.innerHTML = PAUSE_ICON;
  btn.classList.add('playing');
  row.classList.add('is-playing');
  currentAudio = audio; currentBtn = btn; currentRow = row;

  audio.play().catch(e => console.error('Play failed:', e));

  audio.onended = () => {
    btn.innerHTML = PLAY_ICON; btn.classList.remove('playing');
    row.classList.remove('is-playing');
    currentAudio = null; currentBtn = null; currentRow = null;

    if (playAllQueue && playAllQueue.lessonId === lessonId) {
      const nextIndex = uttIndex + 1;
      if (nextIndex < lesson.utterances.length) {
        playAllQueue.index = nextIndex;
        setTimeout(() => playAudio(lessonId, nextIndex, true), 300);
      } else {
        const allBtn = document.getElementById('playall-' + lessonId);
        if (allBtn) { allBtn.innerHTML = PLAY_ICON + ' 全部再生'; allBtn.classList.remove('playing'); }
        playAllQueue = null;
        if (repeats[lessonId]) setTimeout(() => playAll(lessonId), 400);
      }
    } else if (repeats[lessonId] && !playAllQueue) {
      playAudio(lessonId, uttIndex, false);
    }
  };
}

function playAll(lessonId) {
  const allBtn = document.getElementById('playall-' + lessonId);
  if (playAllQueue && playAllQueue.lessonId === lessonId) { stopAll(); return; }
  stopAll();
  playAllQueue = { lessonId, index: 0 };
  allBtn.innerHTML = STOP_ICON + ' 停止';
  allBtn.classList.add('playing');
  playAudio(lessonId, 0, true);
}

function setSpeed(lessonId, speed) {
  speeds[lessonId] = speed;
  if (currentAudio && currentAudio._lessonId === lessonId) currentAudio.playbackRate = speed;
  [0.75, 1.0, 1.25, 1.5].forEach(s => {
    const b = document.getElementById('speed-' + lessonId + '-' + s.toString().replace('.', '_'));
    if (b) b.classList.toggle('active', s === speed);
  });
}

function toggleRepeat(lessonId) {
  repeats[lessonId] = !repeats[lessonId];
  document.getElementById('repeat-' + lessonId).classList.toggle('active', repeats[lessonId]);
}

function toggleText(lessonId) {
  textHidden[lessonId] = !textHidden[lessonId];
  const hidden = textHidden[lessonId];
  document.querySelectorAll('#card-' + lessonId.replace('-', '_') + ' .utterance-text')
    .forEach(el => el.classList.toggle('hidden', hidden));
  const btn = document.getElementById('hide-' + lessonId);
  btn.textContent = hidden ? '日文顯示' : '日文隱藏';
  btn.classList.toggle('active', hidden);
}

function toggleChinese(lessonId) {
  chineseVisible[lessonId] = !chineseVisible[lessonId];
  const visible = chineseVisible[lessonId];
  document.querySelectorAll('#card-' + lessonId.replace('-', '_') + ' .sub-text')
    .forEach(el => el.classList.toggle('visible', visible));
  const btn = document.getElementById('zh-' + lessonId);
  btn.classList.toggle('active', visible);
}

function toggleFurigana(lessonId) {
  furiganaVisible[lessonId] = !furiganaVisible[lessonId];
  const visible = furiganaVisible[lessonId];
  const lesson = lessonData.find(l => l.id === lessonId);
  lesson.utterances.forEach((u, i) => {
    const el = document.getElementById('text-' + lessonId + '-' + i);
    if (el) el.innerHTML = visible ? u.furigana : u.text;
  });
  const btn = document.getElementById('fg-' + lessonId);
  btn.classList.toggle('active', visible);
}

function toggleGrammar(lessonId) {
  const block = document.getElementById('grammar-' + lessonId);
  const btn = document.getElementById('grammar-btn-' + lessonId);
  const isOpen = block.classList.toggle('open');
  btn.classList.toggle('active', isOpen);
  btn.textContent = isOpen ? '詳解 ▲' : '詳解';
}

/* ================= 建立 UI ================= */
function buildUI() {
  const container = document.getElementById('lessons');
  container.innerHTML = '';
  lessonData.forEach(lesson => {
    speeds[lesson.id] = 1.0;
    repeats[lesson.id] = false;
    textHidden[lesson.id] = false;
    chineseVisible[lesson.id] = false;
    furiganaVisible[lesson.id] = false;

    const card = document.createElement('div');
    card.className = 'lesson-card';
    card.id = 'card-' + lesson.id.replace('-', '_');

    const uttHTML = lesson.utterances.map((u, i) => `
      <div class="utterance speaker-${u.speaker}" id="utt-${lesson.id}-${i}">
        <div class="speaker-badge">${u.speaker}</div>
        <div class="text-area">
          <div class="utterance-text" id="text-${lesson.id}-${i}">${u.text}</div>
          <div class="sub-text">${u.chinese}</div>
        </div>
        <button class="play-btn" id="btn-${lesson.id}-${i}" onclick="playAudio('${lesson.id}', ${i}, false)" aria-label="再生">
          ${PLAY_ICON}
        </button>
      </div>
    `).join('');

    const speedBtns = [0.75, 1.0, 1.25, 1.5].map(s =>
      `<button class="speed-btn ${s === 1.0 ? 'active' : ''}" id="speed-${lesson.id}-${s.toString().replace('.', '_')}" onclick="setSpeed('${lesson.id}', ${s})">${s}x</button>`
    ).join('');

    const hasGrammar = lesson.utterances.some(u => u.grammar && u.grammar.length > 0);
    const grammarHTML = hasGrammar ? `
      <div class="grammar-block" id="grammar-${lesson.id}">
        <div class="grammar-inner">
          ${lesson.utterances.filter(u => u.grammar && u.grammar.length > 0).map(u => `
            <div class="grammar-sentence">
              <div class="grammar-sentence-label">${u.speaker}：${u.text}</div>
              ${u.grammar.map(g => `
                <div class="grammar-item">
                  <div class="grammar-term">${g.term}</div>
                  <div class="grammar-desc">${g.desc}</div>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    const grammarBtn = hasGrammar
      ? `<button class="grammar-btn" id="grammar-btn-${lesson.id}" onclick="toggleGrammar('${lesson.id}')">詳解</button>`
      : '';

    card.innerHTML = `
      <div class="lesson-header">
        <div class="header-left">
          <button class="bookmark-btn ${bookmarks[lesson.id] ? 'marked' : ''}" id="bookmark-${lesson.id}" onclick="toggleBookmark('${lesson.id}')" title="書籤">${BOOKMARK_SVG}</button>
          <span class="lesson-num">${lesson.id}</span>
          <button class="mini-btn" id="hide-${lesson.id}" onclick="toggleText('${lesson.id}')">日文隱藏</button>
          <button class="mini-btn" id="fg-${lesson.id}" onclick="toggleFurigana('${lesson.id}')">平假名</button>
          <button class="mini-btn" id="zh-${lesson.id}" onclick="toggleChinese('${lesson.id}')">中文</button>
        </div>
        <div class="header-right-btns">
          <button class="play-all-btn" id="playall-${lesson.id}" onclick="playAll('${lesson.id}')">
            ${PLAY_ICON} 全部再生
          </button>
        </div>
      </div>
      <div class="utterances">${uttHTML}</div>
      <div class="speed-controls">
        <span class="speed-label">速度</span>${speedBtns}
        ${grammarBtn}
        <button class="repeat-btn" id="repeat-${lesson.id}" onclick="toggleRepeat('${lesson.id}')">↺ リピート</button>
      </div>
      ${grammarHTML}
    `;
    container.appendChild(card);
  });
}

/* ================= 頁面初始化：讀取 ?id= 對應的 JSON ================= */
async function initLesson() {
  applyTheme(localStorage.getItem('shadowing-dark') === '1');

  const params = new URLSearchParams(location.search);
  const num = parseInt(params.get('id'), 10) || 1;
  const padded = String(num).padStart(2, '0');

  migrateLegacyBookmarks(num);

  const container = document.getElementById('lessons');
  try {
    const res = await fetch(`data/lesson${padded}.json`);
    if (!res.ok) throw new Error('lesson not found');
    const json = await res.json();

    lessonData = json.data;
    document.title = `Shadowing ${num} · ${json.title}`;
    const siteTitleEl = document.getElementById('siteTitle');
    const lessonTitleEl = document.getElementById('lessonTitle');
    if (siteTitleEl) siteTitleEl.textContent = 'Shadowing ' + num;
    if (lessonTitleEl) lessonTitleEl.textContent = json.title;

    buildUI();
  } catch (e) {
    container.innerHTML = '<div class="lesson-empty">此課程尚未上線</div>';
  }
}

document.addEventListener('DOMContentLoaded', initLesson);
