/**
 * One full analysis of a position: validity, the main solution, ranked
 * candidates and (3x3) the layer-by-layer breakdown. Pure and synchronous so
 * it can be unit-tested; the worker only wraps it.
 */
import { fromFacelets, applyCubieMove, moveName, MOVE_NAMES, type Cubie } from '../cube/cubie';
import { applyMove } from '../cube/facelets';
import { parseMoves } from '../cube/notation';
import { solve2, distance2, parse2 } from './solver2';
import { solveTwoPhase } from './twophase';
import { solveOptimal, mergeQuarterTurns, QUARTER } from './optimal3';
import { solveLBL } from './lbl';
import { rankCandidates, QUARTER_NAMES } from './rank';
import type { AnalyzeRequest, AnalyzeResponse } from './protocol';

const qtmOf = (names: string[]) => names.reduce((n, m) => n + (m.endsWith('2') ? 2 : 1), 0);

export function analyze(req: AnalyzeRequest, emit: (r: AnalyzeResponse) => void, shouldStop?: () => boolean): void {
  const state = Uint8Array.from(req.state);
  if (req.n === 2) {
    const p = parse2(state);
    if (!p.ok) return emit({ id: req.id, kind: 'invalid', error: p.error });
    const sol = solve2(state);
    if (!sol.ok) return emit({ id: req.id, kind: 'invalid', error: sol.error });
    const current = sol.moves.length;
    const candidates = rankCandidates(
      current,
      QUARTER_NAMES.map((move) => ({ move, distance: distance2(applyMove(state, 2, parseMoves(move)[0]))!, exact: true })),
      req.beginner,
    );
    // Show "U U" as the standard "U2" (still two quarter turns).
    const shown: string[] = [];
    for (const m of sol.moves) {
      if (shown.length && shown[shown.length - 1] === m) shown[shown.length - 1] = m[0] + '2';
      else shown.push(m);
    }
    return emit({ id: req.id, kind: 'result', final: true, solution: shown, qtm: current, optimal: true, candidates });
  }

  const parsed = fromFacelets(state);
  if (!parsed.ok) return emit({ id: req.id, kind: 'invalid', error: parsed.error });
  const c = parsed.cubie;
  const fast = solveTwoPhase(c, {
    timeMs: req.mode === 'fast' ? req.timeMs : Math.min(req.timeMs, 500),
    shouldStop,
    onImprove: (ms) => {
      const names = ms.map(moveName);
      emit({ id: req.id, kind: 'result', final: false, solution: names, qtm: qtmOf(names), optimal: false });
    },
  });
  if (!fast.ok) return emit({ id: req.id, kind: 'invalid', error: fast.error });
  let solution = fast.moves.map(moveName);
  let optimal = solution.length === 0;
  let note: string | undefined;

  if (req.mode === 'optimal' && solution.length) {
    const r = solveOptimal(c, req.timeMs, shouldStop);
    if (r.ok) {
      solution = mergeQuarterTurns(r.moves).map(moveName);
      optimal = true;
    } else {
      note = `Optimal search proved no solution of ${r.searchedTo ?? '?'} quarter turns or fewer exists before time ran out; showing the fast (two-phase) solution.`;
    }
  }

  const current = qtmOf(solution);
  // Candidates: exact optimal distances while short enough to prove quickly, else two-phase estimates.
  // The solution's first move as a quarter turn (U2 starts with U).
  const firstQuarter = solution.length ? (() => { const i = MOVE_NAMES.indexOf(solution[0]); return i - (i % 3) + (i % 3 === 2 ? 2 : 0); })() : -1;
  const exactMode = req.mode === 'optimal' && optimal && current <= 11;
  const dists = QUARTER.map((m, k) => {
    const child: Cubie = applyCubieMove(c, m);
    if (exactMode) {
      const r = solveOptimal(child, 1500, shouldStop);
      if (r.ok) return { move: QUARTER_NAMES[k], distance: r.moves.length, exact: true };
    }
    // A quick two-phase solve gives an upper bound. One move can change the
    // distance by at most one, and the main solution's first quarter turn is
    // known to make progress, so clamp the estimate to what is certain.
    const r = solveTwoPhase(child, { timeMs: 60, shouldStop });
    let est = r.ok ? qtmOf(r.moves.map(moveName)) : current + 1;
    est = Math.min(est, current + 1);
    if (firstQuarter === m) est = current - 1;
    return { move: QUARTER_NAMES[k], distance: est, exact: false };
  });
  const candidates = rankCandidates(current, dists, req.beginner);
  const lbl = solveLBL(c);
  emit({
    id: req.id, kind: 'result', final: true, solution, qtm: current, optimal, note, candidates,
    method: lbl.ok ? lbl.steps : undefined,
  });
}
