/**
 * Cubie-level model of the 3x3 (corners and edges with orientation), using
 * Kociemba's conventions so the two-phase coordinates are the textbook ones.
 * The 2x2 reuses the corner half of it.
 */
import type { State } from './facelets';

// Corners: URF UFL ULB UBR DFR DLF DBL DRB. Edges: UR UF UL UB DR DF DL DB FR FL BL BR.
export interface Cubie {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

const U = 0, R = 9, F = 18, D = 27, L = 36, B = 45;
/** Facelet indices of each corner, starting with its U/D sticker, clockwise. */
export const CORNER_FACELETS = [
  [U + 8, R + 0, F + 2], [U + 6, F + 0, L + 2], [U + 0, L + 0, B + 2], [U + 2, B + 0, R + 2],
  [D + 2, F + 8, R + 6], [D + 0, L + 8, F + 6], [D + 6, B + 8, L + 6], [D + 8, R + 8, B + 6],
];
export const EDGE_FACELETS = [
  [U + 5, R + 1], [U + 7, F + 1], [U + 3, L + 1], [U + 1, B + 1],
  [D + 5, R + 7], [D + 1, F + 7], [D + 3, L + 7], [D + 7, B + 7],
  [F + 5, R + 3], [F + 3, L + 5], [B + 5, L + 3], [B + 3, R + 5],
];
// Face colours: U R F D L B = 0..5
export const CORNER_COLORS = [
  [0, 1, 2], [0, 2, 4], [0, 4, 5], [0, 5, 1], [3, 2, 1], [3, 4, 2], [3, 5, 4], [3, 1, 5],
];
export const EDGE_COLORS = [
  [0, 1], [0, 2], [0, 4], [0, 5], [3, 1], [3, 2], [3, 4], [3, 5], [2, 1], [2, 4], [5, 4], [5, 1],
];

export const solvedCubie = (): Cubie => ({
  cp: [0, 1, 2, 3, 4, 5, 6, 7], co: Array(8).fill(0),
  ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: Array(12).fill(0),
});

// Basic face turns (replaced-by form: position i receives the piece from cp[i]).
const BASIC: Cubie[] = [
  { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: Array(12).fill(0) }, // U
  { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: Array(12).fill(0) }, // R
  { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] }, // F
  { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: Array(12).fill(0) }, // D
  { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: Array(12).fill(0) }, // L
  { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] }, // B
];

/** a * b: apply b after a. */
export function multiply(a: Cubie, b: Cubie): Cubie {
  const cp = new Array(8), co = new Array(8), ep = new Array(12), eo = new Array(12);
  for (let i = 0; i < 8; i++) {
    cp[i] = a.cp[b.cp[i]];
    co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    ep[i] = a.ep[b.ep[i]];
    eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2;
  }
  return { cp, co, ep, eo };
}

/** The 18 face moves, index = 3 * face + (power - 1), faces U R F D L B. */
export const MOVE_CUBES: Cubie[] = [];
for (let f = 0; f < 6; f++) {
  let c = solvedCubie();
  for (let p = 0; p < 3; p++) {
    c = multiply(c, BASIC[f]);
    MOVE_CUBES.push(c);
  }
}

export const applyCubieMove = (c: Cubie, m: number) => multiply(c, MOVE_CUBES[m]);

export const MOVE_NAMES = ['U', 'U2', "U'", 'R', 'R2', "R'", 'F', 'F2', "F'", 'D', 'D2', "D'", 'L', 'L2', "L'", 'B', 'B2', "B'"];
export const moveName = (m: number) => {
  const p = m % 3;
  return 'URFDLB'[(m / 3) | 0] + (p === 0 ? '' : p === 1 ? '2' : "'");
};

export type ParseResult = { ok: true; cubie: Cubie } | { ok: false; error: string };

/**
 * Read a 3x3 sticker state. Colours are relabelled by the centres, so a cube
 * painted in any colour scheme or held in any orientation is accepted.
 */
export function fromFacelets(raw: State): ParseResult {
  if (raw.length !== 54) return { ok: false, error: 'A 3x3 needs 54 stickers.' };
  const centers = [4, 13, 22, 31, 40, 49].map((i) => raw[i]);
  if (new Set(centers).size !== 6) return { ok: false, error: 'The six centres must all be different colours.' };
  const relabel = new Map(centers.map((c, f) => [c, f]));
  const s: number[] = [];
  for (const c of raw) {
    const f = relabel.get(c);
    if (f === undefined) return { ok: false, error: 'A sticker uses a colour that is not on any centre.' };
    s.push(f);
  }
  const counts = Array(6).fill(0);
  s.forEach((c) => counts[c]++);
  if (counts.some((k) => k !== 9)) return { ok: false, error: 'Each colour must appear on exactly 9 stickers.' };
  return fromNormalized(s, true);
}

/** Facelets already labelled by face (0..5). `withEdges` = false for the 2x2's corner-only cube. */
export function fromNormalized(s: ArrayLike<number>, withEdges: boolean): ParseResult {
  const c = solvedCubie();
  for (let i = 0; i < 8; i++) {
    const fl = CORNER_FACELETS[i];
    let ori = 0;
    while (ori < 3 && s[fl[ori]] !== 0 && s[fl[ori]] !== 3) ori++;
    if (ori === 3) return { ok: false, error: 'A corner has no top/bottom colour, so it cannot exist on a real cube.' };
    const c1 = s[fl[(ori + 1) % 3]], c2 = s[fl[(ori + 2) % 3]];
    const j = CORNER_COLORS.findIndex((cc) => cc[0] === s[fl[ori]] && cc[1] === c1 && cc[2] === c2);
    if (j < 0) return { ok: false, error: 'A corner has a colour combination that does not exist (two colours mirrored or repeated).' };
    c.cp[i] = j;
    c.co[i] = ori;
  }
  if (withEdges) {
    for (let i = 0; i < 12; i++) {
      const [a, b] = EDGE_FACELETS[i].map((k) => s[k]);
      const j = EDGE_COLORS.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
      if (j < 0) return { ok: false, error: 'An edge has a colour combination that does not exist.' };
      c.ep[i] = j;
      c.eo[i] = EDGE_COLORS[j][0] === a ? 0 : 1;
    }
  }
  return { ok: true, cubie: c };
}

export function toFacelets(c: Cubie): State {
  const s = new Uint8Array(54);
  for (let f = 0; f < 6; f++) s[9 * f + 4] = f;
  for (let i = 0; i < 8; i++) {
    for (let k = 0; k < 3; k++) s[CORNER_FACELETS[i][(k + c.co[i]) % 3]] = CORNER_COLORS[c.cp[i]][k];
  }
  for (let i = 0; i < 12; i++) {
    for (let k = 0; k < 2; k++) s[EDGE_FACELETS[i][(k + c.eo[i]) % 2]] = EDGE_COLORS[c.ep[i]][k];
  }
  return s;
}

export function parity(p: number[]): number {
  let n = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) n++;
  return n % 2;
}

/** Explain why a cubie state is unreachable, or return null when it is solvable. */
export function solvabilityError(c: Cubie, withEdges = true): string | null {
  if (new Set(c.cp).size !== 8) return 'Two corners are the same piece; one is missing.';
  if (c.co.reduce((a, b) => a + b, 0) % 3) return 'Corner twist is off: one corner has been rotated in place.';
  if (!withEdges) return null;
  if (new Set(c.ep).size !== 12) return 'Two edges are the same piece; one is missing.';
  if (c.eo.reduce((a, b) => a + b, 0) % 2) return 'Edge flip is off: one edge has been flipped in place.';
  if (parity(c.cp) !== parity(c.ep)) return 'Permutation parity is off: two pieces have been swapped.';
  return null;
}
