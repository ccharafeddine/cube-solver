/**
 * Optimal 3x3 solver in the quarter-turn metric ("Optimal" mode).
 *
 * Korf-style IDA* over the 12 quarter turns. The heuristic is the maximum of
 * five pattern databases (see pdb.ts), each an exact distance for a group of
 * pieces, so the first solution found at a depth is proven optimal. Each node
 * costs about twenty table lookups. Progress (depth reached, nodes searched)
 * is reported so the UI can show the proof advancing and cancel it.
 */
import { solvabilityError, type Cubie } from '../cube/cubie';
import { CT, ET, QUARTER, pdb, pieceStates } from './pdb';

export { QUARTER };

export interface OptimalProgress { depth: number; nodes: number; elapsedMs: number }

export type OptimalResult =
  | { ok: true; moves: number[]; proven: true; nodes: number }
  | { ok: false; error: string; searchedTo?: number };

export function solveOptimal(
  c: Cubie, timeMs = 10000, shouldStop?: () => boolean, onProgress?: (p: OptimalProgress) => void,
): OptimalResult {
  const err = solvabilityError(c);
  if (err) return { ok: false, error: err };
  const tables = pdb();
  const t0 = Date.now();
  const deadline = t0 + timeMs;
  let nodes = 0, stop = false, curDepth = 0;
  const path: number[] = [];
  const { cs: cs0, es: es0 } = pieceStates(c);
  // One buffer per level avoids allocation in the hot loop.
  const CS = Array.from({ length: 32 }, () => new Uint8Array(8));
  const ES = Array.from({ length: 32 }, () => new Uint8Array(12));
  CS[0].set(cs0);
  ES[0].set(es0);

  // Hand-unrolled group indices (base-24 digits): this is the hot path.
  const [tc0, tc1, te0, te1, te2] = tables;
  const h = (cs: Uint8Array, es: Uint8Array) => {
    let best = tc0[cs[0] + 24 * (cs[1] + 24 * (cs[2] + 24 * cs[3]))];
    let v = tc1[cs[4] + 24 * (cs[5] + 24 * (cs[6] + 24 * cs[7]))];
    if (v > best) best = v;
    v = te0[es[0] + 24 * (es[1] + 24 * (es[2] + 24 * (es[3] + 24 * es[4])))];
    if (v > best) best = v;
    v = te1[es[5] + 24 * (es[6] + 24 * (es[7] + 24 * (es[8] + 24 * es[9])))];
    if (v > best) best = v;
    v = te2[es[7] + 24 * (es[8] + 24 * (es[9] + 24 * (es[10] + 24 * es[11])))];
    return v > best ? v : best;
  };
  const solved = (cs: Uint8Array, es: Uint8Array) => {
    for (let i = 0; i < 8; i++) if (cs[i] !== i * 3) return false;
    for (let i = 0; i < 12; i++) if (es[i] !== i * 2) return false;
    return true;
  };

  function dfs(level: number, depth: number): boolean {
    const cs = CS[level], es = ES[level];
    if (depth === 0) return solved(cs, es);
    if ((++nodes & 16383) === 0) {
      const now = Date.now();
      if (now > deadline || shouldStop?.()) stop = true;
      onProgress?.({ depth: curDepth, nodes, elapsedMs: now - t0 });
    }
    if (stop) return false;
    const p1 = level ? path[level - 1] : -1, p2 = level > 1 ? path[level - 2] : -1;
    const ncs = CS[level + 1], nes = ES[level + 1];
    for (let k = 0; k < 12; k++) {
      const m = QUARTER[k];
      if (p1 >= 0) {
        const f = (m / 3) | 0, pf = (p1 / 3) | 0;
        if (f === pf && m !== p1) continue; // X X' cancels
        if (f === pf && p2 === m) continue; // X X X is X'
        if (f === pf - 3) continue; // commuting opposite faces: fixed order
      }
      const ct = CT[k], et = ET[k];
      for (let i = 0; i < 8; i++) ncs[i] = ct[cs[i]];
      for (let i = 0; i < 12; i++) nes[i] = et[es[i]];
      if (h(ncs, nes) >= depth) continue;
      path[level] = m;
      if (dfs(level + 1, depth - 1)) return true;
    }
    return false;
  }

  for (let d = h(CS[0], ES[0]); d <= 30; d++) {
    curDepth = d;
    onProgress?.({ depth: d, nodes, elapsedMs: Date.now() - t0 });
    if (dfs(0, d)) return { ok: true, moves: path.slice(0, d), proven: true, nodes };
    if (stop) return { ok: false, error: `No solution of ${d - 1} quarter turns or fewer exists; stopped before finishing depth ${d}.`, searchedTo: d - 1 };
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
