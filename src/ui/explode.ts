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
/** The 2x2 explodes further: few pieces, and the mechanism inside is worth seeing. */
export const spreadFor = (n: number) => (n === 2 ? 1.6 : 0.9);

/**
 * How much bigger the exploded cube is than the assembled one (outer extent
 * along an axis). The camera zooms out by this factor so everything stays in frame.
 */
export function explodeExtent(n: number, spread = spreadFor(n)): number {
  const m = n - 1; // outermost cubie centre (grid units); cubies are 2 wide
  return (m * (1 + spread) + 1) / (m + 1);
}

/**
 * The 2x2 mechanism, in grid units (the assembled cube spans -2..2). Modelled
 * on a real 2x2: six thin axle spindles meeting at the centre (no solid core), a hidden centre cap riding on
 * each arm, held by a screw with a spring, and an inner foot on every corner
 * that tucks under the caps around the centre.
 */
export const MECH = {
  armLength: 1.25,
  armRadius: 0.07,
  /** Distance of each cap's centre from the centre, and its size. */
  capDistance: 1.05,
  capRadius: 0.78,
  capThickness: 0.24,
  springInner: 0.35,
  springOuter: 0.95,
  /** Caps separate a little further than the centre on explode, but much less than corners. */
  capSpread: 0.75,
  /** Corner foot: a stem from the piece's inner corner toward the centre, ending in a pad. */
  footStem: 0.95,
  footPad: 0.62,
};

export const AXES: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** Centre-cap position along axis `dir` at explode amount `a`. */
export function capPosition(dir: Vec3, a: number): Vec3 {
  const d = MECH.capDistance + MECH.capSpread * a;
  return [dir[0] * d, dir[1] * d, dir[2] * d];
}

/**
 * Where a corner's foot pad sits relative to the corner's own centre
 * (`home` is the corner centre, e.g. [1, 1, 1]): pointing at the centre, past
 * the piece's inner corner.
 */
export function footOffset(home: Vec3): Vec3 {
  const len = Math.hypot(...home);
  const k = (Math.hypot(1, 1, 1) + MECH.footStem * 0.5) / len;
  return [-home[0] * k, -home[1] * k, -home[2] * k];
}
/**
 * The 3x3 mechanism, in grid units (the assembled cube spans -3..3). Modelled on
 * a real 3x3: a fixed core with six axle arms; each centre is a hollow shell
 * open toward the core, with a flat outer face (the covered cap recess is
 * folded into it) and an inner tube the arm enters. The screw goes from under
 * the face through the tube into the arm with the spring in the tube under its
 * head; nothing stands proud of the face. The screw and spring belong to the
 * centre assembly: exploding slides the whole centre off its arm as one unit,
 * and they show only through the open inner side. Edges and corners have no holes: they are held only by
 * their inner feet, edge feet in the track under the centres, corner feet under
 * the edges.
 */
export const MECH3 = {
  coreRadius: 0.72,
  armLength: 1.5,
  armRadius: 0.2,
  /** The centre shell: outer plate thickness, wall thickness, and the inner tube the arm enters. */
  plate: 0.16,
  wall: 0.1,
  tubeRadius: 0.3,
  tubeLength: 1.3,
  /** Screw head distance from the core at rest, seated in the tube just under the plate. */
  screwHead: 2.72,
  /** Long enough to reach the arm tip at rest, short enough to stay inside the tube. */
  screwLength: 1.2,
  screwHeadHeight: 0.09,
  /** The spring sits in the tube under the screw head. */
  springLength: 0.55,
  /** Distance of foot pads from the core: edge feet in the centres' track, corner feet under the edges. */
  edgePad: 1.0,
  cornerPad: 1.3,
};

/** Distance of a 3x3 centre piece's middle from the core at explode amount `a`. */
export const centreDistance3 = (a: number) => 2 + 2 * spreadFor(3) * a;
/** Outer face of a centre plate, a hair under its sticker (at +0.99) so the recess never shows through. */
export const centreFace3 = (a: number) => centreDistance3(a) + 0.97;
/** Screw head: part of the centre assembly, so it travels rigidly with the centre. */
export const screwHeadDistance3 = (a: number) => centreDistance3(a) + MECH3.screwHead - 2;

/**
 * Radial extent [inner, outer] of the screw, spring and shell of the centre at
 * explode amount `a`. Everything stays inside the shell at every moment.
 */
export function centreParts3(a: number) {
  const head = screwHeadDistance3(a), c = centreDistance3(a);
  return {
    shell: [c - 0.98, centreFace3(a)] as const,
    tube: [centreFace3(a) - MECH3.plate - MECH3.tubeLength, centreFace3(a) - MECH3.plate] as const,
    screw: [head - MECH3.screwLength, head + MECH3.screwHeadHeight / 2] as const,
    spring: [head - 0.06 - MECH3.springLength, head - 0.06] as const,
  };
}

/**
 * A 3x3 edge or corner foot, relative to the core: `inner` is the piece's
 * inner corner (where the stem starts) and `pad` is where the pad sits, along
 * the line from the piece's home toward the core.
 */
export function foot3(home: Vec3): { inner: Vec3; pad: Vec3 } {
  const nonzero = home.filter((v) => v !== 0).length;
  const len = Math.hypot(...home);
  const r = nonzero === 3 ? MECH3.cornerPad : MECH3.edgePad;
  return { inner: home.map((v) => v - Math.sign(v)) as Vec3, pad: home.map((v) => (v / len) * r) as Vec3 };
}

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

/**
 * Start delay of the 3x3 centre on axis `dir`. Anything placed relative to the
 * centre must use the same delay, or it runs ahead of the centre and pokes out
 * of the face at the start of the animation.
 */
export const centreDelay3 = (dir: Vec3) => staggerDelay([dir[0] * 2, dir[1] * 2, dir[2] * 2]);

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
