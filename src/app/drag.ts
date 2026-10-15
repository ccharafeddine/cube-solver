/**
 * Drag-to-turn: which layer turn does a drag on a sticker mean?
 *
 * The sticker can turn about the two axes lying in its face. A drag slides
 * along the face, so only the in-face part of the motion counts: a turn
 * about axis a moves the sticker along a × normal (a × p also has a part
 * along the normal, which on stickers near an edge swamps the in-face part
 * on screen and picked the wrong layer and direction on big cubes). Both
 * candidate motions are projected to the screen from the sticker's real
 * spot on the surface, the one best aligned with the drag wins, and the sign
 * of the alignment picks the direction.
 */
import type { Turn, Vec3 } from '../cube/facelets';

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * @param pos sticker centre in grid coordinates, normal its outward normal
 * @param drag screen-space drag vector (pixels, y down)
 * @param project maps a grid-space point to screen pixels
 */
export function dragToTurn(
  pos: Vec3, normal: Vec3, drag: [number, number], project: (p: Vec3) => [number, number],
): Turn | null {
  const len = Math.hypot(drag[0], drag[1]);
  if (len < 1) return null;
  const n = normal.findIndex((x) => x !== 0);
  let best: { axis: 0 | 1 | 2; score: number } | null = null;
  // pos is the cubie centre; the sticker itself sits one unit out along the normal.
  const surf: Vec3 = [pos[0] + normal[0], pos[1] + normal[1], pos[2] + normal[2]];
  const p0 = project(surf);
  for (const axis of [0, 1, 2] as const) {
    if (axis === n) continue;
    const a: Vec3 = [0, 0, 0];
    a[axis] = 1;
    const t = cross(a, normal);
    const tip = project([surf[0] + t[0] * 0.3, surf[1] + t[1] * 0.3, surf[2] + t[2] * 0.3]);
    const sx = tip[0] - p0[0], sy = tip[1] - p0[1];
    const sl = Math.hypot(sx, sy);
    if (sl < 1e-9) continue;
    const score = (sx * drag[0] + sy * drag[1]) / (sl * len);
    if (!best || Math.abs(score) > Math.abs(best.score)) best = { axis, score };
  }
  if (!best || Math.abs(best.score) < 0.35) return null;
  // Moving along +a×normal (the in-face part of +a×p) is a positive (counter-clockwise from +axis) rotation: q = 3.
  return { axis: best.axis, layers: [pos[best.axis]], q: best.score > 0 ? 3 : 1 };
}
