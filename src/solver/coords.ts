/**
 * Kociemba coordinates and their move/pruning tables.
 *
 * Move tables are filled by a breadth-first walk of each coordinate's state
 * space starting from solved, keeping one representative cube per coordinate
 * value. That needs only the coordinate *getters* (no inverse setters), and
 * the walk doubles as a check that the coordinate really is closed under the
 * move set: an unreachable value would show up as -1.
 */
import { MOVE_CUBES, multiply, solvedCubie, type Cubie } from '../cube/cubie';
import { permRank } from './perm';

export const twist = (c: Cubie) => c.co.slice(0, 7).reduce((a, x) => a * 3 + x, 0);
export const flip = (c: Cubie) => c.eo.slice(0, 11).reduce((a, x) => a * 2 + x, 0);

const binom = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
};

/** Which 4 of the 12 positions hold the UD-slice edges (FR FL BL BR), 0..494; 0 when solved. */
export function slice(c: Cubie): number {
  let a = 0, x = 0;
  for (let j = 11; j >= 0; j--) {
    if (c.ep[j] >= 8) {
      a += binom(11 - j, x + 1);
      x++;
    }
  }
  return a;
}

export const cornerPerm = (c: Cubie) => permRank(c.cp);
/** Phase 2 only: permutation of the 8 U/D edges. */
export const udEdgePerm = (c: Cubie) => permRank(c.ep.slice(0, 8));
/** Phase 2 only: permutation of the 4 slice edges. */
export const slicePerm = (c: Cubie) => permRank(c.ep.slice(8).map((e) => e - 8));

export function buildMoveTable(size: number, coord: (c: Cubie) => number, moves: number[]): Int32Array {
  const nm = moves.length;
  const table = new Int32Array(size * nm).fill(-1);
  const reps: (Cubie | undefined)[] = new Array(size);
  const start = solvedCubie();
  reps[coord(start)] = start;
  const queue = [coord(start)];
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi];
    const c = reps[x]!;
    for (let k = 0; k < nm; k++) {
      const d = multiply(c, MOVE_CUBES[moves[k]]);
      const y = coord(d);
      table[x * nm + k] = y;
      if (!reps[y]) {
        reps[y] = d;
        queue.push(y);
      }
    }
  }
  if (queue.length !== size) throw new Error(`coordinate reached ${queue.length} of ${size} values`);
  return table;
}

/** BFS distance table over a pair of coordinates (a * sizeB + b). */
export function buildPruning(
  ta: Int32Array, sizeA: number, tb: Int32Array, sizeB: number, nm: number, moveIdx: number[],
): Uint8Array {
  const total = sizeA * sizeB;
  const d = new Uint8Array(total).fill(255);
  d[0] = 0;
  let frontier = new Int32Array([0]);
  let depth = 0;
  while (frontier.length) {
    const next: number[] = [];
    for (const x of frontier) {
      const a = (x / sizeB) | 0, b = x % sizeB;
      for (const k of moveIdx) {
        const y = ta[a * nm + k] * sizeB + tb[b * nm + k];
        if (d[y] === 255) {
          d[y] = depth + 1;
          next.push(y);
        }
      }
    }
    frontier = Int32Array.from(next);
    depth++;
  }
  return d;
}
