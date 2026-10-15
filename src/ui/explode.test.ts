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

import { spreadFor, explodeExtent, MECH, AXES, capPosition, footOffset, MECH3, foot3, centreDistance3, centreParts3, centreDelay3, ExplodeController as Ctl, DURATION_MS as DUR, STAGGER_MS as STG } from './explode';
type Vec3 = [number, number, number];

describe('2x2 explodes further, and the camera knows how far', () => {
  it('spreads the 2x2 more than the 3x3', () => {
    expect(spreadFor(2)).toBeGreaterThan(spreadFor(3));
    expect(spreadFor(2)).toBeGreaterThanOrEqual(1.5);
  });
  it('extent is 1 when assembled and matches the outermost exploded piece', () => {
    expect(explodeExtent(2, 0)).toBe(1);
    // 2x2 corner centre at 1 moves to 1 + 1.6, plus half a cubie: 3.6 of an assembled 2.
    expect(explodeExtent(2, 1.6)).toBeCloseTo(3.6 / 2);
    expect(explodeExtent(3)).toBeGreaterThan(1);
  });
});

describe('2x2 mechanism layout', () => {
  it('hides inside the assembled cube', () => {
    for (const d of AXES) {
      const p = capPosition(d, 0);
      // The cap's outer face stays inside the cube (which spans -2..2).
      expect(Math.max(...p.map(Math.abs)) + MECH.capThickness / 2).toBeLessThan(2);
    }
    expect(MECH.armLength).toBeLessThan(2);
    expect(MECH.armRadius).toBeLessThan(0.1); // thin spindles, no hub
  });
  it('caps separate along their axis on explode, less than the corners do', () => {
    for (const d of AXES) {
      const a0 = capPosition(d, 0), a1 = capPosition(d, 1);
      const moved = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]);
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThan(spreadFor(2));
      // Still along the axis.
      expect(a1.filter((x) => x !== 0)).toHaveLength(1);
    }
  });
  it('every corner foot points at the core and reaches past the inner corner', () => {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const h: [number, number, number] = [x, y, z];
      const f = footOffset(h);
      const pad = h.map((v, i) => v + f[i]);
      // Opposite direction to the home vector...
      expect(f.every((v, i) => Math.sign(v) === -Math.sign(h[i]))).toBe(true);
      // ...and the pad ends up in the other octant, under the caps near the core.
      expect(pad.every((v, i) => Math.sign(v) === -Math.sign(h[i]) || Math.abs(v) < 0.5)).toBe(true);
    }
  });
});

describe('3x3 mechanism layout', () => {
  it('at rest the screw reaches the arm and the spring sits in the tube under the head', () => {
    const p = centreParts3(0);
    expect(p.screw[0]).toBeLessThanOrEqual(MECH3.armLength + 0.05);
    expect(p.spring[0]).toBeGreaterThanOrEqual(p.tube[0]);
    expect(p.screw[1]).toBeLessThanOrEqual(p.tube[1]);
    expect(MECH3.coreRadius).toBeLessThan(1);
  });
  it('on explode the whole centre assembly slides off its arm', () => {
    expect(centreDistance3(1) - centreDistance3(0)).toBeCloseTo(2 * spreadFor(3));
    expect(centreParts3(1).screw[0]).toBeGreaterThan(MECH3.armLength);
  });
  it('edge and corner feet point at the core, edges inside corners, outside the core', () => {
    for (const home of [[2, 2, 0], [0, -2, 2], [-2, 0, -2]] as Vec3[]) {
      const { inner, pad } = foot3(home);
      const r = Math.hypot(...pad);
      expect(r).toBeCloseTo(MECH3.edgePad);
      expect(r).toBeGreaterThan(MECH3.coreRadius);
      expect(r).toBeLessThan(Math.hypot(...inner));
      expect(pad.every((v, i) => Math.sign(v) === Math.sign(home[i]))).toBe(true);
    }
    for (const home of [[2, 2, 2], [-2, 2, -2]] as Vec3[]) {
      const { inner, pad } = foot3(home);
      expect(Math.hypot(...pad)).toBeCloseTo(MECH3.cornerPad);
      expect(Math.hypot(...pad)).toBeLessThan(Math.hypot(...inner));
    }
    expect(MECH3.cornerPad).toBeGreaterThan(MECH3.edgePad);
  });
});

describe('3x3 explode timeline', () => {
  const sample = (fn: (amountFor: (dir: Vec3) => number) => void) => {
    let t = 0;
    const c = new Ctl(() => t);
    const run = (until: number) => { const t0 = t; for (; t <= t0 + until; t += 10) fn((dir) => c.amount(centreDelay3(dir))); };
    c.set(true); run(DUR + STG + 60);
    c.set(false); run(300); // reverse mid-flight
    c.set(true); run(DUR + STG + 60);
    c.set(false); run(DUR + STG + 60);
  };
  it('every frame keeps screw and spring inside the tube and shell, never past the face', () => {
    sample((amountFor) => {
      for (const dir of AXES) {
        const p = centreParts3(amountFor(dir));
        for (const part of [p.screw, p.spring]) {
          expect(part[0]).toBeGreaterThanOrEqual(p.shell[0] - 1e-9);
          expect(part[1]).toBeLessThanOrEqual(p.shell[1] - MECH3.plate + 1e-9);
          expect(part[0]).toBeGreaterThanOrEqual(p.tube[0] - 1e-9);
        }
      }
    });
  });
  it('centre parts share the centre piece stagger', () => {
    for (const dir of AXES) expect(centreDelay3(dir)).toBe(staggerDelay([dir[0] * 2, dir[1] * 2, dir[2] * 2]));
  });
  it('the assembly is rigid: screw and face keep a constant offset from the centre at every frame', () => {
    const rest = centreParts3(0);
    sample((amountFor) => {
      for (const dir of AXES) {
        const a = amountFor(dir), d = centreDistance3(a) - centreDistance3(0), p = centreParts3(a);
        expect(p.screw[1] - rest.screw[1]).toBeCloseTo(d, 9);
        expect(p.shell[1] - rest.shell[1]).toBeCloseTo(d, 9);
      }
    });
  });
});
