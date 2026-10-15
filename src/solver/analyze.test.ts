import { describe, it, expect } from 'vitest';
import { analyze } from './analyze';
import type { AnalyzeResponse } from './protocol';
import { applyMoves, solved } from '../cube/facelets';
import { parseMoves } from '../cube/notation';

const run = (n: 2 | 3, seq: string, mode: 'fast' | 'optimal' = 'fast') => {
  const out: AnalyzeResponse[] = [];
  const state = Array.from(applyMoves(solved(n), n, parseMoves(seq)));
  analyze({ id: 1, n, state, mode, timeMs: 1500, method: 'lbl' }, (r) => out.push(r));
  return out[out.length - 1];
};

describe('analyze', () => {
  it('2x2: optimal solution and exact ranking', () => {
    const r = run(2, "R U F'");
    expect(r.kind).toBe('result');
    if (r.kind !== 'result') return;
    expect(r.qtm).toBe(3);
    expect(r.optimal).toBe(true);
    // On a 2x2, F and B are the same turn up to a whole-cube rotation, so both tie.
    expect(r.candidates![0]).toMatchObject({ distance: 2, delta: -1, exact: true });
    expect(r.candidates!.filter((c) => c.distance === 2).map((c) => c.move).sort()).toEqual(['B', 'F']);
  });
  it('3x3 optimal mode proves a short solution and ranks exactly', () => {
    const r = run(3, "R U2 F", 'optimal');
    if (r.kind !== 'result') throw new Error(r.kind === 'invalid' ? r.error : r.kind);
    expect(r.optimal).toBe(true);
    expect(r.qtm).toBe(4);
    expect(r.candidates![0]).toMatchObject({ move: "F'", distance: 3, exact: true });
    expect(r.candidates!.every((c) => c.bound !== undefined)).toBe(true);
    expect(r.method!.length).toBeGreaterThan(0);
  });
  it('3x3 fast mode on a deep scramble', () => {
    const r = run(3, "R U R' U' F2 D L' B2 U' R2 F' L D2 B R' U2 F L2");
    if (r.kind !== 'result') throw new Error(r.kind === 'invalid' ? r.error : r.kind);
    expect(r.solution.length).toBeLessThanOrEqual(22);
    expect(r.candidates).toHaveLength(12);
  });
  it('reports an invalid state', () => {
    const s = Array.from(solved(3));
    [s[8], s[9]] = [s[9], s[8]];
    const out: AnalyzeResponse[] = [];
    analyze({ id: 1, n: 3, state: s, mode: 'fast', timeMs: 100, method: 'lbl' }, (r) => out.push(r));
    expect(out[0].kind).toBe('invalid');
  });
});

describe('ranking ties in Fast mode', () => {
  it('breaks ties between equal estimates with the proven lower bound, and proves short distances', () => {
    const r = run(3, "R U F' L2 D B'");
    if (r.kind !== 'result') throw new Error('invalid');
    expect(r.optimal).toBe(true); // short positions are proven even in Fast mode
    const cs = r.candidates!;
    for (let i = 1; i < cs.length; i++) {
      if (cs[i].score === cs[i - 1].score) expect((cs[i].bound ?? 0) >= (cs[i - 1].bound ?? 0)).toBe(true);
    }
    expect(cs[0].delta).toBe(-1);
    expect(cs[0].exact).toBe(true);
  });
});
