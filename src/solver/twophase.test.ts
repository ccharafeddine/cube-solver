import { describe, it, expect } from 'vitest';
import { solveTwoPhase, formatCubieMoves } from './twophase';
import { applyCubieMove, solvedCubie, MOVE_CUBES } from '../cube/cubie';
import { applyMoves, isSolved, solved } from '../cube/facelets';
import { parseMoves } from '../cube/notation';
import { fromFacelets } from '../cube/cubie';

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('two-phase 3x3 solver', () => {
  it('solves 30 random 40-move scrambles in at most 22 moves and the result is solved', () => {
    for (let i = 0; i < 30; i++) {
      let c = solvedCubie();
      for (let k = 0; k < 40; k++) c = applyCubieMove(c, Math.floor(rnd() * 18));
      const r = solveTwoPhase(c, { timeMs: 300 });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      let d = c;
      for (const m of r.moves) d = applyCubieMove(d, m);
      expect(d).toEqual(solvedCubie());
      expect(r.moves.length).toBeLessThanOrEqual(22);
    }
  });

  it('solves the superflip in 20 or so moves', () => {
    const s = applyMoves(solved(3), 3, parseMoves("U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2"));
    const p = fromFacelets(s);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const r = solveTwoPhase(p.cubie, { timeMs: 2000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.moves.length).toBeLessThanOrEqual(22);
      expect(isSolved(applyMoves(s, 3, parseMoves(formatCubieMoves(r.moves).join(' '))), 3)).toBe(true);
    }
  });

  it('returns an empty solution for a solved cube', () => {
    const r = solveTwoPhase(solvedCubie());
    expect(r.ok && r.moves.length).toBe(0);
  });

  it('refuses an unsolvable cube', () => {
    const c = { ...solvedCubie(), co: [1, 0, 0, 0, 0, 0, 0, 0] };
    expect(solveTwoPhase(c).ok).toBe(false);
    expect(MOVE_CUBES.length).toBe(18);
  });
});
