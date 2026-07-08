import { generateMap } from './voronoi.js?v=1.1.1';
import { minColors, solveFrom } from './solver.js?v=1.1.1';

// Okabe–Ito colors: distinguishable under common color-vision deficiencies.
const PALETTE = ['#0072B2', '#E69F00', '#009E73', '#CC79A7'];
const GLYPHS = ['╱', '●', '▬', '✚']; // shown on swatches in pattern mode
const SIZES = { small: 10, medium: 18, large: 30 };
const LEVEL_COUNT = 60;
const STORE_KEY = 'tetrachrome.v1';
const UNDO_CAP = 200;

// Deterministic per-level seed so every player gets identical maps.
function levelSeed(k) {
  let h = (k + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Difficulty ramp: 6 regions at level 1 up to ~47 at level 60.
const levelRegions = (k) => 6 + Math.round((k - 1) * 0.7);

function dailyKey() {
  const d = new Date();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${d.getUTCFullYear()}-${m}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function dailySeed(key) {
  let h = 0;
  for (const ch of key) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h;
}

const board = document.getElementById('board');
const statusEl = document.getElementById('status');
const levelLabel = document.getElementById('level-label');
const paletteEl = document.getElementById('palette');
const winEl = document.getElementById('win');
const winTitle = document.getElementById('win-title');
const winEmoji = document.getElementById('win-emoji');
const winStats = document.getElementById('win-stats');
const winNext = document.getElementById('win-next');
const newMapBtn = document.getElementById('new-map');
const levelsEl = document.getElementById('levels');
const levelGrid = document.getElementById('level-grid');
const dailyBtn = document.getElementById('daily-btn');
const winShare = document.getElementById('win-share');
const statsEl = document.getElementById('stats');
const statGrid = document.getElementById('stat-grid');
const patternsBtn = document.getElementById('patterns-btn');
const undoBtn = document.getElementById('undo');
const toastEl = document.getElementById('toast');

let mode = 'campaign'; // 'campaign' | 'free' | 'daily'
let level = 1;
let freeSize = 'medium';
let map;
let fills; // -1 = uncolored, 0..3 = palette index
let par = 4;
let selected = 0; // -1 = eraser
let moves = 0;
let hintsUsed = 0;
let undoStack = [];
let lastResult = null; // details of the most recent win, for sharing

// ---------- persistence ----------

function loadProgress() {
  const defaults = {
    current: 1, levels: {}, daily: {},
    settings: { patterns: false }, stats: { freeSolved: 0 },
  };
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && typeof data === 'object') {
      return {
        ...defaults, ...data,
        settings: { ...defaults.settings, ...data.settings },
        stats: { ...defaults.stats, ...data.stats },
      };
    }
  } catch { /* corrupted storage: start fresh */ }
  return defaults;
}

const progress = loadProgress();

const saveProgress = () => localStorage.setItem(STORE_KEY, JSON.stringify(progress));

const isUnlocked = (k) => k === 1 || !!progress.levels[k - 1]?.solved;

// ---------- rendering ----------

const SVG = 'http://www.w3.org/2000/svg';
function el(name, attrs) {
  const e = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

const pathD = (poly) =>
  'M' + poly.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L') + 'Z';

const MARK = 'rgba(255,255,255,0.55)';

function defsMarkup() {
  const cell = (i, marks) =>
    `<pattern id="pat${i}" width="10" height="10" patternUnits="userSpaceOnUse">` +
    `<rect width="10" height="10" fill="${PALETTE[i]}"/>${marks}</pattern>`;
  return '<defs>' +
    cell(0, `<path d="M-1,1 l2,-2 M0,10 L10,0 M9,11 l2,-2" stroke="${MARK}" stroke-width="2"/>`) +
    cell(1, `<circle cx="5" cy="5" r="2.2" fill="${MARK}"/>`) +
    cell(2, `<rect y="4" width="10" height="2.4" fill="${MARK}"/>`) +
    cell(3, `<path d="M5,0 V10 M0,5 H10" stroke="${MARK}" stroke-width="1.8"/>`) +
    '</defs>';
}

const fillFor = (c) => (progress.settings.patterns ? `url(#pat${c})` : PALETTE[c]);

function renderBoard() {
  board.innerHTML = defsMarkup();
  const cells = el('g', { id: 'cells' });
  map.cells.forEach((c, i) => {
    cells.appendChild(el('path', { d: pathD(c.poly), class: 'region', 'data-i': i }));
  });
  board.appendChild(cells);
  board.appendChild(el('g', { id: 'conflicts' }));
}

// ---------- game setup ----------

function setupMap(seed, regions) {
  map = generateMap(seed, regions);
  par = minColors(map.adjacency);
  fills = new Array(map.cells.length).fill(-1);
  moves = 0;
  hintsUsed = 0;
  undoStack = [];
  winEl.hidden = true;
  renderBoard();
  update();
}

function startLevel(k) {
  mode = 'campaign';
  level = k;
  progress.current = k;
  saveProgress();
  newMapBtn.hidden = true;
  setupMap(levelSeed(k), levelRegions(k));
  levelLabel.textContent = `Level ${k} · Par ${par}`;
}

function startFree(size) {
  mode = 'free';
  freeSize = size;
  newMapBtn.hidden = false;
  setupMap((Math.random() * 2 ** 32) >>> 0, SIZES[size]);
  levelLabel.textContent = `Free play · Par ${par}`;
}

function startDaily() {
  mode = 'daily';
  const key = dailyKey();
  newMapBtn.hidden = true;
  const seed = dailySeed(key);
  setupMap(seed, 18 + (seed % 15)); // 18–32 regions
  levelLabel.textContent = `Daily ${key} · Par ${par}`;
}

// ---------- game loop ----------

const conflicts = () =>
  map.edges.filter((e) => fills[e.a] >= 0 && fills[e.a] === fills[e.b]);

function update() {
  board.querySelectorAll('.region').forEach((p) => {
    const c = fills[+p.dataset.i];
    p.classList.toggle('filled', c >= 0);
    p.style.fill = c >= 0 ? fillFor(c) : '';
  });

  const g = board.querySelector('#conflicts');
  g.innerHTML = '';
  const bad = conflicts();
  for (const e of bad) {
    g.appendChild(el('line', { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, class: 'conflict' }));
  }

  const done = fills.filter((c) => c >= 0).length;
  statusEl.textContent =
    `${done} / ${fills.length} colored` +
    (bad.length ? ` · ${bad.length} clash${bad.length > 1 ? 'es' : ''}` : '');
  statusEl.classList.toggle('bad', bad.length > 0);

  undoBtn.disabled = undoStack.length === 0;

  if (done === fills.length && bad.length === 0) win();
}

function win() {
  const used = new Set(fills).size;
  const perfect = used <= par && hintsUsed === 0;
  lastResult = {
    key: dailyKey(), regions: fills.length, moves, used, par, perfect,
    hints: hintsUsed, counts: PALETTE.map((_, c) => fills.filter((f) => f === c).length),
  };

  if (mode === 'free') {
    progress.stats.freeSolved++;
    saveProgress();
  } else if (mode === 'campaign') {
    const rec = progress.levels[level] ?? {};
    progress.levels[level] = {
      solved: true,
      perfect: rec.perfect || perfect,
      bestMoves: Math.min(rec.bestMoves ?? Infinity, moves),
    };
    saveProgress();
  } else if (mode === 'daily') {
    const key = dailyKey();
    const rec = progress.daily[key] ?? {};
    progress.daily[key] = {
      solved: true,
      perfect: rec.perfect || perfect,
      bestMoves: Math.min(rec.bestMoves ?? Infinity, moves),
    };
    saveProgress();
    refreshDailyBtn();
  }

  winEmoji.textContent = perfect ? '⭐' : '🎉';
  winTitle.textContent = perfect ? 'Perfect!' : 'Solved!';
  winStats.textContent =
    `${fills.length} regions in ${moves} moves — ${used} colors used (par ${par})` +
    (hintsUsed ? ` · ${hintsUsed} hint${hintsUsed > 1 ? 's' : ''}` : '') +
    (mode === 'daily' ? '. New puzzle tomorrow!' : '');
  winNext.hidden = mode !== 'campaign' || level >= LEVEL_COUNT;
  winShare.hidden = mode !== 'daily';
  winEl.hidden = false;
}

// ---------- share ----------

async function shareDaily() {
  if (!lastResult || mode !== 'daily') return;
  const r = lastResult;
  const squares = ['🟦', '🟧', '🟩', '🟪'];
  const spread = r.counts
    .map((n, i) => (n ? `${squares[i]}${n}` : ''))
    .filter(Boolean)
    .join(' ');
  const text =
    `Tetrachrome Daily ${r.key}\n` +
    `${r.perfect ? '⭐' : '✅'} ${r.regions} regions · ${r.moves} moves · ` +
    `${r.used}/${r.par} colors${r.hints ? ` · ${r.hints} hint${r.hints > 1 ? 's' : ''}` : ''}\n` +
    `${spread}\n` +
    'https://masarusz.github.io/tetrachrome/';
  try {
    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
      showToast('Result copied to clipboard');
    }
  } catch { /* user dismissed the share sheet */ }
}

// ---------- stats ----------

function computeStats() {
  const lv = Object.values(progress.levels);
  const days = Object.keys(progress.daily)
    .filter((k) => progress.daily[k].solved)
    .sort();
  const DAY = 86400000;
  const toUTC = (k) => Date.parse(`${k}T00:00:00Z`);
  const fromUTC = (t) => new Date(t).toISOString().slice(0, 10);

  let best = 0, run = 0, prev = null;
  for (const k of days) {
    const t = toUTC(k);
    run = prev !== null && t - prev === DAY ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  const set = new Set(days);
  let cursor = toUTC(dailyKey());
  if (!set.has(dailyKey())) cursor -= DAY; // streak survives until today is missed
  let cur = 0;
  while (set.has(fromUTC(cursor))) { cur++; cursor -= DAY; }

  return {
    levelsSolved: lv.filter((r) => r.solved).length,
    stars: lv.filter((r) => r.perfect).length,
    dailies: days.length,
    perfectDailies: days.filter((k) => progress.daily[k].perfect).length,
    curStreak: cur,
    bestStreak: best,
    freeSolved: progress.stats.freeSolved,
  };
}

function openStats() {
  const s = computeStats();
  const tiles = [
    [`${s.levelsSolved}/${LEVEL_COUNT}`, 'Levels solved'],
    [s.stars, '⭐ Perfect levels'],
    [s.dailies, 'Dailies solved'],
    [s.perfectDailies, '⭐ Perfect dailies'],
    [s.curStreak, 'Daily streak'],
    [s.bestStreak, 'Best streak'],
    [s.freeSolved, 'Free play wins'],
  ];
  statGrid.innerHTML = '';
  for (const [num, label] of tiles) {
    const d = document.createElement('div');
    d.className = 'stat';
    const b = document.createElement('b');
    b.textContent = num;
    const sp = document.createElement('span');
    sp.textContent = label;
    d.append(b, sp);
    statGrid.appendChild(d);
  }
  statsEl.hidden = false;
}

function snapshot() {
  undoStack.push({ fills: [...fills], moves });
  if (undoStack.length > UNDO_CAP) undoStack.shift();
}

function paint(i) {
  if (!winEl.hidden) return;
  snapshot();
  fills[i] = selected === -1 || fills[i] === selected ? -1 : selected;
  moves++;
  update();
}

function undo() {
  if (!winEl.hidden || undoStack.length === 0) return;
  ({ fills, moves } = undoStack.pop());
  update();
}

function clearBoard() {
  if (!winEl.hidden || fills.every((c) => c < 0)) return;
  snapshot();
  fills.fill(-1);
  update();
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

function hint() {
  if (!winEl.hidden) return;
  // Let the solver recolor conflicted regions; everything else is fixed.
  const conflicted = new Set();
  for (const e of conflicts()) { conflicted.add(e.a); conflicted.add(e.b); }
  const preset = fills.map((c, i) => (conflicted.has(i) ? -1 : c));
  const sol = solveFrom(map.adjacency, 4, preset);
  if (!sol) {
    showToast('No way to finish from here — undo or clear');
    return;
  }
  // Fix a conflicted region first; otherwise fill the most-constrained empty one.
  let pick = -1;
  if (conflicted.size) {
    pick = [...conflicted][0];
  } else {
    let bestDeg = -1;
    fills.forEach((c, i) => {
      if (c < 0 && map.adjacency[i].length > bestDeg) { pick = i; bestDeg = map.adjacency[i].length; }
    });
  }
  if (pick < 0) return;
  snapshot();
  fills[pick] = sol[pick];
  moves++;
  hintsUsed++;
  update();
  const region = board.querySelector(`.region[data-i="${pick}"]`);
  region.classList.add('hinted');
  setTimeout(() => region.classList.remove('hinted'), 1600);
}

function select(i) {
  selected = i;
  paletteEl.querySelectorAll('.swatch').forEach((b) => {
    b.classList.toggle('selected', +b.dataset.color === i);
  });
}

function buildPalette() {
  PALETTE.forEach((hex, i) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.setProperty('--c', hex);
    b.dataset.color = i;
    b.setAttribute('aria-label', `Color ${i + 1}`);
    b.addEventListener('click', () => select(i));
    paletteEl.appendChild(b);
  });
  const e = document.createElement('button');
  e.className = 'swatch eraser';
  e.dataset.color = -1;
  e.textContent = '⌫';
  e.setAttribute('aria-label', 'Eraser');
  e.addEventListener('click', () => select(-1));
  paletteEl.appendChild(e);
  select(0);
  refreshPatternUI();
}

function refreshPatternUI() {
  const on = progress.settings.patterns;
  patternsBtn.setAttribute('aria-pressed', String(on));
  patternsBtn.classList.toggle('on', on);
  paletteEl.querySelectorAll('.swatch:not(.eraser)').forEach((b, i) => {
    b.textContent = on ? GLYPHS[i] : '';
  });
}

function togglePatterns() {
  progress.settings.patterns = !progress.settings.patterns;
  saveProgress();
  refreshPatternUI();
  update();
}

const refreshDailyBtn = () =>
  dailyBtn.classList.toggle('done', !!progress.daily[dailyKey()]?.solved);

// ---------- level select ----------

function buildLevelGrid() {
  levelGrid.innerHTML = '';
  for (let k = 1; k <= LEVEL_COUNT; k++) {
    const rec = progress.levels[k];
    const b = document.createElement('button');
    b.className = 'level-btn';
    b.dataset.level = k;
    if (rec?.solved) b.classList.add(rec.perfect ? 'perfect' : 'solved');
    if (!isUnlocked(k)) {
      b.classList.add('locked');
      b.disabled = true;
      b.setAttribute('aria-label', `Level ${k} (locked)`);
    }
    if (mode === 'campaign' && k === level) b.classList.add('current');
    b.textContent = rec?.perfect ? '★' : k;
    b.addEventListener('click', () => {
      closeLevels();
      startLevel(k);
    });
    levelGrid.appendChild(b);
  }
}

const openLevels = () => {
  buildLevelGrid();
  levelsEl.hidden = false;
};
const closeLevels = () => { levelsEl.hidden = true; };

// ---------- events ----------

board.addEventListener('click', (ev) => {
  const t = ev.target.closest('.region');
  if (t) paint(+t.dataset.i);
});

document.getElementById('levels-btn').addEventListener('click', openLevels);
document.getElementById('levels-close').addEventListener('click', closeLevels);
levelsEl.addEventListener('click', (ev) => {
  if (ev.target === levelsEl) closeLevels();
});

document.querySelectorAll('.size-btn').forEach((b) => {
  b.addEventListener('click', () => {
    closeLevels();
    startFree(b.dataset.size);
  });
});

dailyBtn.addEventListener('click', startDaily);
winShare.addEventListener('click', shareDaily);
document.getElementById('stats-btn').addEventListener('click', openStats);
document.getElementById('stats-close').addEventListener('click', () => { statsEl.hidden = true; });
statsEl.addEventListener('click', (ev) => {
  if (ev.target === statsEl) statsEl.hidden = true;
});
patternsBtn.addEventListener('click', togglePatterns);
undoBtn.addEventListener('click', undo);
document.getElementById('hint').addEventListener('click', hint);
document.getElementById('clear').addEventListener('click', clearBoard);
newMapBtn.addEventListener('click', () => startFree(freeSize));

document.getElementById('win-again').addEventListener('click', () => {
  if (mode === 'campaign') startLevel(level);
  else if (mode === 'daily') startDaily();
  else startFree(freeSize);
});
winNext.addEventListener('click', () => startLevel(level + 1));

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { closeLevels(); statsEl.hidden = true; }
  if (ev.key >= '1' && ev.key <= '4') select(+ev.key - 1);
  else if (ev.key === 'e' || ev.key === '0') select(-1);
  else if (ev.key === 'r') clearBoard();
  else if (ev.key === 'z') undo();
  else if (ev.key === 'h') hint();
});

// Debug hook for automated verification; not part of the game API.
window.__tetra = {
  get map() { return map; },
  get fills() { return fills; },
  get par() { return par; },
  get level() { return level; },
  get mode() { return mode; },
  get progress() { return progress; },
  get undoDepth() { return undoStack.length; },
};

buildPalette();
refreshDailyBtn();
startLevel(isUnlocked(progress.current) ? progress.current : 1);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline play unavailable */ });
}
