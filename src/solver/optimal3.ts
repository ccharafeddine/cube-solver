/**
 * Optimal 3x3 solver in the quarter-turn metric ("Optimal" mode).
 *
 * Plain IDA* over the 12 quarter turns. The heuristic is the larger of three
 * exact sub-problem distances (corner twist + slice, edge flip + slice, corner
 * permutation), each a lower bound on the full distance, so the first solution
 * found at a depth is optimal. These tables are small (~2 MB together) but
 * weak, so a proof is quick for short positions and slow beyond roughly 14
 * quarter turns; the caller sets a time budget and the result says whether
 * optimality was proven.
 */
import { MOVE_CUBES, solvabilityError, type Cubie } from '../cube/cubie';
import { buildMoveTable, buildPruning, cornerPerm, flip, slice, twist } from './coords';
import { tables as twoPhaseTables } from './twophase';

export const QUARTER = [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17];

interface QTables { cpMv: Int32Array; pTwS: Uint8Array; pFlS: Uint8Array; pCp: Uint8Array }
let Q: QTables | null = null;

function tables(): QTables {
  if (Q) return Q;
  const t = twoPhaseTables();
  const all = Array.from({ length: 18 }, (_, i) => i);
  const cpMv = buildMoveTable(40320, cornerPerm, all);
  const zero = new Int32Array(18); // a one-value dummy coordinate
  Q = {
    cpMv,
    pTwS: buildPruning(t.twistMv, 2187, t.sliceMv, 495, 18, QUARTER),
    pFlS: buildPruning(t.flipMv, 2048, t.sliceMv, 495, 18, QUARTER),
    pCp: buildPruning(cpMv, 40320, zero, 1, 18, QUARTER),
  };
  return Q;
}

export type OptimalResult =
  | { ok: true; moves: number[]; proven: true }
  | { ok: false; error: string; searchedTo?: number };

/** Moves are cubie move indices, all quarter turns; merge pairs for display. */
export function solveOptimal(c: Cubie, timeMs = 10000, shouldStop?: () => boolean): OptimalResult {
  const err = solvabilityError(c);
  if (err) return { ok: false, error: err };
  const t2 = twoPhaseTables();
  const q = tables();
  const deadline = Date.now() + timeMs;
  let nodes = 0, stop = false;
  const path: number[] = [];
  const ep0 = c.ep, eo0 = c.eo;
  // Edges need checking beyond the heuristics' coordinates: keep a cubie per level.
  const isGoal = (moves: number[]) => {
    let ep = ep0, eo = eo0;
    for (const m of moves) {
      const mc = MOVE_CUBES[m];
      ep = mc.ep.map((p) => ep[p]);
      eo = mc.ep.map((p, i) => (eo[p] + mc.eo[i]) % 2);
    }
    return ep.every((e, i) => e === i) && eo.every((o) => o === 0);
  };

  function dfs(tw: number, fl: number, sl: number, cp: number, depth: number): boolean {
    if (depth === 0) return tw === 0 && fl === 0 && sl === 0 && cp === 0 && isGoal(path);
    if ((++nodes & 4095) === 0 && (Date.now() > deadline || shouldStop?.())) stop = true;
    if (stop) return false;
    const n = path.length;
    const p1 = n ? path[n - 1] : -1, p2 = n > 1 ? path[n - 2] : -1;
    for (const m of QUARTER) {
      const f = (m / 3) | 0;
      if (p1 >= 0) {
        const pf = (p1 / 3) | 0;
        if (f === pf && m !== p1) continue; // X X' cancels
        if (f === pf && p2 === m) continue; // X X X is X'
        if (f === pf - 3) continue; // commuting opposite faces: fixed order
      }
      const nt = t2.twistMv[tw * 18 + m], nf = t2.flipMv[fl * 18 + m], ns = t2.sliceMv[sl * 18 + m];
      const nc = q.cpMv[cp * 18 + m];
      const h = Math.max(q.pTwS[nt * 495 + ns], q.pFlS[nf * 495 + ns], q.pCp[nc]);
      if (h >= depth) continue;
      path.push(m);
      if (dfs(nt, nf, ns, nc, depth - 1)) return true;
      path.pop();
    }
    return false;
  }

  const tw = twist(c), fl = flip(c), sl = slice(c), cp = cornerPerm(c);
  for (let d = Math.max(q.pTwS[tw * 495 + sl], q.pFlS[fl * 495 + sl], q.pCp[cp]); d <= 30; d++) {
    if (dfs(tw, fl, sl, cp, d)) return { ok: true, moves: [...path], proven: true };
    if (stop) return { ok: false, error: `No solution of ${d} quarter turns or fewer; stopped before proving the optimum.`, searchedTo: d - 1 };
  }
  return { ok: false, error: 'Search exhausted.' };
}

/** Merge X X into X2 for display (it still counts as two quarter turns). */
export function mergeQuarterTurns(ms: number[]): number[] {
  const out: number[] = [];
  for (const m of ms) {
    const last = out[out.length - 1];
    if (last === m && m % 3 !== 1) out[out.length - 1] = m - (m % 3) + 1;
    else out.push(m);
  }
  return out;
}
