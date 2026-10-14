import { describe, it, expect } from 'vitest';
import { applyMove, applyMoves, isSolved, solved, model } from './facelets';
import { parseMoves, formatMoves, invertMoves, qtm, simplify } from './notation';
import { MOVE_CUBES, applyCubieMove, fromFacelets, solvedCubie, toFacelets, solvabilityError, multiply } from './cubie';

const FACE = 'URFDLB';

describe('facelet model', () => {
  for (const n of [2, 3, 4, 5]) {
    it(`every face turn has order 4 on ${n}x${n}`, () => {
      for (const f of FACE) {
        const m = parseMoves(f)[0];
        let s = solved(n);
        s = applyMoves(s, n, [m, m, m]);
        expect(isSolved(s, n)).toBe(false);
        expect(isSolved(applyMove(s, n, m), n)).toBe(true);
      }
    });
    it(`a sequence followed by its inverse is identity on ${n}x${n}`, () => {
      const seq = parseMoves("R U F' L2 D B' Rw x y' z2");
      const s = applyMoves(applyMoves(solved(n), n, seq), n, invertMoves(seq));
      expect(isSolved(s, n)).toBe(true);
    });
  }
  it('sexy move has order 6', () => {
    let s = solved(3);
    for (let i = 0; i < 6; i++) s = applyMoves(s, 3, parseMoves("R U R' U'"));
    expect(isSolved(s, 3)).toBe(true);
  });
  it('has 6*n*n stickers', () => expect(model(4).stickers.length).toBe(96));
});

describe('cubie model agrees with the sticker model', () => {
  it('for all 18 face moves', () => {
    MOVE_CUBES.forEach((mc, m) => {
      const name = 'URFDLB'[(m / 3) | 0] + ['', '2', "'"][m % 3];
      const fromStickers = applyMoves(solved(3), 3, parseMoves(name));
      expect(Array.from(toFacelets(mc))).toEqual(Array.from(fromStickers));
    });
  });
  it('round-trips facelets through cubies', () => {
    const s = applyMoves(solved(3), 3, parseMoves("R U2 F' D L' B2 U R'"));
    const r = fromFacelets(s);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.from(toFacelets(r.cubie))).toEqual(Array.from(s));
  });
  it('multiplication matches sequential application', () => {
    const a = applyCubieMove(applyCubieMove(solvedCubie(), 3), 0);
    expect(multiply(MOVE_CUBES[3], MOVE_CUBES[0])).toEqual(a);
  });
});

describe('solvability', () => {
  it('accepts reachable states', () => {
    const r = fromFacelets(applyMoves(solved(3), 3, parseMoves("R U R' F2 D'")));
    expect(r.ok && solvabilityError(r.cubie)).toBe(null);
  });
  it('rejects a twisted corner, flipped edge and swapped pair', () => {
    const t = solvedCubie(); t.co[0] = 1;
    expect(solvabilityError(t)).toMatch(/twist/);
    const f = solvedCubie(); f.eo[0] = 1;
    expect(solvabilityError(f)).toMatch(/flip/);
    const p = solvedCubie(); [p.ep[0], p.ep[1]] = [p.ep[1], p.ep[0]];
    expect(solvabilityError(p)).toMatch(/parity/);
  });
  it('rejects wrong colour counts', () => {
    const s = solved(3); s[0] = 1;
    expect(fromFacelets(s).ok).toBe(false);
  });
  it('accepts any colour scheme via centres', () => {
    const s = applyMoves(solved(3), 3, parseMoves('x y R U'));
    expect(fromFacelets(s).ok).toBe(true);
  });
});

describe('notation', () => {
  it('parses and formats', () => {
    expect(formatMoves(parseMoves("R U2 F' Rw 3Lw2 x'"))).toBe("R U2 F' Rw 3Lw2 x'");
    expect(() => parseMoves('Q')).toThrow();
  });
  it('counts quarter turns with half turns as two', () => expect(qtm(parseMoves("R U2 F'"))).toBe(4));
  it('simplifies', () => expect(formatMoves(simplify(parseMoves("R R U U' F")))).toBe('R2 F'));
});
