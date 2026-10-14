import { describe, it, expect } from 'vitest';
import { distances, solve2, distance2, parse2 } from './solver2';
import { applyMoves, isSolved, solved } from '../cube/facelets';
import { parseMoves } from '../cube/notation';

describe('2x2 optimal solver', () => {
  it('covers all 3,674,160 states with God\'s number 14 (QTM)', () => {
    const d = distances();
    let max = 0, unreached = 0;
    for (const x of d) {
      if (x === 255) unreached++;
      else if (x > max) max = x;
    }
    expect(unreached).toBe(0);
    expect(max).toBe(14);
  });

  it('solves random scrambles optimally and the solution really solves', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const names = ['U', "U'", 'R', "R'", 'F', "F'", 'D', "D'", 'L', "L'", 'B', "B'"];
    for (let t = 0; t < 200; t++) {
      const seq = Array.from({ length: 20 }, () => names[Math.floor(rnd() * 12)]).join(' ');
      const s = applyMoves(solved(2), 2, parseMoves(seq));
      const r = solve2(s);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.moves.length).toBe(distance2(s));
      expect(isSolved(applyMoves(s, 2, parseMoves(r.moves.join(' '))), 2)).toBe(true);
    }
  });

  it('solves a cube held in any orientation', () => {
    const s = applyMoves(solved(2), 2, parseMoves("x y2 R U' F"));
    expect(distance2(s)).toBe(3);
  });

  it('rejects a twisted corner', () => {
    const s = solved(2);
    // twist the UFR corner: U9 R1 F3 -> rotate colours
    const [a, b, c] = [3, 4, 9];
    [s[a], s[b], s[c]] = [s[b], s[c], s[a]];
    expect(parse2(s).ok).toBe(false);
  });
});
