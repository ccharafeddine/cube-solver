/**
 * The standard viewing orientation, for any cube size.
 *
 * Standard colour scheme: white U, green F, red R, orange L, yellow D, blue B.
 * In the sticker model colour c is the colour of face c when solved (U R F D L B),
 * so "standard" means: the U face shows colour 0 (white) and F shows colour 2 (green).
 *
 * x/y/z rotate the whole cube in the model. `standardRotation` finds the
 * whole-cube rotation (at most two moves) that brings the cube back to white
 * on top and green in front:
 * - odd sizes read it from the fixed centres;
 * - even sizes have no fixed centres, so they use the yellow-orange-blue corner
 *   (home DLB), which no face turn of U, R or F moves; any rotation does.
 */
import { applyMoves, model, type Move, type State, type Vec3 } from './facelets';
import { parseMoves } from './notation';

/** All 24 whole-cube orientations as shortest rotation sequences. */
export const ROTATIONS: string[] = ['', 'y', "y'", 'y2', 'x', "x'", 'x2', 'z', "z'", 'z2',
    'x y', "x y'", 'x y2', "x' y", "x' y'", "x' y2", 'x2 y', "x2 y'", 'z y', "z y'", 'z y2', "z' y", "z' y'", "z' y2"];

const centreIndex = (n: number, face: number) => face * n * n + ((n - 1) / 2) * n + (n - 1) / 2;

/** Sticker indices of the D-L-B corner (yellow, orange, blue when standard). */
function dlbCorner(n: number): number[] {
  const m = n - 1;
  const { index } = model(n);
  const out: number[] = [];
  const pos: Vec3 = [-m, -m, -m];
  for (const nrm of [[0, -1, 0], [-1, 0, 0], [0, 0, -1]] as Vec3[]) {
    const i = index.get(`${pos.join(',')},${nrm.join(',')}`);
    if (i === undefined) throw new Error('corner sticker missing');
    out.push(i);
  }
  return out;
}

/** Is the cube held in the standard orientation (white U, green F)? */
export function isStandardOrientation(s: State, n: number): boolean {
  if (n % 2 === 1) return s[centreIndex(n, 0)] === 0 && s[centreIndex(n, 2)] === 2;
  const [d, l, b] = dlbCorner(n);
  return s[d] === 3 && s[l] === 4 && s[b] === 5;
}

/**
 * The rotation that returns the cube to the standard orientation, or null if
 * none does (only possible for painted cubes with impossible centres/corner).
 */
export function standardRotation(s: State, n: number): Move[] | null {
  for (const r of ROTATIONS) {
    const ms = parseMoves(r);
    if (isStandardOrientation(applyMoves(s, n, ms), n)) return ms;
  }
  return null;
}

/**
 * Default camera: slightly above, front-right corner toward the viewer, so U
 * (white), F (green) and R (red) are visible with F the most face-on. The view
 * scales the cube to a fixed size, so this is the same for every n.
 */
export const DEFAULT_CAMERA: Vec3 = [4.2, 3.6, 5.6];
