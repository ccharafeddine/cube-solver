/**
 * Analysis for 4x4 to 7x7: the reduction solution, its phases as a method
 * breakdown, and every single-layer quarter turn ranked by an estimate of the
 * moves left after it.
 *
 * The estimate is the length of the reduction solution from the resulting
 * position: it measures progress through the reduction (centres, then edges,
 * then 3x3), not a proven distance, so every candidate is labelled ≈.
 */
import { applyTurn, isSolved, type State } from '../../cube/facelets';
import { formatMove, qtm } from '../../cube/notation';
import { rankCandidates } from '../rank';
import type { AnalyzeRequest, AnalyzeResponse } from '../protocol';
import { layerTurns, turnName } from './core';
import { solveBig } from './reduce';

export function analyzeBig(req: AnalyzeRequest, emit: (r: AnalyzeResponse) => void): void {
  const n = req.n;
  const state: State = Uint8Array.from(req.state);
  const main = solveBig(state, n, { timeMs: 200 });
  if (!main.ok) return emit({ id: req.id, kind: 'invalid', error: main.error });
  if (isSolved(state, n)) return emit({ id: req.id, kind: 'result', final: true, solution: [], qtm: 0, optimal: true, candidates: [], method: [] });
  const solution = main.moves.map(formatMove);
  const current = qtm(main.moves);
  const method = main.phases.map((p) => ({ name: p.name, moves: p.moves.map(formatMove).join(' ') }));
  // Show the solution straight away; the ranking takes a moment longer.
  emit({ id: req.id, kind: 'result', final: false, solution, qtm: current, optimal: false });
  const dists = layerTurns(n).map((t) => {
    const r = solveBig(applyTurn(state, n, t), n, { timeMs: 5 });
    return { move: turnName(t, n), distance: r.ok ? qtm(r.moves) : current + 1, exact: false };
  });
  emit({
    id: req.id, kind: 'result', final: true, solution, qtm: current, optimal: false,
    note: 'Reduction solution (centres, then edges, then 3x3), not the shortest possible.',
    candidates: rankCandidates(current, dists), method,
  });
}
