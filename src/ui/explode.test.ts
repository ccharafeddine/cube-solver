import { describe, it, expect } from 'vitest';
import { easeInOutCubic, easeOutExpo, explodeOffset, staggerDelay, ExplodeController, SPREAD, STAGGER_MS } from './explode';
import { applyMoves, model, solved } from '../cube/facelets';
import { parseMoves } from '../cube/notation';

describe('easing', () => {
  it('runs 0 -> 1, symmetric and monotonic', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1);
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) { const e = easeInOutCubic(t); expect(e).toBeGreaterThanOrEqual(prev); prev = e; }
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(1)).toBe(1);
  });
});

describe('explode geometry', () => {
  it('moves pieces outward along their home vector, corners furthest', () => {
    expect(explodeOffset([1, 1, 1], 0)).toEqual([0, 0, 0]);
    const corner = explodeOffset([2, 2, 2], 1), edge = explodeOffset([2, 2, 0], 1), centre = explodeOffset([0, 2, 0], 1);
    expect(corner).toEqual([2 * SPREAD, 2 * SPREAD, 2 * SPREAD]);
    const len = (v: number[]) => Math.hypot(...v);
    expect(len(corner)).toBeGreaterThan(len(edge));
    expect(len(edge)).toBeGreaterThan(len(centre));
    // Direction is exactly the home vector: the cross product is zero.
    const h: [number, number, number] = [-1, 1, -1];
    const o = explodeOffset(h, 0.7);
    expect(o[0] / h[0]).toBeCloseTo(o[1] / h[1]);
    expect(o[1] / h[1]).toBeCloseTo(o[2] / h[2]);
  });
  it('exploded pieces never overlap: gaps only grow', () => {
    // Neighbouring cubies 2 apart on a 3x3 end up at least 2 apart.
    const a: [number, number, number] = [2, 2, 2], b: [number, number, number] = [0, 2, 2];
    const pa = a.map((x, i) => x + explodeOffset(a, 1)[i]), pb = b.map((x, i) => x + explodeOffset(b, 1)[i]);
    expect(Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2])).toBeGreaterThan(2);
  });
  it('stagger delays stay within bounds for every 2x2 and 3x3 piece', () => {
    for (const n of [2, 3]) for (const s of model(n).stickers) {
      const d = staggerDelay(s.pos);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(STAGGER_MS);
    }
  });
});

describe('ExplodeController', () => {
  let t = 0;
  const clock = () => t;
  it('explodes, settles, and only allows turns when fully assembled', () => {
    t = 0;
    const c = new ExplodeController(clock, 1000, 100);
    expect(c.assembled).toBe(true);
    c.set(true);
    expect(c.assembled).toBe(false);
    t = 500;
    expect(c.amount(0)).toBeGreaterThan(0);
    expect(c.amount(0)).toBeLessThan(1);
    expect(c.amount(100)).toBeLessThan(c.amount(0)); // staggered pieces lag
    t = 1200;
    expect(c.animating).toBe(false);
    expect(c.amount(100)).toBe(1);
    expect(c.assembled).toBe(false); // exploded: no turns
    c.set(false);
    t = 1700;
    expect(c.assembled).toBe(false); // still reassembling: no turns
    t = 2400;
    expect(c.amount(100)).toBe(0);
    expect(c.assembled).toBe(true);
  });
  it('reverses mid-flight without jumping', () => {
    t = 0;
    const c = new ExplodeController(clock, 1000, 0);
    c.set(true);
    t = 400;
    const before = c.amount(0);
    c.set(false);
    expect(c.amount(0)).toBeCloseTo(before, 5);
    t = 400 + 1000;
    expect(c.amount(0)).toBe(0);
    expect(c.assembled).toBe(true);
  });
  it('is instant under reduced motion', () => {
    t = 0;
    const c = new ExplodeController(clock);
    c.set(true, true);
    expect(c.amount(0)).toBe(1);
    expect(c.animating).toBe(false);
    c.set(false, true);
    expect(c.assembled).toBe(true);
  });
  it('ignores repeated requests for the same target', () => {
    t = 0;
    const c = new ExplodeController(clock, 1000, 0);
    c.set(true);
    t = 500;
    const a = c.amount(0);
    c.set(true);
    expect(c.amount(0)).toBe(a);
  });
});

describe('state safety', () => {
  it('exploding is view-only: the sticker state is untouched', () => {
    const s = applyMoves(solved(3), 3, parseMoves("R U F' L2"));
    const copy = s.slice();
    for (const st of model(3).stickers) explodeOffset(st.pos, 1);
    expect(s).toEqual(copy);
  });
});
