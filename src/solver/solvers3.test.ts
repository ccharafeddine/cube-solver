import { describe, it, expect } from 'vitest';
import { solveOptimal, mergeQuarterTurns } from './optimal3';
import { solveLBL } from './methods/lbl';
import { rankCandidates } from './rank';
import { applyCubieMove, fromFacelets, solvedCubie, toFacelets } from '../cube/cubie';
import { applyMoves } from '../cube/facelets';
import { parseMoves } from '../cube/notation';

let seed = 99;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const scramble = (n: number) => {
  let c = solvedCubie();
  for (let k = 0; k < n; k++) c = applyCubieMove(c, Math.floor(rnd() * 18));
  return c;
};

describe('optimal 3x3 (QTM)', () => {
  it('finds the known optimum for short scrambles', () => {
    const c = fromFacelets(applyMoves(toFacelets(solvedCubie()), 3, parseMoves("R U F' D")));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const r = solveOptimal(c.cubie, 30000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.moves.length).toBe(4);
  });
  it('a solution it returns really solves the cube', () => {
    const c = scramble(6);
    const r = solveOptimal(c, 30000);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.moves.length).toBeLessThanOrEqual(12);
      expect(r.moves.reduce(applyCubieMove, c)).toEqual(solvedCubie());
    }
  });
  it('merges repeated quarter turns for display', () => expect(mergeQuarterTurns([0, 0, 3])).toEqual([1, 3]));
});

describe('layer-by-layer', () => {
  it('solves 15 random cubes step by step', () => {
    for (let i = 0; i < 15; i++) {
      const c = scramble(30);
      const r = solveLBL(c);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const all = r.steps.map((s) => s.moves).join(' ');
      const end = applyMoves(toFacelets(c), 3, parseMoves(all));
      expect(Array.from(end)).toEqual(Array.from(toFacelets(solvedCubie())));
    }
  });
});

describe('ranking', () => {
  const ds = [
    { move: 'B', distance: 5, exact: true },
    { move: 'R', distance: 5, exact: true },
    { move: 'U', distance: 7, exact: true },
  ];
  it('ranks purely by distance to solved', () => {
    const r = rankCandidates(6, ds);
    expect(r[0].distance).toBe(5);
    expect(r[0].delta).toBe(-1);
    expect(r[2].move).toBe('U');
    // No ease-by-hand bias: a shorter B beats a longer R.
    expect(rankCandidates(6, [{ move: 'B', distance: 5, exact: true }, { move: 'R', distance: 5.5, exact: true }])[0].move).toBe('B');
  });
});
