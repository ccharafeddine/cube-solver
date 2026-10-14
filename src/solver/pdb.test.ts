import { describe, it, expect } from 'vitest';
import { GROUPS, buildGroup, lowerBound, pieceStates, pdb } from './pdb';
import { solveOptimal } from './optimal3';
import { applyCubieMove, solvedCubie } from '../cube/cubie';

describe('pattern databases', () => {
  it('corner groups cover all 136,080 placements', () => {
    const d = buildGroup(GROUPS[0]);
    let n = 0;
    for (const x of d) if (x !== 255) n++;
    expect(n).toBe(136080);
  });
  it('the bound is admissible: never above a proven optimal length', () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    pdb();
    for (let t = 0; t < 20; t++) {
      let c = solvedCubie();
      for (let i = 0; i < 9; i++) c = applyCubieMove(c, [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 17][Math.floor(rnd() * 12)]);
      const r = solveOptimal(c, 20000);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const p = pieceStates(c);
      expect(lowerBound(p.cs, p.es)).toBeLessThanOrEqual(r.moves.length);
      expect(r.moves.reduce(applyCubieMove, c)).toEqual(solvedCubie());
    }
  });
  it('is zero only for solved', () => {
    const p = pieceStates(solvedCubie());
    expect(lowerBound(p.cs, p.es)).toBe(0);
    const q = pieceStates(applyCubieMove(solvedCubie(), 0));
    expect(lowerBound(q.cs, q.es)).toBe(1);
  });
  it('reports progress and can be cancelled', () => {
    let c = solvedCubie();
    for (const m of [0, 3, 6, 9, 12, 15, 2, 5, 8, 11, 14, 17, 0, 4, 7, 10, 13, 16, 1, 5]) c = applyCubieMove(c, m);
    const seen: number[] = [];
    let calls = 0;
    const r = solveOptimal(c, 60000, () => ++calls > 3, (p) => seen.push(p.depth));
    expect(r.ok).toBe(false);
    expect(seen.length).toBeGreaterThan(0);
  });
});
