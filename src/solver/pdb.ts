/**
 * Pattern databases for the optimal 3x3 search (Korf-style).
 *
 * Each database stores, for every placement of a group of pieces (position
 * and orientation, other pieces ignored), the exact number of quarter turns
 * needed to solve just that group. Any one of them is a lower bound on the
 * whole cube's distance, so the maximum over all of them is an admissible
 * IDA* heuristic, and much stronger than the coordinate tables alone.
 *
 * Groups: corners {URF UFL ULB UBR}, corners {DFR DLF DBL DRB}, and three
 * five-edge groups. Indices are digits base 24 (position * mod + orientation
 * per piece), sparse but simple: ~25 MB in total, built in a few seconds and
 * cached in IndexedDB by the worker.
 */
import { MOVE_CUBES, type Cubie } from '../cube/cubie';

export const QUARTER = [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17];

/** Per kind: T[k][s] = new state of a piece in state s (= pos*mod + ori) after quarter move k. */
function pieceTable(kind: 'c' | 'e'): Uint8Array[] {
  const n = kind === 'c' ? 8 : 12, mod = kind === 'c' ? 3 : 2;
  return QUARTER.map((m) => {
    const mc = MOVE_CUBES[m];
    const perm = kind === 'c' ? mc.cp : mc.ep, ori = kind === 'c' ? mc.co : mc.eo;
    const t = new Uint8Array(n * mod);
    for (let i = 0; i < n; i++) {
      const from = perm[i];
      for (let o = 0; o < mod; o++) t[from * mod + o] = i * mod + ((o + ori[i]) % mod);
    }
    return t;
  });
}
export const CT = pieceTable('c');
export const ET = pieceTable('e');

export interface Group { name: string; kind: 'c' | 'e'; pieces: number[] }
export const GROUPS: Group[] = [
  { name: 'c-top', kind: 'c', pieces: [0, 1, 2, 3] },
  { name: 'c-bottom', kind: 'c', pieces: [4, 5, 6, 7] },
  { name: 'e-a', kind: 'e', pieces: [0, 1, 2, 3, 4] },
  { name: 'e-b', kind: 'e', pieces: [5, 6, 7, 8, 9] },
  { name: 'e-c', kind: 'e', pieces: [7, 8, 9, 10, 11] },
];

const BASE = 24;
export const groupSize = (g: Group) => BASE ** g.pieces.length;

/** Index of a group from per-piece states. */
export function groupIndex(g: Group, states: ArrayLike<number>): number {
  let x = 0;
  for (let i = g.pieces.length - 1; i >= 0; i--) x = x * BASE + states[g.pieces[i]];
  return x;
}

export function buildGroup(g: Group): Uint8Array {
  const size = groupSize(g);
  const k = g.pieces.length;
  const T = g.kind === 'c' ? CT : ET;
  const mod = g.kind === 'c' ? 3 : 2;
  const d = new Uint8Array(size).fill(255);
  let start = 0;
  for (let i = k - 1; i >= 0; i--) start = start * BASE + g.pieces[i] * mod;
  d[start] = 0;
  let frontier = new Int32Array([start]);
  const digits = new Array(k);
  for (let depth = 1; frontier.length; depth++) {
    const next: number[] = [];
    for (const x of frontier) {
      let y = x;
      for (let i = 0; i < k; i++) { digits[i] = y % BASE; y = (y / BASE) | 0; }
      for (let m = 0; m < 12; m++) {
        const t = T[m];
        let z = 0;
        for (let i = k - 1; i >= 0; i--) z = z * BASE + t[digits[i]];
        if (d[z] === 255) { d[z] = depth; next.push(z); }
      }
    }
    frontier = Int32Array.from(next);
  }
  return d;
}

export type PdbSet = Uint8Array[];
let PDB: PdbSet | null = null;

/** Use already-built tables (e.g. loaded from IndexedDB). */
export function setPdb(tables: PdbSet) { PDB = tables; }
export function pdb(): PdbSet {
  if (!PDB) PDB = GROUPS.map(buildGroup);
  return PDB;
}
export const pdbReady = () => PDB !== null;

/** Per-piece states of a cube: cs[piece], es[piece]. */
export function pieceStates(c: Cubie): { cs: Uint8Array; es: Uint8Array } {
  const cs = new Uint8Array(8), es = new Uint8Array(12);
  for (let i = 0; i < 8; i++) cs[c.cp[i]] = i * 3 + c.co[i];
  for (let i = 0; i < 12; i++) es[c.ep[i]] = i * 2 + c.eo[i];
  return { cs, es };
}

/** Admissible lower bound on the quarter-turn distance. */
export function lowerBound(cs: ArrayLike<number>, es: ArrayLike<number>, tables = pdb()): number {
  let h = 0;
  for (let gi = 0; gi < GROUPS.length; gi++) {
    const g = GROUPS[gi];
    const v = tables[gi][groupIndex(g, g.kind === 'c' ? cs : es)];
    if (v > h) h = v;
  }
  return h;
}
