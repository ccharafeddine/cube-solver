/**
 * Optimal 2x2 solver.
 *
 * With the DBL corner held still, every 2x2 state is reached by U, R and F
 * alone: 7! permutations x 3^6 twists = 3,674,160 states. A breadth-first
 * search over all of them in the quarter-turn metric fills a one-byte-per-state
 * distance table (~3.7 MB, well under a second to build). Solving is then a
 * walk downhill through the table, so every solution is optimal and every
 * candidate move gets its exact distance to solved.
 */
import { fromNormalized, solvabilityError, solvedCubie, multiply, MOVE_CUBES, type Cubie } from '../cube/cubie';
import type { State } from '../cube/facelets';
import { permRank, permUnrank } from './perm';

export const N_STATES = 5040 * 729;
/** Generator moves in cubie-move numbering: U, U', R, R', F, F'. */
const GEN = [0, 2, 3, 5, 6, 8];
export const GEN_NAMES = ['U', "U'", 'R', "R'", 'F', "F'"];
const POS = [0, 1, 2, 3, 4, 5, 7];

function encode(c: Cubie): number {
  const p = POS.map((i) => (c.cp[i] === 7 ? 6 : c.cp[i]));
  let t = 0;
  for (let i = 0; i < 6; i++) t = t * 3 + c.co[i];
  return permRank(p) * 729 + t;
}

function decode(x: number): Cubie {
  const c = solvedCubie();
  const p = permUnrank(Math.floor(x / 729), 7);
  POS.forEach((pos, k) => (c.cp[pos] = p[k] === 6 ? 7 : p[k]));
  let t = x % 729, sum = 0;
  for (let i = 5; i >= 0; i--) {
    c.co[i] = t % 3;
    sum += c.co[i];
    t = Math.floor(t / 3);
  }
  c.co[7] = (3 - (sum % 3)) % 3;
  return c;
}

let table: Uint8Array | null = null;
let permMove: Int32Array, twistMove: Int32Array;

function build() {
  permMove = new Int32Array(5040 * 6);
  twistMove = new Int32Array(729 * 6);
  for (let p = 0; p < 5040; p++) {
    const c = decode(p * 729);
    GEN.forEach((m, k) => (permMove[p * 6 + k] = Math.floor(encode(multiply(c, MOVE_CUBES[m])) / 729)));
  }
  for (let t = 0; t < 729; t++) {
    const c = decode(t);
    GEN.forEach((m, k) => (twistMove[t * 6 + k] = encode(multiply(c, MOVE_CUBES[m])) % 729));
  }
  const d = new Uint8Array(N_STATES).fill(255);
  d[0] = 0;
  let frontier = [0], depth = 0;
  while (frontier.length) {
    const next: number[] = [];
    for (const x of frontier) {
      for (let k = 0; k < 6; k++) {
        const y = step(x, k);
        if (d[y] === 255) {
          d[y] = depth + 1;
          next.push(y);
        }
      }
    }
    frontier = next;
    depth++;
  }
  table = d;
}

const step = (x: number, k: number) =>
  permMove[Math.floor(x / 729) * 6 + k] * 729 + twistMove[(x % 729) * 6 + k];

export function distances(): Uint8Array {
  if (!table) build();
  return table!;
}

/** Map 2x2 stickers onto the corner facelets of the 3x3 layout. */
function to3x3(s: State): number[] {
  const out = Array(54).fill(-1);
  for (let f = 0; f < 6; f++)
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 2; c++) out[f * 9 + r * 6 + c * 2] = s[f * 4 + r * 2 + c];
  return out;
}

export type Parse2 = { ok: true; index: number } | { ok: false; error: string };

/**
 * A 2x2 has no centres, so the colour scheme is read off the corner sitting in
 * DBL: its D, B and L colours define those faces, and each opposite face is
 * the one colour never seen on a corner with it. Returns the colour of each
 * face U R F D L B, or null when the corners cannot belong to a real cube.
 */
export function cornerScheme(s: State): number[] | null {
  const f = to3x3(s);
  const cornerSets = [
    [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
  ].map((ix) => ix.map((i) => f[i]));
  const opposite = (c: number) => {
    const seen = new Set<number>([c]);
    for (const set of cornerSets) if (set.includes(c)) set.forEach((x) => seen.add(x));
    const left = [0, 1, 2, 3, 4, 5].filter((x) => !seen.has(x));
    return left.length === 1 ? left[0] : -1;
  };
  const d = f[33], b = f[53], l = f[42];
  const scheme = [opposite(d), opposite(l), opposite(b), d, l, b]; // colour of U R F D L B
  return scheme.some((x) => x < 0) || new Set(scheme).size !== 6 ? null : scheme;
}

export function parse2(s: State): Parse2 {
  if (s.length !== 24) return { ok: false, error: 'A 2x2 needs 24 stickers.' };
  const counts = Array(6).fill(0);
  for (const c of s) counts[c]++;
  if (counts.some((k) => k !== 4)) return { ok: false, error: 'Each colour must appear on exactly 4 stickers.' };
  const f = to3x3(s);
  const scheme = cornerScheme(s);
  if (!scheme)
    return { ok: false, error: 'The colours do not form a real cube: some pair of colours shares a corner twice or never.' };
  const relabel = new Map(scheme.map((col, face) => [col, face]));
  const norm = f.map((x) => (x < 0 ? 0 : relabel.get(x)!));
  const r = fromNormalized(norm, false);
  if (!r.ok) return r;
  const err = solvabilityError(r.cubie, false);
  if (err) return { ok: false, error: err };
  return { ok: true, index: encode(r.cubie) };
}

export function distance2(s: State): number | null {
  const p = parse2(s);
  return p.ok ? distances()[p.index] : null;
}

/** Optimal solution (quarter-turn metric) as move names. */
export function solve2(s: State): { ok: true; moves: string[] } | { ok: false; error: string } {
  const p = parse2(s);
  if (!p.ok) return p;
  const d = distances();
  let x = p.index;
  const moves: string[] = [];
  while (d[x] > 0) {
    let k = 0;
    while (d[step(x, k)] !== d[x] - 1) k++;
    moves.push(GEN_NAMES[k]);
    x = step(x, k);
  }
  return { ok: true, moves };
}

/** Random-state scramble: a uniformly random reachable state. */
export function randomState2(rand = Math.random): Cubie {
  return decode(Math.floor(rand() * N_STATES));
}
