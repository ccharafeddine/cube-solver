import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PIECE, PILLOW, pieceShell, pillowGeometry, pillowHeight, stickerShape, wallsFor } from './pieces';

describe('pillowed faces', () => {
  it('only the 6x6 and 7x7 are pillowed (like the V-Cube 6b and 7); 2x2 to 5x5 stay flat', () => {
    for (const n of [2, 3, 4, 5]) expect(pillowHeight(0, 0, n)).toBe(0);
    expect(pillowHeight(0, 0, 7)).toBeCloseTo(PILLOW[7]);
    expect(pillowHeight(0, 0, 6)).toBeCloseTo(PILLOW[6]);
  });
  it('is a true sphere cap: zero at the face corners, the same radius everywhere', () => {
    for (const n of [6, 7]) {
      expect(pillowHeight(n, n, n)).toBeCloseTo(0, 6);
      const b = PILLOW[n], R = (2 * n * n + b * b) / (2 * b);
      // Every surface point lies on the sphere centred R - b below the face centre.
      for (const [u, v] of [[0, 0], [2, 1], [n, 0], [3, 3]]) expect(Math.hypot(u, v, pillowHeight(u, v, n) + R - b)).toBeCloseTo(R, 6);
      // Curved all the way across: an edge midpoint is raised, less than the middle.
      expect(pillowHeight(n, 0, n)).toBeGreaterThan(0);
      expect(pillowHeight(n, 0, n)).toBeLessThan(pillowHeight(0, 0, n));
    }
  });
  it('bends a piece outward only on its outer side, so the layer below stays flush', () => {
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 6 + PIECE.half, 0, 0, 6 - PIECE.half, 0], 3));
    pillowGeometry(geo, [0, 6, 0], 7);
    const p = geo.getAttribute('position');
    expect(p.getY(0)).toBeCloseTo(6 + PIECE.half + PILLOW[7]);
    expect(p.getY(1)).toBeCloseTo(6 - PIECE.half);
  });
});

describe('piece shells', () => {
  it('are open toward the core and ridged on the outside', () => {
    const corner = wallsFor([2, 2, 2], 3);
    expect(corner.outer).toEqual([true, false, true, false, true, false]);
    expect(corner.walls).toEqual([true, false, true, false, true, false]);
    const centre4 = wallsFor([1, 3, -1], 4);
    expect(centre4.outer).toEqual([false, false, true, false, false, false]);
    expect(centre4.walls).toEqual([true, true, true, false, true, true]);
  });
  it('share one geometry per shape, and keep within the piece except the ridge', () => {
    const { walls, outer } = wallsFor([2, 2, 2], 3);
    const g = pieceShell(walls, outer);
    expect(pieceShell(walls, outer)).toBe(g);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.x).toBeCloseTo(PIECE.half + PIECE.ridge, 3);
    expect(g.boundingBox!.min.x).toBeGreaterThan(-PIECE.half - 1e-6);
  });
  it('stickers sit inside the ridge, below its top, with a gap of plastic around them', () => {
    const s = stickerShape();
    s.computeBoundingBox();
    expect(s.boundingBox!.max.x).toBeLessThan(PIECE.half - PIECE.ridgeWidth);
    // Sticker top (on the face at half + 0.004) is lower than the ridge top.
    expect(PIECE.half + 0.004 + PIECE.stickerDepth).toBeLessThan(PIECE.half + PIECE.ridge);
  });
});
