import { describe, it, expect } from 'vitest';
import { solveMethod, METHODS } from './index';
import { solveEO } from './zz';
import { pieceDist, E } from './common';
import { applyCubieMove, solvedCubie, toFacelets, type Cubie } from '../../cube/cubie';
import { applyMoves, isSolved } from '../../cube/facelets';
import { parseMoves } from '../../cube/notation';

let seed = 1234;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const scramble = (): Cubie => {
  let c = solvedCubie();
  for (let k = 0; k < 30; k++) c = applyCubieMove(c, Math.floor(rnd() * 18));
  return c;
};

describe('method breakdowns', () => {
  for (const m of METHODS) {
    it(`${m.name} solves 8 random cubes and every step is playable notation`, () => {
      for (let i = 0; i < 8; i++) {
        const c = scramble();
        const r = solveMethod(m.id, c);
        if (!r.ok) throw new Error(r.error);
        const all = r.steps.map((s) => s.moves).join(' ');
        expect(isSolved(applyMoves(toFacelets(c), 3, parseMoves(all)), 3)).toBe(true);
        expect(r.steps.every((s) => s.name && s.moves)).toBe(true);
      }
    });
  }
  it('returns no steps for a solved cube', () => {
    for (const m of METHODS) {
      const r = solveMethod(m.id, solvedCubie());
      expect(r.ok && r.steps.length).toBe(0);
    }
  });
  it('rejects unsolvable cubes', () => {
    const c = { ...solvedCubie(), eo: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    expect(solveMethod('cfop', c).ok).toBe(false);
  });
});

describe('helpers', () => {
  it('ZZ edge orientation is exact and orients every edge', () => {
    const c = scramble();
    const ms = solveEO(c);
    expect(ms.reduce(applyCubieMove, c).eo.every((o) => o === 0)).toBe(true);
    expect(ms.length).toBeLessThanOrEqual(7);
  });
  it('piece distance tables are 0 at home and finite elsewhere for full moves', () => {
    const d = pieceDist(E(0), Array.from({ length: 18 }, (_, i) => i));
    expect(d[0]).toBe(0);
    expect(Math.max(...d)).toBeLessThanOrEqual(4);
    expect(Math.min(...d)).toBe(0);
  });
  it('M slice turns work in notation', () => {
    const s = applyMoves(toFacelets(solvedCubie()), 3, parseMoves("M M' M2 M2"));
    expect(isSolved(s, 3)).toBe(true);
  });
});
