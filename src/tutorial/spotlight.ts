/**
 * Spotlight tour: one highlighted hole over the current target, a heavy dim
 * everywhere else, and a step card parked next to it.
 *
 * The dim is drawn by the spotlight's own box-shadow (pointer-events: none).
 * Four transparent rectangles around the hole catch clicks on the dimmed area
 * (to close the tour), so clicks inside the hole reach the real element and a
 * step can ask the user to try the action itself.
 *
 * Geometry is pure (exported for tests); the class does the DOM.
 */
import type { TourStep } from './lessons';

export interface Rect { left: number; top: number; width: number; height: number }
export const SPOT_PAD = 8;
const GAP = 14;
const MARGIN = 10;

/** The hole: the target's rect grown by `pad`, clipped to the viewport. */
export function holeRect(r: Rect, vw: number, vh: number, pad = SPOT_PAD): Rect {
  const left = Math.max(0, r.left - pad), top = Math.max(0, r.top - pad);
  const right = Math.min(vw, r.left + r.width + pad), bottom = Math.min(vh, r.top + r.height + pad);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Four rects covering the viewport outside the hole: top, bottom, left, right. */
export function dimRects(h: Rect, vw: number, vh: number): Rect[] {
  const bottom = h.top + h.height, right = h.left + h.width;
  return [
    { left: 0, top: 0, width: vw, height: h.top },
    { left: 0, top: bottom, width: vw, height: Math.max(0, vh - bottom) },
    { left: 0, top: h.top, width: h.left, height: h.height },
    { left: right, top: h.top, width: Math.max(0, vw - right), height: h.height },
  ];
}

export type Side = 'right' | 'left' | 'below' | 'above' | 'over';

/** A target is "large" when parking the card under it would push the card off screen or hide much of it. */
export const isLarge = (h: Rect, vw: number, vh: number) => h.width > vw * 0.4 && h.height > vh * 0.35;

/**
 * Where the card goes. Large targets (the 3D cube) get the card beside them,
 * small ones below (or above when there is no room). The result is always
 * clamped on screen.
 */
export function placeCard(h: Rect, card: { width: number; height: number }, vw: number, vh: number): { left: number; top: number; side: Side } {
  const clampX = (x: number) => Math.min(Math.max(MARGIN, x), Math.max(MARGIN, vw - card.width - MARGIN));
  const clampY = (y: number) => Math.min(Math.max(MARGIN, y), Math.max(MARGIN, vh - card.height - MARGIN));
  const right = h.left + h.width, bottom = h.top + h.height;
  const fitsRight = right + GAP + card.width + MARGIN <= vw;
  const fitsLeft = h.left - GAP - card.width >= MARGIN;
  const fitsBelow = bottom + GAP + card.height + MARGIN <= vh;
  const fitsAbove = h.top - GAP - card.height >= MARGIN;
  const beside = (side: 'right' | 'left') => ({
    left: side === 'right' ? right + GAP : h.left - GAP - card.width,
    top: clampY(h.top + h.height / 2 - card.height / 2), side,
  });
  if (isLarge(h, vw, vh)) {
    if (fitsRight) return beside('right');
    if (fitsLeft) return beside('left');
  }
  if (fitsBelow) return { left: clampX(h.left), top: bottom + GAP, side: 'below' };
  if (fitsAbove) return { left: clampX(h.left), top: h.top - GAP - card.height, side: 'above' };
  if (fitsRight) return beside('right');
  if (fitsLeft) return beside('left');
  // No room anywhere: sit inside the bottom of the viewport.
  return { left: clampX(h.left), top: clampY(vh - card.height - MARGIN), side: 'over' };
}

/** Keep the steps whose target is on screen; `visible` is asked after the step's tab is opened. */
export function activeSteps(steps: TourStep[], visible: (s: TourStep) => boolean): TourStep[] {
  return steps.filter(visible);
}

export const counterText = (i: number, total: number) => `${i + 1} of ${total}`;
export const stepBody = (s: TourStep, touch: boolean) => (touch && s.touchBody) || s.body;

export interface TourHooks {
  selectTab(tab: 'turn' | 'paint' | 'io'): void;
  /** Called with the absolute step id whenever a step shows. */
  onStep(id: string): void;
  onClose(finished: boolean): void;
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = () => matchMedia('(pointer: coarse)').matches;
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export class SpotlightTour {
  private spot = document.createElement('div');
  private blockers: HTMLElement[] = [];
  private card = document.createElement('section');
  private steps: TourStep[] = [];
  private i = 0;
  private open = false;
  private returnFocus: HTMLElement | null = null;
  private raf = 0;

  constructor(private all: TourStep[], private hooks: TourHooks) {
    this.spot.className = 'spot hidden';
    this.spot.setAttribute('aria-hidden', 'true');
    for (let k = 0; k < 4; k++) {
      const b = document.createElement('div');
      b.className = 'spot-blocker hidden';
      b.setAttribute('aria-hidden', 'true');
      b.addEventListener('click', () => this.close(false));
      this.blockers.push(b);
    }
    this.card.id = 'tour-card';
    this.card.className = 'tour-card hidden';
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-labelledby', 'tour-title');
    this.card.setAttribute('aria-describedby', 'tour-body');
    document.body.append(this.spot, ...this.blockers, this.card);
    const later = () => { if (this.open) { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.place()); } };
    window.addEventListener('resize', later);
    window.addEventListener('scroll', later, true);
    // Capture phase, so the app's own shortcuts never see tour keys.
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get isOpen() { return this.open; }

  /** Start at the step with absolute index `from` in the full list (or the next visible one). */
  start(from = 0) {
    this.returnFocus = document.activeElement as HTMLElement | null;
    // Work out which steps can show here (e.g. 3x3-only cards on a 2x2, phones).
    this.steps = activeSteps(this.all, (s) => {
      if (s.tab) this.hooks.selectTab(s.tab);
      const t = document.querySelector<HTMLElement>(s.target);
      return !!t && t.offsetParent !== null && t.getClientRects().length > 0;
    });
    if (!this.steps.length) return this.close(false);
    const want = this.all[from]?.id;
    const k = this.steps.findIndex((s) => this.all.indexOf(s) >= this.all.findIndex((a) => a.id === want));
    this.open = true;
    this.card.classList.remove('hidden');
    this.spot.classList.remove('hidden');
    this.blockers.forEach((b) => b.classList.remove('hidden'));
    // First placement jumps; later ones glide.
    this.spot.classList.add('instant');
    this.card.classList.add('instant');
    this.show(Math.max(0, k));
    requestAnimationFrame(() => { this.spot.classList.remove('instant'); this.card.classList.remove('instant'); });
  }

  next() { if (this.i + 1 < this.steps.length) this.show(this.i + 1); else this.close(true); }
  back() { if (this.i > 0) this.show(this.i - 1); }

  private show(i: number) {
    this.i = i;
    const s = this.steps[i];
    if (s.tab) this.hooks.selectTab(s.tab);
    this.hooks.onStep(s.id);
    const last = i + 1 === this.steps.length;
    const mk = (cls: string, text: string, fn: () => void, disabled = false) => {
      const b = document.createElement('button');
      b.className = cls; b.textContent = text; b.disabled = disabled; b.onclick = fn;
      return b;
    };
    const counter = document.createElement('div');
    counter.className = 'muted tour-count';
    counter.textContent = counterText(i, this.steps.length);
    counter.setAttribute('aria-label', `Step ${i + 1} of ${this.steps.length}`);
    const h = document.createElement('h2');
    h.id = 'tour-title'; h.tabIndex = -1; h.textContent = s.title;
    const p = document.createElement('p');
    p.id = 'tour-body'; p.textContent = stepBody(s, isTouch());
    const row = document.createElement('div');
    row.className = 'row';
    const grow = document.createElement('span');
    grow.className = 'grow';
    const nextBtn = mk('primary', last ? 'Done' : 'Next', () => this.next());
    row.append(mk('link', 'Skip', () => this.close(false)), grow, mk('', 'Back', () => this.back(), i === 0), nextBtn);
    this.card.replaceChildren(counter, h, p, row);
    const target = document.querySelector<HTMLElement>(s.target);
    target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    this.place();
    nextBtn.focus({ preventScroll: true });
  }

  /** Size the hole, the click blockers and the card to the current target. */
  place() {
    if (!this.open) return;
    const t = document.querySelector<HTMLElement>(this.steps[this.i].target);
    if (!t) return;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const r = t.getBoundingClientRect();
    const hole = holeRect({ left: r.left, top: r.top, width: r.width, height: r.height }, vw, vh);
    const px = (x: Rect) => ({ left: `${x.left}px`, top: `${x.top}px`, width: `${x.width}px`, height: `${x.height}px` });
    Object.assign(this.spot.style, px(hole));
    dimRects(hole, vw, vh).forEach((d, k) => Object.assign(this.blockers[k].style, px(d)));
    // Phones: the card docks to the bottom in CSS.
    if (vw < 700) { this.card.style.left = this.card.style.top = ''; this.card.dataset.side = 'dock'; return; }
    const c = this.card.getBoundingClientRect();
    const at = placeCard(hole, { width: c.width, height: c.height }, vw, vh);
    this.card.style.left = `${at.left}px`;
    this.card.style.top = `${at.top}px`;
    this.card.dataset.side = at.side;
  }

  private onKey(e: KeyboardEvent) {
    if (!this.open) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(false); }
    else if (e.key === 'ArrowRight' && !typing) { e.preventDefault(); e.stopPropagation(); this.next(); }
    else if (e.key === 'ArrowLeft' && !typing) { e.preventDefault(); e.stopPropagation(); this.back(); }
    else if (e.key === 'Tab') {
      // Focus trap: keep Tab inside the card.
      const f = Array.from(this.card.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!f.length) return;
      const first = f[0], lastEl = f[f.length - 1];
      const inside = this.card.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && (document.activeElement === lastEl || !inside)) { e.preventDefault(); first.focus(); }
    }
  }

  close(finished: boolean) {
    const was = this.open;
    this.open = false;
    this.spot.classList.add('hidden');
    this.blockers.forEach((b) => b.classList.add('hidden'));
    this.card.classList.add('hidden');
    if (!was) return;
    this.hooks.onClose(finished);
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    this.returnFocus = null;
  }
}
