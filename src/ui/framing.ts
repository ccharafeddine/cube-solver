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

/**
 * Closest the camera may come to the orbit target (world units, the cube is
 * CUBE_SIZE across). Small enough to fly inside the cube and look at the
 * core, axles, screws and springs. Faces are one-sided, so from inside a
 * piece its walls are culled and never block the view; the near plane is 0.01.
 */
export const MIN_DISTANCE = 0.08;
/** Farthest zoom-out, as a multiple of the default framing distance. */
export const MAX_ZOOM_OUT = 2.5;
