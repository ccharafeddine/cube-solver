import './style.css';
import { CubeView, COLORS, COLOR_NAMES } from './ui/scene';
import { applyTurn, moveToTurn, solved, isSolved, type State } from './cube/facelets';
import { parseMoves, formatMoves, invertMoves } from './cube/notation';
import { solvedCubie, toFacelets, parity, type Cubie } from './cube/cubie';
import { randomState2 } from './solver/solver2';
import type { AnalyzeRequest, AnalyzeResponse, Mode } from './solver/protocol';
import { ergonomicCost } from './solver/rank';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- state ----------
const saved = JSON.parse(localStorage.getItem('cube-solver-settings') ?? '{}');
let n: 2 | 3 = saved.n === 2 ? 2 : 3;
let mode: Mode = saved.mode === 'optimal' ? 'optimal' : 'fast';
let beginner: boolean = saved.beginner ?? true;
let thinkMs: number = saved.thinkMs ?? 2000;
let paintColor: number | null = null;
let state: State = solved(n);
const history: State[] = [];
let solution: string[] = [];
let solutionPos = 0;
let pendingScramble = false;

const persist = () => localStorage.setItem('cube-solver-settings', JSON.stringify({ n, mode, beginner, thinkMs }));

const view = new CubeView($('viewport'));
view.build(n);
view.setState(state);

// ---------- solver worker ----------
let worker: Worker | null = null;
let workerBusy = false;
let reqId = 0;

function newWorker() {
  worker?.terminate();
  worker = new Worker(new URL('./solver/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<AnalyzeResponse>) => onResult(e.data);
}

let analyzeTimer = 0;
function requestAnalysis() {
  clearTimeout(analyzeTimer);
  analyzeTimer = window.setTimeout(() => {
    // A busy worker cannot be interrupted, so replace it (tables rebuild in the new one).
    if (!worker || workerBusy) newWorker();
    workerBusy = true;
    const req: AnalyzeRequest = { id: ++reqId, n, state: Array.from(state), mode, beginner, timeMs: thinkMs };
    setStatus('thinking', mode === 'optimal' && n === 3 ? 'Searching for the optimal solution…' : 'Solving…');
    worker!.postMessage(req);
  }, 120);
}

function stopAnalysis() {
  newWorker();
  workerBusy = false;
  setStatus('ok', 'Stopped.');
}

function onResult(r: AnalyzeResponse) {
  if (r.id !== reqId) return;
  if (r.kind === 'invalid') {
    workerBusy = false;
    setStatus('bad', r.error);
    solution = [];
    renderSolution();
    $('candidates').innerHTML = '';
    $('cand-note').textContent = '';
    $('method').innerHTML = '';
    return;
  }
  solution = r.solution;
  solutionPos = 0;
  if (r.final) workerBusy = false;
  if (r.final && pendingScramble) {
    pendingScramble = false;
    $<HTMLInputElement>('alg').value = formatMoves(invertMoves(parseMoves(solution.join(' '))));
  }
  const solvedNow = isSolved(state, n);
  const kind = solvedNow ? 'Solved!' : r.optimal ? `Optimal: ${r.qtm} quarter turns` : `${r.final ? 'Best found' : 'Searching… best so far'}: ${r.qtm} quarter turns`;
  setStatus(r.final ? 'ok' : 'thinking', kind + (r.note ? ` — ${r.note}` : ''));
  renderSolution();
  if (r.candidates) renderCandidates(r.candidates, r.qtm);
  renderMethod(r.method);
}

// ---------- rendering ----------
function setStatus(kind: 'ok' | 'bad' | 'thinking', text: string) {
  const el = $('status');
  el.className = `status ${kind}`;
  el.textContent = text;
}

function renderSolution() {
  const el = $('solution');
  el.innerHTML = '';
  solution.forEach((m, i) => {
    const s = document.createElement('span');
    s.textContent = m;
    s.className = 'mv' + (i < solutionPos ? ' done' : i === solutionPos ? ' next' : '');
    el.appendChild(s);
  });
  $('sol-count').textContent = solution.length ? `${solution.reduce((a, m) => a + (m.endsWith('2') ? 2 : 1), 0)} QTM · ${solution.length} HTM` : '';
}

function renderCandidates(cs: { move: string; distance: number; delta: number; exact: boolean; score: number }[], current: number) {
  const el = $('candidates');
  el.innerHTML = '';
  const shown = cs.slice(0, Number($<HTMLSelectElement>('topn').value) || cs.length);
  shown.forEach((c, i) => {
    const row = document.createElement('button');
    row.className = 'cand' + (c.delta < 0 ? ' good' : c.delta > 0 ? ' bad' : '');
    const d = c.delta === 0 ? '±0' : c.delta > 0 ? `+${c.delta}` : `${c.delta}`;
    row.innerHTML = `<b>${i + 1}.</b><span class="mono">${c.move}</span><span>${c.exact ? '' : '≈'}${c.distance} to go</span><span class="delta">${d}</span>` +
      (beginner ? `<span class="ease" title="ease by hand (lower is easier)">ease ${ergonomicCost(c.move).toFixed(1)}</span>` : '');
    row.onclick = () => doMoves(c.move);
    el.appendChild(row);
  });
  $('cand-note').textContent = current === 0 ? 'Already solved.' : beginner
    ? 'Beginner ranking: distance blended with how easy the turn is by hand.'
    : 'Ranked by distance to solved only.';
}

function renderMethod(steps?: { name: string; moves: string }[]) {
  const el = $('method');
  el.innerHTML = '';
  if (n !== 3) {
    el.innerHTML = '<p class="muted">Method breakdowns are for the 3x3. The 2x2 solution above is already optimal.</p>';
    return;
  }
  if (!steps) return;
  if (!steps.length) el.innerHTML = '<p class="muted">Nothing to do: the cube is solved.</p>';
  steps.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'step';
    row.innerHTML = `<div class="step-name">${i + 1}. ${s.name} <small>${s.moves.split(' ').length} moves</small></div><div class="mono">${s.moves}</div>`;
    const play = document.createElement('button');
    play.textContent = 'Play step';
    play.onclick = () => doMoves(s.moves);
    row.appendChild(play);
    el.appendChild(row);
  });
}

// ---------- actions ----------
function setState(s: State, record = true) {
  if (record) history.push(state);
  state = s;
  view.setState(state);
  requestAnalysis();
}

async function doMoves(text: string, record = true) {
  let moves;
  try {
    moves = parseMoves(text);
  } catch (e) {
    setStatus('bad', (e as Error).message);
    return;
  }
  if (record) history.push(state);
  for (const m of moves) {
    if (m.depth >= n) m.depth = n - 1 || 1;
    const t = moveToTurn(m, n);
    state = applyTurn(state, n, t);
    void view.animate(t, state, Number($<HTMLInputElement>('speed').value));
  }
  requestAnalysis();
}

function randomCubie3(): Cubie {
  const shuffle = (a: number[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const c = solvedCubie();
  c.cp = shuffle(c.cp);
  c.ep = shuffle(c.ep);
  if (parity(c.cp) !== parity(c.ep)) [c.ep[0], c.ep[1]] = [c.ep[1], c.ep[0]];
  c.co = c.co.map(() => Math.floor(Math.random() * 3));
  c.co[7] = (3 - (c.co.slice(0, 7).reduce((a, b) => a + b, 0) % 3)) % 3;
  c.eo = c.eo.map(() => Math.floor(Math.random() * 2));
  c.eo[11] = c.eo.slice(0, 11).reduce((a, b) => a + b, 0) % 2;
  return c;
}

function scramble() {
  const f = toFacelets(n === 2 ? randomState2() : randomCubie3());
  const s = n === 2 ? corners(f) : f;
  pendingScramble = true;
  setState(s);
}

/** 2x2 stickers are the corner stickers of the 3x3 layout. */
function corners(f: State): State {
  const out = new Uint8Array(24);
  for (let face = 0; face < 6; face++)
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) out[face * 4 + r * 2 + c] = f[face * 9 + r * 6 + c * 2];
  return out;
}

function setSize(size: 2 | 3) {
  n = size;
  persist();
  history.length = 0;
  state = solved(n);
  view.build(n);
  view.setState(state);
  syncControls();
  requestAnalysis();
}

// ---------- controls ----------
function syncControls() {
  document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) => b.classList.toggle('on', Number(b.dataset.size) === n));
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('mode-group').classList.toggle('hidden', n !== 3);
  $('method-card').classList.toggle('hidden', n !== 3);
  $<HTMLInputElement>('beginner').checked = beginner;
  $<HTMLSelectElement>('think').value = String(thinkMs);
  document.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => b.classList.toggle('on', Number(b.dataset.color) === paintColor));
  $('paint-hint').textContent = paintColor === null ? 'Pick a colour, then click stickers to paint. Drag to rotate.' : `Painting ${COLOR_NAMES[paintColor]}: click any sticker. Press Esc to stop.`;
}

document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) => (b.onclick = () => setSize(Number(b.dataset.size) as 2 | 3)));
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => (b.onclick = () => { mode = b.dataset.mode as Mode; persist(); syncControls(); requestAnalysis(); }));
$<HTMLInputElement>('beginner').onchange = (e) => { beginner = (e.target as HTMLInputElement).checked; persist(); requestAnalysis(); };
$<HTMLSelectElement>('think').onchange = (e) => { thinkMs = Number((e.target as HTMLSelectElement).value); persist(); requestAnalysis(); };
$<HTMLSelectElement>('topn').onchange = () => requestAnalysis();
$('reset').onclick = () => { $<HTMLInputElement>('alg').value = ''; setState(solved(n)); };
$('scramble').onclick = scramble;
$('undo').onclick = () => { const s = history.pop(); if (s) setState(s, false); };
$('stop').onclick = stopAnalysis;
$('view-reset').onclick = () => view.resetView();
$('apply').onclick = () => doMoves($<HTMLInputElement>('alg').value);
$<HTMLInputElement>('alg').onkeydown = (e) => { if (e.key === 'Enter') doMoves((e.target as HTMLInputElement).value); };
$('play').onclick = () => { const rest = solution.slice(solutionPos); if (rest.length) { solutionPos = solution.length; doMoves(rest.join(' ')); } };
$('step').onclick = () => { if (solutionPos < solution.length) { const m = solution[solutionPos++]; renderSolution(); doMoves(m); } };

const pad = $('movepad');
for (const f of 'URFDLB') for (const suffix of ['', "'", '2']) {
  const b = document.createElement('button');
  b.textContent = f + suffix;
  b.className = 'mono';
  b.onclick = () => doMoves(f + suffix);
  pad.appendChild(b);
}

const palette = $('palette');
COLORS.forEach((c, i) => {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.dataset.color = String(i);
  b.style.background = c;
  b.title = COLOR_NAMES[i];
  b.onclick = () => { paintColor = paintColor === i ? null : i; syncControls(); };
  palette.appendChild(b);
});
view.onStickerClick = (i) => {
  if (paintColor === null) return;
  const s = state.slice();
  s[i] = paintColor;
  setState(s);
};

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === 'Escape') { paintColor = null; syncControls(); return; }
  const f = e.key.toUpperCase();
  if ('URFDLB'.includes(f) && f.length === 1) doMoves(f + (e.shiftKey ? "'" : ''));
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') $('undo').click();
});

// Theme follows the OS until the user picks one.
const theme = localStorage.getItem('cube-solver-theme');
if (theme) document.documentElement.dataset.theme = theme;
$('theme').onclick = () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  localStorage.setItem('cube-solver-theme', document.documentElement.dataset.theme);
};

$('version').textContent = `v${__APP_VERSION__}`;
syncControls();
requestAnalysis();

// Offline support when served as a PWA (not in dev, not inside Tauri).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http') && !('__TAURI_INTERNALS__' in window)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
