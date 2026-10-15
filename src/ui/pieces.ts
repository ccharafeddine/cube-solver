/**
 * Piece and sticker geometry, modelled on real cubes (see PLAN.md §10):
 *
 * - A piece is a hollow shell: one wall per side, each with softly rounded
 *   edges, and no wall on the sides that face the core, so the exploded view
 *   shows the open interior like a real moulded piece.
 * - Every outer face has a raised plastic ridge round its edge; the sticker
 *   sits inside it, slightly below the ridge, with a small gap of black
 *   plastic all round and a little thickness of its own.
 * - 6x6 and 7x7 are pillowed like the V-Cube 6b/7: each face is a patch of a
 *   long-radius sphere that meets the flat cube at its corners. The curve is
 *   applied to the real geometry, not by lifting stickers.
 *
 * Coordinates are grid units: a piece is 2 wide, centred on its home.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Vec3 } from '../cube/facelets';

/** Half the piece size, wall thickness, ridge height and width, sticker half-size, thickness and corner radius. */
export const PIECE = { half: 0.98, wall: 0.16, ridge: 0.035, ridgeWidth: 0.09, sticker: 0.8, stickerDepth: 0.012, stickerRadius: 0.16 };

/** Directions +x, -x, +y, -y, +z, -z. */
export const DIRS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** Bulge at the middle of a face, in grid units, for pillowed cubes (0 = flat). */
export const PILLOW: Record<number, number> = { 6: 0.42, 7: 0.48 };

/**
 * Height of the pillowed face above the flat face at (u, v), the in-face grid
 * coordinates (-n..n). The face is a cap of a sphere of radius R through the
 * four face corners and `bulge` above the face centre:
 * R = (2n² + bulge²) / (2·bulge), height = √(R² − u² − v²) − (R − bulge).
 */
export function pillowHeight(u: number, v: number, n: number): number {
  const b = PILLOW[n] ?? 0;
  if (!b) return 0;
  const R = (2 * n * n + b * b) / (2 * b);
  return Math.sqrt(Math.max(0, R * R - u * u - v * v)) - (R - b);
}

function roundedRect(half: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-half + r, -half);
  s.lineTo(half - r, -half); s.quadraticCurveTo(half, -half, half, -half + r);
  s.lineTo(half, half - r); s.quadraticCurveTo(half, half, half - r, half);
  s.lineTo(-half + r, half); s.quadraticCurveTo(-half, half, -half, half - r);
  s.lineTo(-half, -half + r); s.quadraticCurveTo(-half, -half, -half + r, -half);
  return s;
}

/** Rotation taking +z to direction d. */
const toDir = (d: Vec3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...d));

const shellCache = new Map<string, THREE.BufferGeometry>();

/**
 * A piece shell: walls on the sides in `walls` (by DIRS index), a ridge on the
 * sides in `outer`. Cached by shape, so equal pieces share one geometry.
 */
export function pieceShell(walls: boolean[], outer: boolean[]): THREE.BufferGeometry {
  const key = walls.map(Number).join('') + outer.map(Number).join('');
  const hit = shellCache.get(key);
  if (hit) return hit;
  const { half: h, wall: t, ridge, ridgeWidth } = PIECE;
  const parts: THREE.BufferGeometry[] = [];
  DIRS.forEach((d, k) => {
    const q = toDir(d);
    if (walls[k]) {
      const slab = new RoundedBoxGeometry(2 * h, 2 * h, t, 2, 0.05);
      slab.translate(0, 0, h - t / 2);
      slab.applyQuaternion(q);
      parts.push(slab.toNonIndexed());
    }
    if (outer[k]) {
      const ring = roundedRect(h - 0.01, 0.2);
      ring.holes.push(roundedRect(h - 0.01 - ridgeWidth, 0.14));
      const rim = new THREE.ExtrudeGeometry(ring, { depth: ridge, bevelEnabled: false, curveSegments: 3 });
      rim.translate(0, 0, h);
      rim.applyQuaternion(q);
      parts.push(rim.toNonIndexed());
    }
  });
  // Normals and uvs only: the extrusions carry an extra group/attribute the slabs lack.
  const clean = parts.map((g) => { const c = new THREE.BufferGeometry(); c.setAttribute('position', g.getAttribute('position')); c.setAttribute('normal', g.getAttribute('normal')); return c; });
  const geo = mergeGeometries(clean)!;
  shellCache.set(key, geo);
  return geo;
}

let stickerGeo: THREE.BufferGeometry | null = null;
/** A sticker lying in z = 0..depth, facing +z: a rounded square with a little thickness. */
export function stickerShape(): THREE.BufferGeometry {
  if (!stickerGeo) {
    const s = new THREE.ExtrudeGeometry(roundedRect(PIECE.sticker, PIECE.stickerRadius), { depth: PIECE.stickerDepth, bevelEnabled: false, curveSegments: 4 });
    stickerGeo = s;
  }
  return stickerGeo;
}

/**
 * Bend geometry already placed in grid coordinates onto the pillowed faces of
 * an n cube: on every axis where the piece sits in an outer layer, points move
 * outward by the face height at their position, scaled from 0 at the piece's
 * inner side to 1 at its outer face, so neighbouring pieces stay flush.
 */
export function pillowGeometry(geo: THREE.BufferGeometry, home: Vec3, n: number): THREE.BufferGeometry {
  const m = n - 1;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const shift = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(home[a]) !== m) continue;
      const s = Math.sign(home[a]);
      const local = s * (p[a] - home[a]);
      const f = Math.min(1, Math.max(0, (local + PIECE.half) / (2 * PIECE.half)));
      const [u, v] = [0, 1, 2].filter((k) => k !== a).map((k) => p[k]);
      shift[a] = s * pillowHeight(u, v, n) * f;
    }
    pos.setXYZ(i, p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]);
  }
  // Normals are kept: the bend is gentle (a few degrees), and recomputing would facet the rounded edges.
  pos.needsUpdate = true;
  return geo;
}

/** Which walls a piece at `home` keeps: none on the sides facing the core. */
export function wallsFor(home: Vec3, n: number): { walls: boolean[]; outer: boolean[] } {
  const m = n - 1;
  const outer = DIRS.map((d) => d.some((v, a) => v !== 0 && home[a] === v * m));
  // Open toward the core along every axis where the piece is in an outer layer.
  const walls = DIRS.map((d) => !d.some((v, a) => v !== 0 && Math.abs(home[a]) === m && Math.sign(home[a]) === -v));
  return { walls, outer };
}
