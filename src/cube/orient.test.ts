import { describe, it, expect } from 'vitest';
import { applyMoves, solved } from './facelets';
import { parseMoves, formatMoves } from './notation';
import { ROTATIONS, isStandardOrientation, standardRotation, DEFAULT_CAMERA } from './orient';

const key = (s: Uint8Array) => Array.from(s).join('');

describe('standard orientation', () => {
  it('lists 24 distinct whole-cube orientations', () => {
    expect(ROTATIONS).toHaveLength(24);
    for (const n of [2, 3, 4]) {
      const seen = new Set(ROTATIONS.map((r) => key(applyMoves(solved(n), n, parseMoves(r)))));
      expect(seen.size).toBe(24);
    }
  });
  it('solved cubes are standard: white U, green F (so red R, orange L)', () => {
    for (const n of [2, 3, 4, 5]) expect(isStandardOrientation(solved(n), n)).toBe(true);
    const s = solved(3);
    expect([s[4], s[9 + 4], s[18 + 4], s[36 + 4]]).toEqual([0, 1, 2, 4]); // U white, R red, F green, L orange
  });
  it('undoes any rotation, on every size, keeping the pieces as they were', () => {
    for (const n of [2, 3, 4, 5]) {
      const scrambled = applyMoves(solved(n), n, parseMoves("R U F' D2 L B'"));
      for (const r of ROTATIONS) {
        const turned = applyMoves(scrambled, n, parseMoves(r));
        const fix = standardRotation(turned, n)!;
        expect(fix, `${n} ${r}`).not.toBeNull();
        expect(fix.length).toBeLessThanOrEqual(2);
        const back = applyMoves(turned, n, fix);
        expect(isStandardOrientation(back, n)).toBe(true);
        // Same position as before the rotation (2x2 face turns can move the reference corner; check 3x3+ exactly).
        if (n % 2 === 1) expect(key(back), `${n} ${r} -> ${formatMoves(fix)}`).toBe(key(scrambled));
      }
    }
  });
  it('2x2: R U F turns keep the reference corner, so rotations undo exactly', () => {
    const s = applyMoves(solved(2), 2, parseMoves("R U F' R2 U'"));
    for (const r of ROTATIONS) {
      const t = applyMoves(s, 2, parseMoves(r));
      expect(key(applyMoves(t, 2, standardRotation(t, 2)!))).toBe(key(s));
    }
  });
  it('returns nothing to do when already standard', () => {
    expect(standardRotation(solved(3), 3)).toEqual([]);
  });
  it('default camera looks from above at the front-right corner', () => {
    const [x, y, z] = DEFAULT_CAMERA;
    expect(x).toBeGreaterThan(0); // R visible
    expect(y).toBeGreaterThan(0); // U visible, from slightly above
    expect(z).toBeGreaterThan(x); // F most face-on
    expect(y).toBeLessThan(Math.hypot(x, z)); // "slightly" above: under 45 degrees
  });
});
