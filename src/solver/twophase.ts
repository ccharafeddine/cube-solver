/**
 * Kociemba's two-phase algorithm for the 3x3 ("Fast" mode).
 *
 * Phase 1 brings the cube into the subgroup <U, D, R2, L2, F2, B2>, where every
 * corner and edge is oriented and the four slice edges sit in the slice.
 * Phase 2 solves inside that subgroup using only those moves. Both phases are
 * IDA* searches guided by pruning tables. The search keeps going after its
 * first answer, lengthening phase 1 to find shorter totals, and reports each
 * improvement; the time budget decides when to stop (the cube-solving version
 * of an engine's "best move so far").
 */
import { applyCubieMove, moveName, solvabilityError, type Cubie } from '../cube/cubie';
import { buildMoveTable, buildPruning, cornerPerm, flip, slice, slicePerm, twist, udEdgePerm } from './coords';

const ALL = Array.from({ length: 18 }, (_, i) => i);
/** U U2 U' D D2 D' R2 L2 F2 B2 */
const P2 = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16];

interface Tables {
  twistMv: Int32Array; flipMv: Int32Array; sliceMv: Int32Array;
  cpMv: Int32Array; udMv: Int32Array; spMv: Int32Array;
  pTwistSlice: Uint8Array; pFlipSlice: Uint8Array; pCpSp: Uint8Array; pUdSp: Uint8Array;
}

let T: Tables | null = null;

export function tables(): Tables {
  if (T) return T;
  const twistMv = buildMoveTable(2187, twist, ALL);
  const flipMv = buildMoveTable(2048, flip, ALL);
  const sliceMv = buildMoveTable(495, slice, ALL);
  const cpMv = buildMoveTable(40320, cornerPerm, P2);
  const udMv = buildMoveTable(40320, udEdgePerm, P2);
  const spMv = buildMoveTable(24, slicePerm, P2);
  const p2idx = P2.map((_, i) => i);
  T = {
    twistMv, flipMv, sliceMv, cpMv, udMv, spMv,
    pTwistSlice: buildPruning(twistMv, 2187, sliceMv, 495, 18, ALL),
    pFlipSlice: buildPruning(flipMv, 2048, sliceMv, 495, 18, ALL),
    pCpSp: buildPruning(cpMv, 40320, spMv, 24, 10, p2idx),
    pUdSp: buildPruning(udMv, 40320, spMv, 24, 10, p2idx),
  };
  return T;
}

/** Skip turning the same face twice in a row, and fix the order of commuting opposite faces. */
const redundant = (m: number, prev: number) => {
  if (prev < 0) return false;
  const f = (m / 3) | 0, pf = (prev / 3) | 0;
  return f === pf || f === pf - 3;
};

export interface SolveOptions {
  /** Stop searching for shorter solutions after this long (ms). */
  timeMs?: number;
  /** Stop as soon as a solution this short (HTM) is found. */
  target?: number;
  onImprove?: (moves: number[]) => void;
  /** Return true to abort. */
  shouldStop?: () => boolean;
}

export type SolveResult = { ok: true; moves: number[] } | { ok: false; error: string };

export function solveTwoPhase(c: Cubie, opts: SolveOptions = {}): SolveResult {
  const err = solvabilityError(c);
  if (err) return { ok: false, error: err };
  const t = tables();
  const deadline = Date.now() + (opts.timeMs ?? 1000);
  const target = opts.target ?? 0;
  let best: number[] | null = null;
  let bestLen = 31;
  let nodes = 0;
  let stop = false;
  const path1: number[] = [];
  const path2: number[] = [];

  const timeUp = () => {
    if ((++nodes & 1023) === 0 && (Date.now() > deadline || opts.shouldStop?.())) stop = true;
    return stop && best !== null;
  };

  function phase2(cp: number, ud: number, sp: number, depth: number, prev: number): boolean {
    if (depth === 0) return cp === 0 && ud === 0 && sp === 0;
    if (timeUp()) return false;
    for (let k = 0; k < 10; k++) {
      const m = P2[k];
      if (redundant(m, prev)) continue;
      const ncp = t.cpMv[cp * 10 + k], nud = t.udMv[ud * 10 + k], nsp = t.spMv[sp * 10 + k];
      const h = Math.max(t.pCpSp[ncp * 24 + nsp], t.pUdSp[nud * 24 + nsp]);
      if (h >= depth) continue;
      path2.push(m);
      if (phase2(ncp, nud, nsp, depth - 1, m)) return true;
      path2.pop();
    }
    return false;
  }

  function startPhase2() {
    let d = c;
    for (const m of path1) d = applyCubieMove(d, m);
    const cp = cornerPerm(d), ud = udEdgePerm(d), sp = slicePerm(d);
    const h = Math.max(t.pCpSp[cp * 24 + sp], t.pUdSp[ud * 24 + sp]);
    const prev = path1.length ? path1[path1.length - 1] : -1;
    for (let d2 = h; path1.length + d2 < bestLen; d2++) {
      path2.length = 0;
      if (phase2(cp, ud, sp, d2, prev)) {
        best = [...path1, ...path2];
        bestLen = best.length;
        opts.onImprove?.(best);
        return;
      }
      if (stop && best) return;
    }
  }

  function phase1(tw: number, fl: number, sl: number, depth: number, prev: number) {
    if (depth === 0) {
      // A phase-1 path ending in a phase-2 move was already tried one level up.
      if (tw === 0 && fl === 0 && sl === 0 && (prev < 0 || !P2.includes(prev))) startPhase2();
      return;
    }
    for (let m = 0; m < 18; m++) {
      if (timeUp() || bestLen <= target) return;
      if (redundant(m, prev)) continue;
      const nt = t.twistMv[tw * 18 + m], nf = t.flipMv[fl * 18 + m], ns = t.sliceMv[sl * 18 + m];
      if (Math.max(t.pTwistSlice[nt * 495 + ns], t.pFlipSlice[nf * 495 + ns]) >= depth) continue;
      path1.push(m);
      phase1(nt, nf, ns, depth - 1, m);
      path1.pop();
    }
  }

  const tw = twist(c), fl = flip(c), sl = slice(c);
  const h0 = Math.max(t.pTwistSlice[tw * 495 + sl], t.pFlipSlice[fl * 495 + sl]);
  for (let d1 = h0; d1 < bestLen; d1++) {
    phase1(tw, fl, sl, d1, -1);
    if ((stop && best) || bestLen <= target) break;
  }
  return best ? { ok: true, moves: best } : { ok: false, error: 'No solution found in time.' };
}

export const formatCubieMoves = (ms: number[]) => ms.map(moveName);
