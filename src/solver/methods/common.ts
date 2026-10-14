/**
 * Shared machinery for the human-method breakdowns (layer by layer, CFOP,
 * Roux, ZZ).
 *
 * A method is a list of steps. Each step is solved by one of two small
 * searches, always with the goal "this step done and every earlier step still
 * intact":
 *  - `pieceSearch`: IDA* over a restricted set of face turns, guided by exact
 *    per-piece distance tables (admissible: no piece can be solved in fewer
 *    turns than its own distance). Used for cross, blocks and F2L pairs.
 *  - `macroSearch`: iterative deepening over whole algorithms plus U turns.
 *    Used for last-layer steps, where people apply known algorithms.
 */
import { applyCubieMove, MOVE_CUBES, type Cubie } from '../../cube/cubie';
import { parseMoves, formatMoves, simplify } from '../../cube/notation';
import type { Move } from '../../cube/facelets';

export interface Step { name: string; moves: string }
export type MethodResult = { ok: true; steps: Step[] } | { ok: false; error: string };

const FACE_IDX: Record<string, number> = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

export const toCubieMoves = (alg: string): number[] =>
  parseMoves(alg).map((m) => FACE_IDX[m.face] * 3 + (m.power - 1));

export const run = (c: Cubie, ms: number[]) => ms.reduce(applyCubieMove, c);

export const cubieMovesToText = (ms: number[]) =>
  formatMoves(simplify(ms.map((m): Move => ({ face: 'URFDLB'[(m / 3) | 0] as Move['face'], power: ((m % 3) + 1) as 1 | 2 | 3, depth: 1 }))));

/** All three powers of the given faces, e.g. faces('RU') = R R2 R' U U2 U'. */
export const faces = (fs: string) => [...fs].flatMap((f) => [0, 1, 2].map((p) => FACE_IDX[f] * 3 + p));

export const edgeOk = (c: Cubie, i: number) => c.ep[i] === i && c.eo[i] === 0;
export const cornerOk = (c: Cubie, i: number) => c.cp[i] === i && c.co[i] === 0;

/** A piece to solve: 'e' edge or 'c' corner, by its home index. */
export interface Piece { kind: 'e' | 'c'; id: number }
export const E = (id: number): Piece => ({ kind: 'e', id });
export const C = (id: number): Piece => ({ kind: 'c', id });

// ---- per-piece distance tables ----

/** For move m: where a piece at position p goes, and the orientation it gains. */
function transitions(kind: 'e' | 'c') {
  const n = kind === 'e' ? 12 : 8;
  return MOVE_CUBES.map((mc) => {
    const to = new Array(n), add = new Array(n);
    const perm = kind === 'e' ? mc.ep : mc.cp, ori = kind === 'e' ? mc.eo : mc.co;
    for (let i = 0; i < n; i++) {
      to[perm[i]] = i;
      add[perm[i]] = ori[i];
    }
    return { to, add };
  });
}
const TRANS = { e: transitions('e'), c: transitions('c') };

const distCache = new Map<string, Int8Array>();
/** Distance (in moves from `moves`) from every (position, orientation) of a piece to its home; -1 = unreachable. */
export function pieceDist(p: Piece, moves: number[]): Int8Array {
  const key = `${p.kind}${p.id}|${moves.join(',')}`;
  const hit = distCache.get(key);
  if (hit) return hit;
  const mod = p.kind === 'e' ? 2 : 3;
  const n = p.kind === 'e' ? 12 : 8;
  const d = new Int8Array(n * mod).fill(-1);
  // BFS backwards from home over inverse moves = forwards over the move set's inverses.
  const inv = moves.map((m) => m - (m % 3) + (2 - (m % 3)));
  d[p.id * mod] = 0;
  let frontier = [p.id * mod];
  for (let depth = 1; frontier.length; depth++) {
    const next: number[] = [];
    for (const s of frontier) {
      const pos = (s / mod) | 0, o = s % mod;
      for (const m of inv) {
        const t = TRANS[p.kind][m];
        const ns = t.to[pos] * mod + ((o + t.add[pos]) % mod);
        if (d[ns] < 0) { d[ns] = depth; next.push(ns); }
      }
    }
    frontier = next;
  }
  distCache.set(key, d);
  return d;
}

function locate(c: Cubie, p: Piece): number {
  if (p.kind === 'e') { const pos = c.ep.indexOf(p.id); return pos * 2 + c.eo[pos]; }
  const pos = c.cp.indexOf(p.id);
  return pos * 3 + c.co[pos];
}

/**
 * IDA*: solve every piece in `targets` using only `moves`, optionally with an
 * extra goal check. Returns the move list or null when nothing is found
 * within `maxDepth`.
 */
export function pieceSearch(
  c: Cubie, targets: Piece[], moves: number[], maxDepth: number, extraGoal?: (c: Cubie) => boolean, nodeLimit = 3_000_000,
): number[] | null {
  const tables = targets.map((t) => pieceDist(t, moves));
  const h = (x: Cubie) => {
    let m = 0;
    for (let i = 0; i < targets.length; i++) {
      const d = tables[i][locate(x, targets[i])];
      if (d < 0) return 99;
      if (d > m) m = d;
    }
    return m;
  };
  const path: number[] = [];
  let nodes = 0;
  const dfs = (x: Cubie, depth: number, prev: number): boolean => {
    const hx = h(x);
    if (hx === 0 && (!extraGoal || extraGoal(x))) return true;
    if (hx > depth || depth === 0 || ++nodes > nodeLimit) return false;
    for (const m of moves) {
      if (prev >= 0 && ((m / 3) | 0) === ((prev / 3) | 0)) continue;
      path.push(m);
      if (dfs(applyCubieMove(x, m), depth - 1, m)) return true;
      path.pop();
    }
    return false;
  };
  for (let d = 0; d <= maxDepth; d++) if (dfs(c, d, -1)) return path;
  return null;
}

// ---- macro search ----

export interface Macro { name: string; moves: number[]; auf?: boolean }
export const macro = (name: string, auf = false): Macro => ({ name, moves: toCubieMoves(name), auf });
export const AUF = ['U', 'U2', "U'"].map((a) => macro(a, true));

export function macroSearch(c: Cubie, goal: (c: Cubie) => boolean, macros: Macro[], maxDepth: number): number[] | null {
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
  for (let d = 0; d <= maxDepth; d++) if (dfs(c, d, false)) return path.flatMap((m) => m.moves);
  return null;
}

/** Rewrite an algorithm written for the front-right slot for slot k (k y-rotations: FR, RB, BL, LF). */
const SLOT_FACES = [['F', 'R'], ['R', 'B'], ['B', 'L'], ['L', 'F']];
export function forSlot(alg: string, k: number): string {
  const [f, r] = SLOT_FACES[k];
  const [b, l] = SLOT_FACES[(k + 2) % 4];
  const map: Record<string, string> = { F: f, R: r, B: b, L: l };
  return alg.replace(/[FRBL]/g, (x) => map[x]);
}

/** D-layer slots: [corner, middle edge] for FR, RB, BL, LF. */
export const SLOTS: [number, number][] = [[4, 8], [7, 11], [6, 10], [5, 9]];

/** Builder that records steps and keeps the running cube state. */
export class StepRecorder {
  steps: Step[] = [];
  constructor(public cube: Cubie) {}
  add(name: string, ms: number[] | null) {
    if (!ms) throw new Error(`${name}: no solution found`);
    if (ms.length) this.steps.push({ name, moves: cubieMovesToText(ms) });
    this.cube = run(this.cube, ms);
  }
}

// ---- shared last-layer helpers (algorithms that keep the first two layers) ----

export const SUNE = ["R U R' U R U2 R'", "R U2 R' U' R U' R'"];
export const EO_ALGS = ["F R U R' U' F'", "F U R U' R' F'"];
export const CORNER_PERMS = ["R' F R' B2 R F' R' B2 R2", "R2 B2 R F R' B2 R F' R"];
export const EDGE_PERMS = ["R U' R U R U R U' R' U' R2", "R2 U R U R' U' R' U' R' U R'"];

export const f2lDone = (x: Cubie) =>
  [4, 5, 6, 7, 8, 9, 10, 11].every((i) => edgeOk(x, i)) && [4, 5, 6, 7].every((i) => cornerOk(x, i));
export const llEO = (x: Cubie) => [0, 1, 2, 3].every((i) => x.eo[i] === 0);
export const llCO = (x: Cubie) => [0, 1, 2, 3].every((i) => x.co[i] === 0);
export const llCP = (x: Cubie) => [0, 1, 2, 3].every((i) => x.cp[i] === i);
export const llEP = (x: Cubie) => [0, 1, 2, 3].every((i) => x.ep[i] === i);

/** Finish the last layer in the given order of sub-goals, each with its algorithms. */
export function lastLayer(rec: StepRecorder, plan: [string, (x: Cubie) => boolean, string[], number][]) {
  const goals: ((x: Cubie) => boolean)[] = [f2lDone];
  for (const [name, goal, algs, depth] of plan) {
    goals.push(goal);
    const all = [...goals];
    rec.add(name, macroSearch(rec.cube, (x) => all.every((g) => g(x)), [...AUF, ...algs.map((a) => macro(a))], depth));
  }
}
