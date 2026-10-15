/**
 * Exploded view: the maths, kept free of three.js so it can be tested.
 *
 * Every piece slides outward along its home position vector (from the cube's
 * centre), so corners travel furthest and centres least, like a CAD exploded
 * drawing. Each piece starts after a small delay that sweeps around the cube,
 * and follows an ease-in-out curve. The controller can reverse at any moment
 * from wherever it is, so toggling never jumps.
 *
 * Turns are only allowed when the cube is fully assembled and still: the
 * scene's turn animation assumes every piece sits at its home transform.
 */
import type { Vec3 } from '../cube/facelets';

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** How far pieces move, as a fraction of their home distance from the centre. */
export const SPREAD = 0.6;
export const DURATION_MS = 900;
export const STAGGER_MS = 160;

/** Offset (in grid units) of a piece whose home centre is `home`, at explode amount `a` (0..1). */
export function explodeOffset(home: Vec3, a: number, spread = SPREAD): Vec3 {
  return [home[0] * spread * a, home[1] * spread * a, home[2] * spread * a];
}

/**
 * Start delay for a piece: a sweep around the vertical axis, top layer first,
 * so the motion reads as one deliberate wave rather than a burst.
 */
export function staggerDelay(home: Vec3, maxDelay = STAGGER_MS): number {
  const angle = (Math.atan2(home[2], home[0]) + Math.PI) / (2 * Math.PI); // 0..1
  const height = home[1] > 0 ? 0 : home[1] < 0 ? 0.5 : 0.25; // top, middle, bottom
  return maxDelay * clamp01(0.6 * angle + 0.4 * height * 2);
}

export class ExplodeController {
  private from = 0;
  private to = 0;
  private t0 = 0;
  private duration: number;

  constructor(private now: () => number = () => performance.now(), duration = DURATION_MS, private stagger = STAGGER_MS) {
    this.duration = duration;
  }

  /** Where the cube is headed: true = exploded. */
  get target() { return this.to === 1; }

  /** Start exploding (true) or assembling (false). `instant` skips the animation (reduced motion). */
  set(exploded: boolean, instant = false) {
    const goal = exploded ? 1 : 0;
    if (goal === this.to && !instant) return;
    // Reverse smoothly from the current overall position.
    this.from = instant ? goal : this.overall();
    this.to = goal;
    this.t0 = this.now();
  }

  toggle(instant = false) { this.set(!this.target, instant); }

  /** Eased amount (0..1) for a piece with the given start delay. */
  amount(delay = 0): number {
    if (this.from === this.to) return this.to;
    const span = Math.abs(this.to - this.from);
    const raw = clamp01((this.now() - this.t0 - delay) / (this.duration * Math.max(span, 0.15)));
    return this.from + (this.to - this.from) * easeInOutCubic(raw);
  }

  /** Amount ignoring stagger, used to reverse mid-flight. */
  private overall() { return this.amount(this.stagger / 2); }

  /** Still moving? (The renderer keeps updating piece positions while true.) */
  get animating(): boolean {
    if (this.from === this.to) return false;
    const span = Math.abs(this.to - this.from);
    return this.now() - this.t0 < this.duration * Math.max(span, 0.15) + this.stagger;
  }

  /** True when every piece is home and nothing is moving: the only time a layer may turn. */
  get assembled(): boolean { return this.to === 0 && !this.animating; }
}
