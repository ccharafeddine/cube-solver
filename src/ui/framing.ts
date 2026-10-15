/**
 * Camera framing: how far back the camera sits so the whole cube is visible,
 * centred, with a comfortable margin, for any window shape.
 *
 * The view scales every cube to the same size (CUBE_SIZE world units), so the
 * framing does not depend on n; it depends on the field of view and aspect.
 */
export const CUBE_SIZE = 2.6;
/** Stickers sit just proud of the plastic. */
const STICKER_LIFT = 0.02;
/** Bounding-sphere radius of the rendered cube. */
export const cubeRadius = (size = CUBE_SIZE) => (size / 2 + STICKER_LIFT) * Math.sqrt(3);
/** Breathing room around the bounding sphere. */
export const MARGIN = 1.12;

/**
 * Distance from the centre at which a sphere of `radius` fits inside a
 * perspective camera with vertical FOV `fovDeg` and the given aspect, with
 * `margin` to spare. The narrower of the two directions decides.
 */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = MARGIN): number {
  const halfV = (fovDeg * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  return (radius * margin) / Math.sin(Math.min(halfV, halfH));
}

/** Point at `distance` from the origin along `dir` (normalised). */
export function along(dir: [number, number, number], distance: number): [number, number, number] {
  const len = Math.hypot(...dir);
  return [(dir[0] / len) * distance, (dir[1] / len) * distance, (dir[2] / len) * distance];
}

/** Closest zoom, as a fraction of the bounding-sphere radius: about halfway from the old limit to the face. */
export const MIN_ZOOM = 0.8;

/**
 * Half-size of the actual cube geometry for an n cube: the outer cubie faces
 * sit at grid (n - 1) + 0.98 and stickers at + 0.99, scaled to CUBE_SIZE.
 */
export const geometryHalf = (n = 3) => ((n - 1 + 0.99) / n) * (CUBE_SIZE / 2);

/**
 * Closest the camera may come along view direction `dir`: just outside the
 * cube's real surface in that direction (its support distance,
 * half * (|x| + |y| + |z|) for a unit direction: the face plane head-on, the
 * corner on a diagonal), and never nearer than MIN_ZOOM of the bounding
 * radius. `clearance` covers the near plane (0.01). `scale` grows the box
 * for the exploded view.
 */
export function safeDistance(dir: [number, number, number], n = 3, clearance = 0.02, scale = 1): number {
  const len = Math.hypot(...dir) || 1;
  const support = (geometryHalf(n) * scale * (Math.abs(dir[0]) + Math.abs(dir[1]) + Math.abs(dir[2]))) / len;
  return Math.max(MIN_ZOOM * cubeRadius() * scale, support + clearance);
}
