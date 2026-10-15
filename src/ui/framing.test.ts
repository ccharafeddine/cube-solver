import { describe, it, expect } from 'vitest';
import { fitDistance, cubeRadius, along, MARGIN, geometryHalf, safeDistance } from './framing';
import { DEFAULT_CAMERA } from '../cube/orient';

/** Does a sphere at the origin fit, seen from distance d? Check every edge of the frustum. */
function fits(r: number, d: number, fov: number, aspect: number) {
  const halfV = (fov * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  return r / d <= Math.sin(halfV) + 1e-9 && r / d <= Math.sin(halfH) + 1e-9;
}

describe('framing', () => {
  const r = cubeRadius();
  it('fits the whole cube with margin at every aspect, from ultrawide to tall phones', () => {
    for (const aspect of [0.4, 0.46, 0.75, 1, 1.33, 1.78, 2.4, 3.5]) {
      const d = fitDistance(r, 35, aspect);
      expect(fits(r * MARGIN, d, 35, aspect), `aspect ${aspect}`).toBe(true);
      // ... and not absurdly far: the cube fills a good share of the narrow direction.
      expect(fits(r * MARGIN * 1.02, d, 35, aspect), `aspect ${aspect} too far`).toBe(false);
    }
  });
  it('portrait needs more distance than landscape; landscape is limited by height', () => {
    expect(fitDistance(r, 35, 0.5)).toBeGreaterThan(fitDistance(r, 35, 1));
    expect(fitDistance(r, 35, 2)).toBeCloseTo(fitDistance(r, 35, 3));
  });
  it('the default camera direction is placed at the fitted distance, centred on the origin', () => {
    const p = along(DEFAULT_CAMERA, 9);
    expect(Math.hypot(...p)).toBeCloseTo(9);
    expect(p[0] / p[2]).toBeCloseTo(DEFAULT_CAMERA[0] / DEFAULT_CAMERA[2]);
  });
  it('the radius covers the corners of the cube', () => {
    expect(r).toBeGreaterThan(Math.hypot(1.3, 1.3, 1.3));
  });
});

describe('closest zoom', () => {
  const R = cubeRadius();
  it('head-on reaches about 0.8R, still outside the face', () => {
    const d = safeDistance([0, 0, 1]);
    expect(d).toBeLessThanOrEqual(0.8 * R + 1e-9);
    expect(d).toBeGreaterThan(geometryHalf() + 0.01);
  });
  it('the default diagonal view comes clearly closer than the old 1.05R limit', () => {
    for (const n of [2, 3, 4, 7]) expect(safeDistance(DEFAULT_CAMERA as [number, number, number], n)).toBeLessThan(1.0 * R);
    expect(safeDistance([1, 1, 1])).toBeLessThan(1.05 * R);
  });
  it('never passes the real corner on any direction', () => {
    for (const dir of [[1, 1, 1], [-1, 1, -1], [1, 1, 0], [2, 1, 0.5]] as [number, number, number][]) {
      const len = Math.hypot(...dir);
      const support = (geometryHalf() * dir.reduce((a, v) => a + Math.abs(v), 0)) / len;
      expect(safeDistance(dir)).toBeGreaterThanOrEqual(support + 0.02 - 1e-9);
    }
  });
  it('scales out for the exploded view', () => {
    expect(safeDistance([1, 1, 1], 3, 0.02, 2)).toBeGreaterThan(safeDistance([1, 1, 1]) * 1.8);
  });
});
