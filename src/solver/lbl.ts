/**
 * Layer-by-layer (beginner's method) breakdown for the 3x3, first layer on D.
 *
 * Each step is a small search over the same moves a person learning the
 * method uses (face turns for the cross, the "R U R' U'" trigger for corners,
 * the two middle-layer insertions, and four last-layer algorithms), with the
 * goal "this step done and every earlier step still intact". The result is
 * longer than the computer solution, on purpose: it is the solution a person
 * can follow.
 */
import { applyCubieMove, solvabilityError, solvedCubie, type Cubie } from '../cube/cubie';
import { parseMoves, formatMoves, simplify } from '../cube/notation';

const FACE_IDX: Record<string, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

function toCubieMoves(alg: string): number[] {
  return parseMoves(alg).map((m) => FACE_IDX[m.face] * 3 + (m.power - 1));
}

const run = (c: Cubie, ms: number[]) => ms.reduce(applyCubieMove, c);

interface Macro { name: string; moves: number[]; auf?: boolean }
const macro = (name: string, auf = false): Macro => ({ name, moves: toCubieMoves(name), auf });
const AUF = ['U', 'U2', "U'"].map((a) => macro(a, true));

/** Rewrite an algorithm written for the front-right slot for slot k (k y-rotations). */
const SLOT_FACES = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']];
function forSlot(alg: string, k: number): string {
  const [f, r] = SLOT_FACES[k];
  const [b, l] = SLOT_FACES[(k + 2) % 4];
  const map: Record<string, string> = { F: f, R: r, B: b, L: l };
  return alg.replace(/[FRBL]/g, (x) => map[x]);
}

const edgeOk = (c: Cubie, i: number) => c.ep[i] === i && c.eo[i] === 0;
const cornerOk = (c: Cubie, i: number) => c.cp[i] === i && c.co[i] === 0;

function search(c: Cubie, goal: (c: Cubie) => boolean, macros: Macro[], maxDepth: number): Macro[] | null {
  const path: Macro[] = [];
  const dfs = (x: Cubie, depth: number, prevAuf: boolean): boolean => {
    if (goal(x)) return true;
    if (depth === 0) return false;
    for (const m of macros) {
      if (m.auf && prevAuf) continue;
      path.push(m);
      if (dfs(run(x, m.moves), depth - 1, !!m.auf)) return true;
      path.pop();
    }
    return false;
  };
  for (let d = 0; d <= maxDepth; d++) if (dfs(c, d, false)) return path;
  return null;
}

/** Per-edge distance tables (position*2+flip) for the cross heuristic. */
function edgeDistances(): number[][] {
  const out: number[][] = [];
  for (let e = 4; e < 8; e++) {
    const d = Array(24).fill(-1);
    const key = (c: Cubie) => { const p = c.ep.indexOf(e); return p * 2 + c.eo[p]; };
    let frontier = [solvedCubie()];
    d[key(frontier[0])] = 0;
    for (let depth = 1; frontier.length; depth++) {
      const next: Cubie[] = [];
      for (const c of frontier) for (let m = 0; m < 18; m++) {
        const n = applyCubieMove(c, m);
        if (d[key(n)] < 0) { d[key(n)] = depth; next.push(n); }
      }
      frontier = next;
    }
    out.push(d);
  }
  return out;
}
let EDGE_D: number[][] | null = null;

function solveCross(c: Cubie, done: number[], e: number): number[] {
  EDGE_D ??= edgeDistances();
  const targets = [...done, e];
  const h = (x: Cubie) => Math.max(...targets.map((t) => { const p = x.ep.indexOf(t); return EDGE_D![t - 4][p * 2 + x.eo[p]]; }));
  const path: number[] = [];
  const dfs = (x: Cubie, depth: number, prev: number): boolean => {
    const hx = h(x);
    if (hx === 0) return true;
    if (hx > depth) return false;
    for (let m = 0; m < 18; m++) {
      if (prev >= 0 && ((m / 3) | 0) === ((prev / 3) | 0)) continue;
      path.push(m);
      if (dfs(applyCubieMove(x, m), depth - 1, m)) return true;
      path.pop();
    }
    return false;
  };
  for (let d = 0; d <= 10; d++) if (dfs(c, d, -1)) return path;
  throw new Error('cross search failed');
}

export interface Step { name: string; moves: string }

export function solveLBL(start: Cubie): { ok: true; steps: Step[] } | { ok: false; error: string } {
  const err = solvabilityError(start);
  if (err) return { ok: false, error: err };
  let c = start;
  const steps: Step[] = [];
  const push = (name: string, ms: number[]) => {
    const text = formatMoves(simplify(ms.map((m) => ({ face: 'URFDLB'[(m / 3) | 0] as 'U', power: ((m % 3) + 1) as 1, depth: 1 }))));
    steps.push({ name, moves: text });
    c = run(c, ms);
  };
  const fromMacros = (ms: Macro[]) => ms.flatMap((m) => m.moves);

  // 1. Cross on D, one edge at a time.
  const cross: number[] = [];
  const crossMoves: number[] = [];
  for (const e of [5, 4, 7, 6]) {
    const ms = solveCross(run(c, crossMoves), cross, e);
    crossMoves.push(...ms);
    cross.push(e);
  }
  push('Cross', crossMoves);

  // 2. First-layer corners with the trigger.
  const triggers = [0, 1, 2, 3].map((k) => macro(forSlot("R U R' U'", k)));
  const corners = [4, 7, 6, 5];
  const cornerMoves: number[] = [];
  const crossOk = (x: Cubie) => [4, 5, 6, 7].every((e) => edgeOk(x, e));
  corners.forEach((_, idx) => {
    const need = corners.slice(0, idx + 1);
    const r = search(run(c, cornerMoves), (x) => crossOk(x) && need.every((q) => cornerOk(x, q)), [...AUF, ...triggers], 9);
    if (!r) throw new Error('first-layer corner search failed');
    cornerMoves.push(...fromMacros(r));
  });
  push('First layer corners', cornerMoves);

  // 3. Middle-layer edges.
  const inserts = [0, 1, 2, 3].flatMap((k) => [
    macro(forSlot("U R U' R' U' F' U F", k)),
    macro(forSlot("U' F' U F U R U' R'", k)),
  ]);
  const layer1 = (x: Cubie) => crossOk(x) && [4, 5, 6, 7].every((q) => cornerOk(x, q));
  const slots = [8, 11, 10, 9];
  const midMoves: number[] = [];
  slots.forEach((_, idx) => {
    const need = slots.slice(0, idx + 1);
    const r = search(run(c, midMoves), (x) => layer1(x) && need.every((q) => edgeOk(x, q)), [...AUF, ...inserts], 4);
    if (!r) throw new Error('middle-layer search failed');
    midMoves.push(...fromMacros(r));
  });
  push('Middle layer', midMoves);

  const f2l = (x: Cubie) => layer1(x) && [8, 9, 10, 11].every((q) => edgeOk(x, q));
  const llStep = (name: string, goal: (x: Cubie) => boolean, algs: string[], depth: number) => {
    const r = search(c, (x) => f2l(x) && goal(x), [...AUF, ...algs.map((a) => macro(a))], depth);
    if (!r) throw new Error(`${name} search failed`);
    push(name, fromMacros(r));
  };
  const eoOk = (x: Cubie) => [0, 1, 2, 3].every((i) => x.eo[i] === 0);
  const coOk = (x: Cubie) => [0, 1, 2, 3].every((i) => x.co[i] === 0);
  const cpOk = (x: Cubie) => [0, 1, 2, 3].every((i) => x.cp[i] === i);
  llStep('Last layer cross (orient edges)', eoOk, ["F R U R' U' F'"], 6);
  llStep('Orient last-layer corners', (x) => eoOk(x) && coOk(x), ["R U R' U R U2 R'", "R U2 R' U' R U' R'"], 7);
  llStep('Permute last-layer corners', (x) => eoOk(x) && coOk(x) && cpOk(x), ["R' F R' B2 R F' R' B2 R2", "R2 B2 R F R' B2 R F' R"], 5);
  llStep('Permute last-layer edges', (x) => eoOk(x) && coOk(x) && cpOk(x) && [0, 1, 2, 3].every((i) => x.ep[i] === i),
    ["R U' R U R U R U' R' U' R2", "R2 U R U R' U' R' U' R' U R'"], 5);
  return { ok: true, steps: steps.filter((s) => s.moves.length) };
}
