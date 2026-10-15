import { keepInView } from './ui/scroll';
import './style.css';
import { CubeView, COLORS, COLOR_NAMES } from './ui/scene';
import { NetEditor } from './ui/net';
import { applyMoves, applyTurn, colorCounts, isSolved, layerMove, moveToTurn, solved, turnToMove, type State } from './cube/facelets';
import { formatMove, invertMoves, parseMoves } from './cube/notation';
import { solvedCubie, toFacelets, parity, type Cubie } from './cube/cubie';
import { randomState2 } from './solver/solver2';
import { ENABLED_SIZES, type AnalyzeRequest, type AnalyzeResponse, type Mode, type Size } from './solver/protocol';
import type { Candidate } from './solver/rank';
import { METHODS, type MethodId, type Step } from './solver/methods/index';
import { History, inverseMove } from './app/history';
import { fromHash, importText, toFaceletString, toHash, toJSON } from './app/share';
import { checkForUpdate } from './app/update';
import { playPaced, randomMoves, scrambleMs } from './app/pace';
import { Tutorial } from './tutorial/tutorial';
import { standardRotation } from './cube/orient';
import { pickSkin, resolveTheme, modeFor, SCENE_SKINS, SKINS, SKIN_LABELS, SKIN_MODES, type SkinId } from './theme/skins';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const qtmOf = (ms: string[]) => ms.reduce((a, m) => a + (m.endsWith('2') ? 2 : 1), 0);

// ---------- error boundary ----------
// Any uncaught error shows a banner with a way out instead of a silently dead page.
function showError(msg: string) {
  const el = $('error-banner');
  el.innerHTML = '';
  el.append(`Something went wrong: ${msg} `);
  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  reload.onclick = () => location.reload();
  const dismiss = document.createElement('button');
  dismiss.textContent = 'Dismiss';
  dismiss.onclick = () => el.classList.add('hidden');
  el.append(reload, dismiss);
  el.classList.remove('hidden');
}
window.addEventListener('error', (e) => showError(e.message || 'unknown error'));
window.addEventListener('unhandledrejection', (e) => showError(String((e.reason as Error)?.message ?? e.reason)));

// ---------- settings ----------
interface Settings { n: Size; mode: Mode; thinkMs: number; method: MethodId; speed: number; topn: string }
const saved: Partial<Settings> = (() => { try { return JSON.parse(localStorage.getItem('cube-solver-settings') ?? '{}'); } catch { return {}; } })();
const settings: Settings = {
  n: ENABLED_SIZES.includes(saved.n as Size) ? saved.n! : 3,
  mode: saved.mode === 'optimal' ? 'optimal' : 'fast',
  thinkMs: saved.thinkMs ?? 2000,
  method: (METHODS.some((m) => m.id === saved.method) ? saved.method : 'lbl') as MethodId,
  speed: saved.speed ?? 55,
  topn: saved.topn ?? '5',
};
const persist = () => localStorage.setItem('cube-solver-settings', JSON.stringify(settings));

// ---------- state ----------
let n = settings.n;
let state: State = solved(n);
const history = new History(state, n);
let solution: string[] = [];
/** How many solution moves have been played since it was computed. */
let solutionPos = 0;
let playing = false;
let paintColor: number | null = null;
/** History positions 1..scrambleLen are scramble turns (played and undone at scramble pace). */
let scrambleLen = 0;
/** Moves the history buttons were built for (to update the list in place). */
let historyShown: string[] = [];
/** Set while playing solution moves, so the (still valid) solution is not recomputed. */
let followingSolution = false;

const view = new CubeView($('viewport'));
// Dev-only handle for browser checks (zoom limits, framing).
if (import.meta.env.DEV) (window as unknown as { __view: CubeView }).__view = view;
const net = new NetEditor($('net'));

const fromUrl = fromHash(location.hash);
if (fromUrl) { n = fromUrl.n; state = fromUrl.state; history.reset(state, n); }
view.build(n);
net.build(n);
render();

/** Animation duration from the 0..100 speed slider (exponential feel). */
const turnMs = () => Math.round(700 * Math.pow(0.04, settings.speed / 100));

// ---------- solver worker ----------
let worker: Worker | null = null;
let workerBusy = false;
let reqId = 0;

/**
 * A solver worker costs about a second to start (module load, then the
 * two-phase move tables and the pattern databases). Cancelling means
 * terminating it, so a spare is kept warm in the background: replacing the
 * worker takes the spare, and a new spare warms up once the page is idle.
 */
const spawnWorker = () => new Worker(new URL('./solver/worker.ts', import.meta.url), { type: 'module' });
function warmWorker(w: Worker) {
  const base = { mode: 'fast' as const, timeMs: 300, method: settings.method, warm: true };
  w.postMessage({ ...base, id: -1, n: 3, state: Array.from(toFacelets(randomCubie3())) } satisfies AnalyzeRequest);
  w.postMessage({ ...base, id: -2, n: 2, state: Array.from(corners(toFacelets(randomState2()))) } satisfies AnalyzeRequest);
}
let spare: Worker | null = null;
let spareTimer = 0;
function scheduleSpare() {
  clearTimeout(spareTimer);
  spareTimer = window.setTimeout(() => {
    if (spare) return;
    spare = spawnWorker();
    warmWorker(spare);
  }, 400);
}
function newWorker() {
  worker?.terminate();
  worker = spare ?? spawnWorker();
  spare = null;
  scheduleSpare();
  worker.onmessage = (e: MessageEvent<AnalyzeResponse>) => onResult(e.data);
  worker.onerror = (e) => {
    workerBusy = false;
    setStatus('bad', `Solver crashed (${e.message || 'unknown'}). Restarting it…`);
    worker = null;
    setTimeout(requestAnalysis, 500);
  };
}

let analyzeTimer = 0;
/** Send one analysis of `s` to a free worker; returns its request id. */
function postAnalysis(s: State): number {
  if (!worker || workerBusy) newWorker();
  workerBusy = true;
  const req: AnalyzeRequest = {
    id: ++reqId, n, state: Array.from(s), mode: settings.mode,
    timeMs: settings.thinkMs, method: settings.method,
  };
  worker!.postMessage(req);
  return req.id;
}

/**
 * Look-ahead: while a sequence (a scramble, a method step) is playing, the
 * position it ends on is already being solved. Results are held back until
 * the cube gets there, then shown at once, so the solution appears as the
 * last turn lands instead of starting from scratch.
 */
let ahead: { id: number; key: string; held: AnalyzeResponse[] } | null = null;
const keyOf = (s: State) => `${n}:${s.join('')}`;

function requestAnalysis() {
  clearTimeout(analyzeTimer);
  if (ahead && ahead.key === keyOf(state) && ahead.id === reqId) {
    const held = ahead.held;
    ahead = null;
    if (!held.some((r) => r.kind === 'result' || r.kind === 'invalid')) setStatus('thinking', 'Solving…');
    held.forEach(onResult);
    return;
  }
  ahead = null;
  analyzeTimer = window.setTimeout(() => {
    setStatus('thinking', settings.mode === 'optimal' && n === 3 ? 'Searching for the optimal solution…' : 'Solving…');
    postAnalysis(state);
  }, 120);
}

function stopAnalysis() {
  if (!workerBusy) return;
  newWorker();
  workerBusy = false;
  $('progress').classList.add('hidden');
  setStatus('ok', solution.length ? `Stopped. Best so far: ${qtmOf(solution)} quarter turns.` : 'Stopped.');
}

function onResult(r: AnalyzeResponse) {
  if (r.id !== reqId) return;
  if (ahead && ahead.id === r.id) { ahead.held.push(r); return; }
  if (r.kind === 'status') return setStatus('thinking', r.text);
  if (r.kind === 'progress') {
    const p = $('progress');
    p.classList.remove('hidden');
    (p.firstElementChild as HTMLElement).style.width = `${Math.min(100, (r.elapsedMs / settings.thinkMs) * 100)}%`;
    setStatus('thinking', `Optimal search: no solution under ${r.depth} quarter turns · ${(r.nodes / 1e6).toFixed(1)}M positions checked`);
    return;
  }
  if (r.kind === 'invalid') {
    workerBusy = false;
    $('progress').classList.add('hidden');
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
  if (r.final) { workerBusy = false; $('progress').classList.add('hidden'); }
  const text = isSolved(state, n) ? 'Solved!' : r.optimal
    ? `Optimal: ${r.qtm} quarter turns (proven shortest)`
    : `${r.final ? 'Best found' : 'Searching… best so far'}: ${r.qtm} quarter turns`;
  setStatus(r.final ? 'ok' : 'thinking', text + (r.note ? ` — ${r.note}` : ''));
  renderSolution();
  if (r.candidates) renderCandidates(r.candidates, r.qtm);
  if (r.final) renderMethod(r.method);
}

// ---------- rendering ----------
function setStatus(kind: 'ok' | 'bad' | 'thinking', text: string) {
  const el = $('status');
  el.className = `status ${kind}`;
  el.textContent = text;
}

function render() {
  view.setState(state);
  net.setState(state, n);
  const counts = colorCounts(state);
  $('counts').textContent = counts.map((c, i) => `${COLOR_NAMES[i]} ${c}`).join(' · ');
  renderHistory();
}

/** The solution the buttons were built for: stepping only updates their classes (big cubes have 1000+ moves). */
let renderedSolution: string[] | null = null;
function renderSolution() {
  const el = $('solution');
  if (renderedSolution === solution && solution.length) {
    const kids = el.children;
    for (let i = 0; i < kids.length; i++) {
      const c = 'mv' + (i < solutionPos ? ' done' : i === solutionPos ? ' next' : '');
      if (kids[i].className !== c) kids[i].className = c;
    }
    keepInView(el, kids[Math.min(solutionPos, kids.length - 1)]);
    $('play').textContent = playing ? '⏸ Pause' : '▶ Play';
    return;
  }
  renderedSolution = solution;
  el.innerHTML = '';
  if (!solution.length) el.innerHTML = '<span class="muted">—</span>';
  solution.forEach((m, i) => {
    const s = document.createElement('button');
    s.textContent = m;
    s.className = 'mv' + (i < solutionPos ? ' done' : i === solutionPos ? ' next' : '');
    s.title = 'Play up to here';
    s.onclick = () => playSolutionTo(i + 1);
    el.appendChild(s);
  });
  el.scrollTop = 0;
  $('sol-count').textContent = solution.length ? `${qtmOf(solution)} QTM · ${solution.length} HTM` : '';
  $('play').textContent = playing ? '⏸ Pause' : '▶ Play';
}

function renderCandidates(cs: Candidate[], current: number) {
  const el = $('candidates');
  el.innerHTML = '';
  const shown = cs.slice(0, Number(settings.topn) || cs.length);
  shown.forEach((c, i) => {
    const row = document.createElement('button');
    row.className = 'cand' + (c.delta < 0 ? ' good' : c.delta > 0 ? ' bad' : '');
    const d = c.delta === 0 ? '±0' : c.delta > 0 ? `+${c.delta}` : `${c.delta}`;
    const dist = c.exact ? `${c.distance}` : `≈${c.distance}`;
    row.innerHTML = `<b>${i + 1}</b><span class="mono mvname">${c.move}</span><span>${dist} to go</span><span class="delta">${d}</span>`;
    row.setAttribute('aria-label', `${c.move}: ${c.exact ? '' : 'about '}${c.distance} moves to go, change ${d}`);
    row.onclick = () => playMove(c.move);
    el.appendChild(row);
  });
  $('cand-note').textContent = current === 0 ? 'Already solved.' : 'Best first: fewest moves left to solve. ≈ means a good guess; a plain number is certain.';
}

function renderMethod(steps?: Step[]) {
  const el = $('method');
  el.innerHTML = '';
  if (n === 2) return;
  if (!steps) { el.innerHTML = '<p class="muted">No step-by-step breakdown for this cube.</p>'; return; }
  if (!steps.length) { el.innerHTML = '<p class="muted">Nothing to do: the cube is solved.</p>'; return; }
  const total = steps.reduce((a, s) => a + qtmOf(s.moves.split(' ')), 0);
  const head = document.createElement('p');
  head.className = 'muted';
  head.textContent = `${steps.length} steps · ${total} quarter turns in all.`;
  const playAll = document.createElement('button');
  playAll.textContent = 'Play all steps';
  playAll.onclick = () => void playSequence(steps.flatMap((s) => s.moves.split(' ')));
  head.append(' ', playAll);
  el.appendChild(head);
  steps.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'step';
    row.innerHTML = `<div class="step-name">${i + 1}. ${s.name} <small>${qtmOf(s.moves.split(' '))} QTM</small></div><div class="mono">${s.moves}</div>`;
    const play = document.createElement('button');
    play.textContent = 'Play step';
    play.onclick = () => void playSequence(s.moves.split(' '));
    row.appendChild(play);
    el.appendChild(row);
  });
}

/**
 * The history list, updated in place: keep the buttons for the moves that
 * are unchanged, rebuild only the tail, then move the highlight. Playing a
 * 1000-move big-cube solution stays cheap per turn.
 */
function renderHistory() {
  const el = $('history');
  const list = history.list;
  if (!el.firstChild) {
    const start = document.createElement('button');
    start.textContent = '•';
    start.title = 'Back to the start';
    start.onclick = () => void jumpHistory(0);
    el.appendChild(start);
  }
  let keep = 0;
  while (keep < list.length && keep < historyShown.length && historyShown[keep] === list[keep]) keep++;
  while (el.childElementCount > keep + 1) el.lastElementChild!.remove();
  for (let i = keep; i < list.length; i++) {
    const b = document.createElement('button');
    b.textContent = list[i];
    b.onclick = () => void jumpHistory(i + 1);
    el.appendChild(b);
  }
  historyShown = list;
  // Only touch buttons whose class actually changes, so the browser restyles a handful, not thousands.
  const cls = (i: number) => (i === 0 ? 'mv' + (history.position === 0 ? ' next' : '')
    : 'mv' + (i - 1 < history.position ? '' : ' done') + (i === history.position ? ' next' : ''));
  for (let i = 0; i <= list.length; i++) {
    const c = cls(i);
    if (el.children[i].className !== c) el.children[i].className = c;
  }
  keepInView(el, el.children[history.position]);
  renderHistoryFooter(list);
}

function renderHistoryFooter(list: string[]) {
  $('hist-count').textContent = list.length ? `${history.position}/${list.length} · ${qtmOf(list.slice(0, history.position))} QTM` : 'No moves yet';
  $<HTMLButtonElement>('undo').disabled = !history.canBack;
  $<HTMLButtonElement>('redo').disabled = !history.canForward;
}

// ---------- actions ----------
/** Animate one move (notation) and update the model. */
function animateMove(m: string, ms = turnMs()) {
  const mv = parseMoves(m)[0];
  if (mv.depth >= n) mv.depth = Math.max(1, n - 1);
  if (n === 2 && 'MES'.includes(mv.face)) return;
  const t = moveToTurn(mv, n);
  state = applyTurn(state, n, t);
  void view.animate(t, state, ms);
}

/**
 * Layer turns wait while the cube is exploded (or moving apart/together):
 * the model only changes when the view can show the change faithfully.
 */
function turnsBlocked(): boolean {
  if (!view.exploded) return false;
  $('explode-hint').textContent = 'The pieces are spread apart, so turning is paused. Press Assemble (G) to put the cube back together.';
  $('explode-hint').classList.remove('hidden');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => $('explode-hint').classList.add('hidden'), 2600);
  return true;
}
let hintTimer = 0;

function playMove(m: string, analyze = true, ms = turnMs()) {
  if (tutorial?.blocksInput) return;
  if (turnsBlocked()) return;
  history.push(m);
  animateMove(m, ms);
  net.setState(state, n);
  renderHistory();
  if (analyze && !followingSolution) requestAnalysis();
  tutorial?.onMove(m);
}

/** Bumped whenever a new sequence or a reset takes over, to stop the running one. */
let sequenceRun = 0;

/**
 * Play a sequence (a method step, a typed algorithm) one turn at a time at the
 * speed slider's pace, like solution playback, instead of queueing every turn
 * at once (which the view speeds up to drain a long queue).
 */
async function playSequence(moves: string[], asScramble = false) {
  const run = ++sequenceRun;
  // Any analysis queued or running is for a position about to go stale: drop it until the sequence ends.
  clearTimeout(analyzeTimer);
  if (workerBusy) { newWorker(); workerBusy = false; }
  ahead = null;
  try {
    const target = applyMoves(state, n, parseMoves(moves.join(' ')));
    ahead = { id: postAnalysis(target), key: keyOf(target), held: [] };
  } catch { /* moves the model cannot apply ahead: analyse at the end as usual */ }
  if (asScramble) setStatus('thinking', 'Mixing up the cube… (working out the solution meanwhile)');
  const done = await playPaced(moves, {
    play: (m) => {
      if (view.exploded) { turnsBlocked(); return false; }
      playMove(m, false, asScramble ? scrambleMs(turnMs()) : turnMs());
      if (asScramble) { scrambleLen = history.position; renderHistory(); }
    },
    idle: () => view.idle(),
    gapMs: () => (asScramble ? scrambleMs(turnMs()) * 0.15 : turnMs() * 0.25),
    cancelled: () => run !== sequenceRun,
  });
  if (done || run === sequenceRun) requestAnalysis();
}

function doMoves(text: string) {
  try {
    const ms = parseMoves(text).map(formatMove);
    void playSequence(ms);
  } catch (e) {
    setStatus('bad', (e as Error).message);
  }
}

function stepSolution() {
  if (turnsBlocked()) { playing = false; renderSolution(); return false; }
  if (solutionPos >= solution.length) { playing = false; renderSolution(); return false; }
  followingSolution = true;
  playMove(solution[solutionPos++]);
  followingSolution = false;
  renderSolution();
  if (solutionPos >= solution.length) { playing = false; requestAnalysis(); }
  return true;
}

/** One move back: along the solution if one is being followed, otherwise back through the history. */
function stepSolutionBack() {
  if (solutionPos === 0) { undo(); return; }
  if (turnsBlocked()) return;
  const m = history.back();
  if (!m) return;
  solutionPos--;
  animateMove(inverseMove(m));
  render();
  renderSolution();
}

function playSolutionTo(k: number) {
  while (solutionPos < k && solutionPos < solution.length) stepSolution();
}

async function togglePlay() {
  if (playing) { playing = false; renderSolution(); return; }
  if (solutionPos >= solution.length) return;
  playing = true;
  renderSolution();
  while (playing && stepSolution()) { await view.idle(); await sleep(turnMs() * 0.25); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function undo() {
  sequenceRun++;
  if (turnsBlocked()) return;
  const m = history.back();
  if (!m) return;
  if (solutionPos > 0) solutionPos--;
  animateMove(inverseMove(m), paceAt(history.position));
  render();
  requestAnalysis();
}

function redo() {
  if (turnsBlocked()) return;
  const m = history.forward();
  if (!m) return;
  animateMove(m, paceAt(history.position - 1));
  render();
  requestAnalysis();
}

/** Turn length for the history move at index i (0-based): scramble turns replay at scramble pace. */
const paceAt = (i: number) => (i < scrambleLen ? scrambleMs(turnMs()) : turnMs());

/**
 * Walk the history to `pos`, forwards or backwards, one animated turn at a
 * time at the slider's pace. Any other action (undo, a new move, a reset)
 * cancels the walk where it is.
 */
async function jumpHistory(pos: number) {
  const run = ++sequenceRun;
  if (turnsBlocked()) return;
  playing = false;
  solutionPos = 0;
  while (history.position !== pos && run === sequenceRun) {
    const back = pos < history.position;
    const m = back ? history.back() : history.forward();
    if (!m) break;
    const ms = paceAt(back ? history.position : history.position - 1);
    animateMove(back ? inverseMove(m) : m, ms);
    net.setState(state, n);
    renderHistory();
    await view.idle();
    if (run !== sequenceRun) return;
    await sleep(ms * 0.15);
  }
  render();
  requestAnalysis();
}

/** Replace the cube outright (reset, scramble, paint, import). */
function setBaseline(s: State, size: Size = n) {
  sequenceRun++;
  scrambleLen = 0;
  if (size !== n) { n = size; settings.n = n; persist(); view.build(n); net.build(n); syncControls(); }
  state = s;
  history.reset(state, n);
  playing = false;
  render();
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

/** 2x2 stickers are the corner stickers of the 3x3 layout. */
function corners(f: State): State {
  const out = new Uint8Array(24);
  for (let face = 0; face < 6; face++)
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) out[face * 4 + r * 2 + c] = f[face * 9 + r * 6 + c * 2];
  return out;
}

/**
 * Scramble move by move, like a person mixing a cube: a random state is
 * turned into moves (the inverse of its quick solution), then played from
 * solved at scramble pace and recorded in the history, so Undo walks back
 * through it turn by turn.
 */
/**
 * The scrambler: one long-lived worker that turns random states into scramble
 * moves. The next scramble for each small size is worked out ahead of time,
 * so pressing Scramble starts turning at once.
 */
let scrambler: Worker | null = null;
let scrambleReq = 0;
const nextScramble = new Map<number, string[]>();
const pendingScramble = new Map<number, number>();
let waitingScramble: { size: number; run: number } | null = null;
function getScrambler(): Worker {
  if (scrambler) return scrambler;
  const w = spawnWorker();
  w.onmessage = (e: MessageEvent<AnalyzeResponse>) => {
    const r = e.data;
    if (r.kind !== 'result' || !r.final) return;
    const size = [...pendingScramble].find(([, id]) => id === r.id)?.[0];
    if (size === undefined) return;
    pendingScramble.delete(size);
    nextScramble.set(size, invertMoves(parseMoves(r.solution.join(' '))).map(formatMove));
    // Someone pressed Scramble before it was ready: start now (unless they moved on).
    if (waitingScramble?.size === size) {
      const wait = waitingScramble;
      waitingScramble = null;
      if (wait.run === sequenceRun && size === n) startScramble(size);
    }
  };
  w.onerror = () => { scrambler = null; pendingScramble.clear(); };
  scrambler = w;
  return w;
}
function prefetchScramble(size: number) {
  if (size > 3 || nextScramble.has(size) || pendingScramble.has(size)) return;
  const f = toFacelets(size === 2 ? randomState2() : randomCubie3());
  const id = ++scrambleReq;
  pendingScramble.set(size, id);
  getScrambler().postMessage({ id, n: size as Size, state: Array.from(size === 2 ? corners(f) : f), mode: 'fast', timeMs: 300, method: settings.method, solveOnly: true } satisfies AnalyzeRequest);
}
function startScramble(size: number) {
  const moves = nextScramble.get(size)!;
  nextScramble.delete(size);
  $<HTMLInputElement>('alg').value = moves.join(' ');
  void playSequence(moves, true);
  prefetchScramble(size);
}
const BIG_SCRAMBLE: Record<number, number> = { 4: 40, 5: 60, 6: 80, 7: 100 };
function scramble() {
  if (turnsBlocked()) return;
  const size = n;
  if (size > 3) {
    // Big cubes: random turns of any layer (as WCA scrambles do), 20 per layer pair.
    const moves = randomMoves(size, BIG_SCRAMBLE[size]).map((r) => formatMove(layerMove({ axis: r.axis as 0 | 1 | 2, layers: [2 * r.layer - (size - 1)], q: r.power }, size)));
    setBaseline(solved(size));
    $<HTMLInputElement>('alg').value = moves.join(' ');
    void playSequence(moves, true);
    return;
  }
  setBaseline(solved(size));
  if (nextScramble.has(size)) return startScramble(size);
  // Not worked out yet (pressed right after load): say so, and start the moment it is.
  setStatus('thinking', 'Mixing up the cube…');
  waitingScramble = { size, run: sequenceRun };
  prefetchScramble(size);
}


function paint(i: number) {
  if (paintColor === null) {
    // Without a chosen colour, a click cycles the sticker through the colours.
    const s = state.slice();
    s[i] = (s[i] + 1) % 6;
    setBaseline(s);
    return;
  }
  if (state[i] === paintColor) return;
  const s = state.slice();
  s[i] = paintColor;
  setBaseline(s);
}

// ---------- controls ----------
function syncControls() {
  document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) => {
    const on = Number(b.dataset.size) === n;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
  });
  document.querySelectorAll<HTMLButtonElement>('#mode-group [data-mode]').forEach((b) => {
    const on = b.dataset.mode === settings.mode;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
  });
  $('mode-group').classList.toggle('hidden', n !== 3);
  $('method-card').classList.toggle('hidden', n === 2);
  $('method-select').classList.toggle('hidden', n > 3);
  $<HTMLSelectElement>('think').value = String(settings.thinkMs);
  $<HTMLSelectElement>('topn').value = settings.topn;
  $<HTMLSelectElement>('method-select').value = settings.method;
  $<HTMLInputElement>('speed').value = String(settings.speed);
  $('method-blurb').textContent = n > 3
    ? 'Big cubes are solved by reduction: first the centres, then each edge is put together from its pieces, then the cube is solved like a 3x3. If needed, a parity fix comes first.'
    : METHODS.find((m) => m.id === settings.method)!.blurb;
  document.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => {
    const on = Number(b.dataset.color) === paintColor;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
  });
  view.paintMode = paintColor !== null;
  $('paint-hint').textContent = paintColor === null
    ? 'Pick a colour, then click stickers on the cube or the flat map. No colour picked? Each click changes the sticker to the next colour.'
    : `Painting ${COLOR_NAMES[paintColor]}: click stickers on the cube or the flat map. Press Esc to stop.`;
  document.querySelectorAll<HTMLButtonElement>('#movepad button').forEach((b) => {
    b.disabled = n === 2 && /^[MES]/.test(b.textContent ?? '');
  });
}

function selectTab(tab: string) {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  if (tab !== 'paint' && paintColor !== null) { paintColor = null; syncControls(); }
}

document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => (b.onclick = () => selectTab(b.dataset.tab!)));
document.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) => (b.onclick = () => setBaseline(solved(Number(b.dataset.size)), Number(b.dataset.size) as Size)));
document.querySelectorAll<HTMLButtonElement>('#mode-group [data-mode]').forEach((b) => (b.onclick = () => { settings.mode = b.dataset.mode as Mode; persist(); syncControls(); requestAnalysis(); }));
$<HTMLSelectElement>('think').onchange = (e) => { settings.thinkMs = Number((e.target as HTMLSelectElement).value); persist(); requestAnalysis(); };
$<HTMLSelectElement>('topn').onchange = (e) => { settings.topn = (e.target as HTMLSelectElement).value; persist(); requestAnalysis(); };
$<HTMLInputElement>('speed').oninput = (e) => { settings.speed = Number((e.target as HTMLInputElement).value); persist(); };
const methodSelect = $<HTMLSelectElement>('method-select');
METHODS.forEach((m) => methodSelect.add(new Option(m.name, m.id)));
methodSelect.onchange = () => { settings.method = methodSelect.value as MethodId; persist(); syncControls(); requestAnalysis(); };
$('reset').onclick = () => { $<HTMLInputElement>('alg').value = ''; setBaseline(solved(n)); };
$('scramble').onclick = scramble;
$('undo').onclick = undo;
$('redo').onclick = redo;
$('stop').onclick = stopAnalysis;
/**
 * Reset view: standard camera, and undo any x/y/z rotations so white is on
 * top and green in front again. The fix is played as rotation moves (they
 * move no pieces), so history and the solution stay consistent.
 */
function resetView() {
  view.resetView();
  const fix = standardRotation(state, n);
  if (fix?.length && !view.exploded) void playSequence(fix.map(formatMove));
}
$('view-reset').onclick = resetView;
$('apply').onclick = () => doMoves($<HTMLInputElement>('alg').value);
$<HTMLInputElement>('alg').onkeydown = (e) => { if (e.key === 'Enter') doMoves((e.target as HTMLInputElement).value); };
$('play').onclick = () => void togglePlay();
$('sol-step').onclick = () => { playing = false; stepSolution(); };
$('sol-back').onclick = () => { playing = false; stepSolutionBack(); };
$('sol-start').onclick = () => { playing = false; while (solutionPos > 0) stepSolutionBack(); };
$('paint-off').onclick = () => { paintColor = null; syncControls(); };
$('fill-solved').onclick = () => setBaseline(solved(n));

const pad = $('movepad');
for (const f of 'URFDLBMESxyz') for (const suffix of ['', "'", '2']) {
  const b = document.createElement('button');
  b.textContent = f + suffix;
  b.className = 'mono';
  b.onclick = () => playMove(f + suffix);
  pad.appendChild(b);
}

// On-screen whole-cube rotations: the same moves as the x/y/z keys (Shift for prime).
document.querySelectorAll<HTMLButtonElement>('[data-rot]').forEach((b) => {
  b.onclick = (e) => playMove(b.dataset.rot! + (e.shiftKey ? "'" : ''));
});

// Exploded view: a view-only toggle (G). Painting still works; turns wait.
const explodeBtn = $<HTMLButtonElement>('explode');
const toggleExplode = () => void view.setExploded(!view.explodeTarget);
explodeBtn.onclick = toggleExplode;
view.onExplodeChange = (on) => {
  explodeBtn.setAttribute('aria-pressed', String(on));
  explodeBtn.textContent = on ? 'Assemble' : 'Explode';
  explodeBtn.title = on ? 'Put the pieces back together (G)' : 'Exploded view: spread the pieces out (G)';
  $('viewport').classList.toggle('exploded', on);
  document.querySelectorAll<HTMLButtonElement>('[data-rot]').forEach((b) => (b.disabled = on));
  if (!on) $('explode-hint').classList.add('hidden');
};

const palette = $('palette');
COLORS.forEach((c, i) => {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.dataset.color = String(i);
  b.style.background = c;
  b.title = `${COLOR_NAMES[i]} (${i + 1})`;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', COLOR_NAMES[i]);
  b.onclick = () => { paintColor = paintColor === i ? null : i; syncControls(); };
  palette.appendChild(b);
});
view.onStickerClick = (i) => { if (paintColor !== null) paint(i); };
view.onDragTurn = (t) => {
  if (paintColor !== null) return;
  const m = turnToMove(t, n) ?? (n > 3 && t.layers.length === 1 ? layerMove(t, n) : null);
  if (m) playMove(formatMove(m));
};
net.onSticker = paint;

// ---------- import / export ----------
const ioMsg = (t: string) => ($('io-msg').textContent = t);
async function copy(text: string, what: string) {
  $<HTMLTextAreaElement>('io-text').value = text;
  try { await navigator.clipboard.writeText(text); ioMsg(`${what} copied to the clipboard.`); } catch { ioMsg(`${what} is in the box above.`); }
}
$('import').onclick = () => {
  const r = importText($<HTMLTextAreaElement>('io-text').value, n);
  if (!r.ok) return ioMsg(r.error);
  setBaseline(r.state, r.n);
  if (r.moves?.length) void playSequence(r.moves);
  ioMsg('Imported.');
};
$('export-facelets').onclick = () => copy(toFaceletString(state), 'Facelet string');
$('export-json').onclick = () => copy(toJSON({ n, state, moves: history.list, solution }), 'JSON');
$('export-solution').onclick = () => copy(solution.join(' '), 'Solution');
$('share').onclick = () => copy(location.href.split('#')[0] + toHash(n, state), 'Share link');
$('download').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toJSON({ n, state, moves: history.list, solution })], { type: 'application/json' }));
  a.download = `cube-${n}x${n}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
window.addEventListener('hashchange', () => { const f = fromHash(location.hash); if (f) setBaseline(f.state, f.n); });

// ---------- keyboard ----------
window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if ($<HTMLDialogElement>('help-dialog').open || $<HTMLDialogElement>('tutorial-dialog').open || $<HTMLDialogElement>('settings-dialog').open) return;
  if (tutorial.capturesKeys) return;
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); return redo(); }
  if (e.ctrlKey || e.metaKey) return;
  if (e.altKey) {
    const a = e.code;
    if (a === 'KeyS') { e.preventDefault(); scramble(); }
    if (a === 'KeyR') { e.preventDefault(); setBaseline(solved(n)); }
    if (a === 'KeyV') { e.preventDefault(); resetView(); }
    return;
  }
  if (k === '?') { openHelp(); return; }
  if (k === 'g' || k === 'G') { toggleExplode(); return; }
  if (k === 'Escape') { paintColor = null; playing = false; sequenceRun++; syncControls(); return; }
  if (k === ' ' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); void togglePlay(); return; }
  if (k === 'ArrowRight') { e.preventDefault(); playing = false; stepSolution(); return; }
  if (k === 'ArrowLeft') { e.preventDefault(); playing = false; stepSolutionBack(); return; }
  const paintTab = !document.querySelector('[data-panel="paint"]')!.classList.contains('hidden');
  if (paintTab && /^[0-6]$/.test(k)) { paintColor = k === '0' ? null : Number(k) - 1; syncControls(); return; }
  if (ENABLED_SIZES.includes(Number(k) as Size)) { setBaseline(solved(Number(k)), Number(k) as Size); return; }
  const letter = k.length === 1 ? k.toUpperCase() : '';
  if ('URFDLBMES'.includes(letter) && letter) playMove(letter + (e.shiftKey ? "'" : ''));
  else if ('XYZ'.includes(letter) && letter) playMove(letter.toLowerCase() + (e.shiftKey ? "'" : ''));
});

// ---------- help, onboarding ----------
function openHelp() { $<HTMLDialogElement>('help-dialog').showModal(); }
$('help').onclick = openHelp;
$('help-close').onclick = () => $<HTMLDialogElement>('help-dialog').close();

// ---------- tutorial ----------
/** The cube the user had before the notation lessons took over the view. */
let beforeLessons: { state: State; n: Size; moves: string[] } | null = null;
const tutorial: Tutorial = new Tutorial({
  view,
  enterLessons() {
    if (view.explodeTarget) void view.setExploded(false);
    if (!beforeLessons) beforeLessons = { state, n, moves: history.list.slice(0, history.position) };
    selectTab('turn');
    setBaseline(solved(3), 3);
  },
  resetCube() {
    setBaseline(solved(3), 3);
    // A turn may still be animating; show the reset once it lands.
    void view.idle().then(() => view.setState(state));
  },
  exitLessons() {
    if (!beforeLessons) return;
    const b = beforeLessons;
    beforeLessons = null;
    setBaseline(b.state, b.n);
    void view.idle().then(() => view.setState(state));
  },
  playMove: (m) => playMove(m),
  selectTab,
  turnMs,
});

function openTutorialMenu() {
  $<HTMLDialogElement>('help-dialog').close();
  const p = tutorial.progress;
  $('tut-summary').textContent = tutorial.summary();
  $('tut-lessons').textContent = p.lessonsDone.length && p.lesson > 0 ? `Resume lessons (lesson ${p.lesson + 1})` : 'Start the notation lessons';
  $('tut-tour').textContent = !p.tourDone && p.tour > 0 ? `Resume the app tour (step ${p.tour + 1})` : 'Take the app tour';
  $<HTMLDialogElement>('tutorial-dialog').showModal();
}
const fromMenu = (f: () => void) => () => { $<HTMLDialogElement>('tutorial-dialog').close(); f(); };
$('tutorial').onclick = openTutorialMenu;
$('tour').onclick = openTutorialMenu;
$('tut-lessons').onclick = fromMenu(() => tutorial.startLessons());
$('tut-restart').onclick = fromMenu(() => tutorial.startLessons(0));
$('tut-quiz').onclick = fromMenu(() => { tutorial.startLessons(); tutorial.startQuiz(); });
$('tut-tour').onclick = fromMenu(() => tutorial.startTour());
$('tut-tour-restart').onclick = fromMenu(() => tutorial.startTour(0));
$('tut-reset').onclick = () => { tutorial.resetProgress(); $('tut-summary').textContent = tutorial.summary(); };
$('tut-close').onclick = () => $<HTMLDialogElement>('tutorial-dialog').close();
// Offer the tutorial on first launch, but not over a cube opened from a share link.
if (!fromUrl) tutorial.offer($('onboarding'));

// ---------- theme and skin ----------
// A skin (matte by default) plus light/dark: CSS variables and scene parameters.
// The picker applies instantly and remembers the choice.
let skin: SkinId = pickSkin(location.search, localStorage.getItem('cube-solver-skin'));
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const saved = localStorage.getItem('cube-solver-theme');
  const t = modeFor(skin, resolveTheme(saved, darkQuery.matches));
  document.documentElement.dataset.skin = skin;
  document.documentElement.dataset.theme = t;
  view.applySkin(SCENE_SKINS[skin][t]);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  // Reflect the state in the picker.
  const mode = saved === 'light' || saved === 'dark' ? saved : 'system';
  const single = SKIN_MODES[skin].length === 1;
  document.querySelectorAll<HTMLButtonElement>('#theme-skins button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.skin === skin)));
  document.querySelectorAll<HTMLButtonElement>('#theme-modes button').forEach((b) => {
    b.disabled = single;
    b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    b.classList.toggle('on', !single && b.dataset.mode === mode);
  });
  $('theme-mode-note').textContent = single ? `${SKIN_LABELS[skin]} has a ${SKIN_MODES[skin][0]} look only.` : '';
}
for (const id of SKINS) {
  const b = document.createElement('button');
  b.className = 'skin-card';
  b.dataset.skin = id;
  b.setAttribute('role', 'radio');
  b.innerHTML = `<span class="skin-preview" data-preview="${id}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${SKIN_LABELS[id]}</span>`;
  b.onclick = () => { skin = id; localStorage.setItem('cube-solver-skin', id); applyTheme(); };
  $('theme-skins').append(b);
}
document.querySelectorAll<HTMLButtonElement>('#theme-modes button').forEach((b) => {
  b.onclick = () => {
    if (b.dataset.mode === 'system') localStorage.removeItem('cube-solver-theme');
    else localStorage.setItem('cube-solver-theme', b.dataset.mode!);
    applyTheme();
  };
});
darkQuery.addEventListener('change', applyTheme);
applyTheme();
// Settings: theme, light/dark, updates and About in one dialog (native <dialog>: Esc closes, focus stays inside).
const settingsDialog = $<HTMLDialogElement>('settings-dialog');
const openSettings = () => settingsDialog.showModal();
$('settings').onclick = openSettings;
$('help-appearance').onclick = () => { $<HTMLDialogElement>('help-dialog').close(); openSettings(); };
$('settings-close').onclick = () => settingsDialog.close();
// A click on the backdrop (outside the panel) closes it too.
settingsDialog.addEventListener('click', (e) => { if (e.target === settingsDialog) settingsDialog.close(); });

// ---------- update check ----------
async function runUpdateCheck(manual: boolean) {
  if (manual) $('update-msg').textContent = 'Checking…';
  const r = await checkForUpdate(__APP_VERSION__);
  const el = $('update-banner');
  if (r.kind === 'available') {
    el.innerHTML = `Cube Solver ${r.latest} is out. `;
    const a = document.createElement('a');
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Download';
    a.onclick = (ev) => { ev.preventDefault(); void openExternal(r.url); };
    el.append(a);
    el.classList.remove('hidden');
    $('update-msg').textContent = `Version ${r.latest} is available.`;
  } else if (manual) {
    $('update-msg').textContent = r.kind === 'current' ? `Up to date (v${__APP_VERSION__}).` : `Could not check: ${r.message}.`;
    el.textContent = r.kind === 'current' ? `You have the latest version (v${__APP_VERSION__}).` : `Could not check for updates: ${r.message}.`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }
}
async function openExternal(url: string) {
  if ('__TAURI_INTERNALS__' in window) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else window.open(url, '_blank', 'noopener');
}
$('check-update').onclick = () => void runUpdateCheck(true);
if (import.meta.env.PROD) setTimeout(() => void runUpdateCheck(false), 3000);

// ---------- performance watchdog ----------
// In development, log any main-thread task over 50 ms: the UI must never block.
if (import.meta.env.DEV && 'PerformanceObserver' in window) {
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((en) => console.warn(`[perf] long task ${en.duration.toFixed(0)} ms`))).observe({ type: 'longtask', buffered: true });
  } catch { /* longtask not supported */ }
}

$('version').textContent = `v${__APP_VERSION__}`;
syncControls();
requestAnalysis();
// Warm up in the background once the first analysis is under way: the next
// scramble for this size (then the other small size), and a spare solver.
setTimeout(() => { prefetchScramble(n); prefetchScramble(n === 2 ? 3 : 2); scheduleSpare(); }, 200);

// Offline support when served as a PWA (not in dev, not inside Tauri).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http') && !('__TAURI_INTERNALS__' in window)) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
} else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  // A worker left over from a production build on the same port would serve a stale bundle in dev.
  void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
}
