import { describe, expect, it } from 'vitest';
import { applyTurn, isSolved, moveToTurn, solved } from '../../cube/facelets';
import { layerTurns } from './core';
import { solveBig } from './reduce';

function scramble(n: number, len: number, seed: number) {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const ts = layerTurns(n);
  let s = solved(n);
  for (let i = 0; i < len; i++) s = applyTurn(s, n, ts[Math.floor(rand() * ts.length)]);
  return s;
}

describe('reduction solver', () => {
  for (const n of [4, 5, 6, 7]) {
    it(`solves random ${n}x${n} scrambles, verified by playback`, () => {
      for (let seed = 1; seed <= 3; seed++) {
        const s = scramble(n, 60, seed * 7919 + n);
        const t0 = Date.now();
        const r = solveBig(s, n);
        if (!r.ok) throw new Error(r.error);
        let c = s;
        for (const m of r.moves) c = applyTurn(c, n, moveToTurn(m, n));
        expect(isSolved(c, n)).toBe(true);
        console.log(n, r.moves.length, r.phases.map((p) => `${p.name}:${p.moves.length}`).join(' '), Date.now() - t0, 'ms');
      }
    }, 120000);
  }
});

describe('big-cube analysis', () => {
  it('ranks every single-layer turn on a 7x7 with estimates', async () => {
    const { analyzeBig } = await import('./analyze');
    const s = scramble(7, 6, 11);
    const out: import('../protocol').AnalyzeResponse[] = [];
    const t0 = Date.now();
    analyzeBig({ id: 1, n: 7, state: Array.from(s), mode: 'fast', timeMs: 100, method: 'lbl' }, (r) => out.push(r));
    console.log('7x7 analysis', Date.now() - t0, 'ms');
    const last = out[out.length - 1];
    if (last.kind !== 'result') throw new Error('no result');
    expect(last.candidates).toHaveLength(42);
    expect(last.candidates!.every((c) => !c.exact)).toBe(true);
    expect(last.method!.map((m) => m.name)).toContain('Solve the centres');
  }, 120000);
});

describe('single-layer notation', () => {
  it('parses and prints SiGN inner slices and wide moves', async () => {
    const { parseMoves, formatMoves } = await import('../../cube/notation');
    expect(formatMoves(parseMoves("2R 3Lw' Rw2 2U' R"))).toBe("2R 3Lw' Rw2 2U' R");
  });
  it('2R turns only the second layer, so 2R + R equals Rw', async () => {
    const { parseMoves } = await import('../../cube/notation');
    const { applyMoves } = await import('../../cube/facelets');
    const a = applyMoves(solved(4), 4, parseMoves('2R R'));
    const b = applyMoves(solved(4), 4, parseMoves('Rw'));
    expect(Array.from(a)).toEqual(Array.from(b));
  });
  it('names every single layer of a 5x5 and plays back to the same turn', async () => {
    const { layerMove } = await import('../../cube/facelets');
    for (const t of layerTurns(5)) {
      const m = layerMove(t, 5);
      expect(Array.from(applyTurn(solved(5), 5, moveToTurn(m, 5)))).toEqual(Array.from(applyTurn(solved(5), 5, t)));
    }
  });
  it('rejects impossible big cubes with a reason', () => {
    const s = solved(4);
    [s[0], s[1]] = [s[1], s[0]]; // same colour: still fine
    expect(solveBig(s, 4).ok).toBe(true);
    const bad = solved(4);
    bad[5] = 1; bad[16 + 5] = 0; // swap one U centre with one R centre sticker: fine as a 3-cycle-reachable centre state
    expect(solveBig(bad, 4).ok).toBe(true);
    const twisted = solved(4);
    twisted[0] = 4; // a lone recoloured corner sticker
    expect(solveBig(twisted, 4).ok).toBe(false);
  });
});
