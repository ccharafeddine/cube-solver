import { describe, it, expect } from 'vitest';
import { holeRect, dimRects, placeCard, isLarge, activeSteps, counterText, stepBody, SPOT_PAD } from './spotlight';
import { TOUR } from './lessons';

const VW = 1360, VH = 860;
const card = { width: 360, height: 180 };
const inside = (p: { left: number; top: number }) =>
  p.left >= 0 && p.top >= 0 && p.left + card.width <= VW && p.top + card.height <= VH;
const overlaps = (a: { left: number; top: number; width: number; height: number }, p: { left: number; top: number }) =>
  p.left < a.left + a.width && p.left + card.width > a.left && p.top < a.top + a.height && p.top + card.height > a.top;

describe('spotlight geometry', () => {
  it('pads the hole by 8px and clips it to the viewport', () => {
    expect(SPOT_PAD).toBe(8);
    expect(holeRect({ left: 100, top: 50, width: 200, height: 40 }, VW, VH)).toEqual({ left: 92, top: 42, width: 216, height: 56 });
    expect(holeRect({ left: -20, top: 840, width: 100, height: 100 }, VW, VH)).toEqual({ left: 0, top: 832, width: 88, height: 28 });
  });
  it('four dim rects tile the viewport exactly around the hole', () => {
    const h = { left: 300, top: 200, width: 400, height: 150 };
    const rs = dimRects(h, VW, VH);
    expect(rs).toHaveLength(4);
    const area = rs.reduce((a, r) => a + r.width * r.height, 0);
    expect(area + h.width * h.height).toBe(VW * VH);
    for (const r of rs) expect(overlaps(h, { left: r.left, top: r.top }) && r.width > 0 && r.height > 0 && r.left >= h.left && r.top >= h.top && r.left < h.left + h.width && r.top < h.top + h.height).toBe(false);
  });
  it('parks the card beside a large target', () => {
    const cube = { left: 20, top: 60, width: 640, height: 440 };
    expect(isLarge(cube, VW, VH)).toBe(true);
    const p = placeCard(cube, card, VW, VH);
    expect(p.side).toBe('right');
    expect(inside(p)).toBe(true);
    expect(overlaps(cube, p)).toBe(false);
    // No room on the right: goes left.
    const right = { left: 700, top: 60, width: 640, height: 440 };
    expect(placeCard(right, card, VW, VH).side).toBe('left');
  });
  it('puts the card below a small target, or above when near the bottom, always on screen', () => {
    const btn = { left: 1300, top: 100, width: 50, height: 30 };
    const p = placeCard(btn, card, VW, VH);
    expect(p.side).toBe('below');
    expect(inside(p)).toBe(true);
    const low = { left: 40, top: 760, width: 300, height: 40 };
    const q = placeCard(low, card, VW, VH);
    expect(q.side).toBe('above');
    expect(inside(q)).toBe(true);
    expect(overlaps(low, q)).toBe(false);
  });
  it('stays on screen when nothing fits', () => {
    const p = placeCard({ left: 0, top: 0, width: VW, height: VH }, card, VW, VH);
    expect(inside(p)).toBe(true);
  });
});

describe('tour helpers', () => {
  it('drops steps whose target is not visible', () => {
    const s = activeSteps(TOUR, (t) => t.id !== 'method');
    expect(s).toHaveLength(9);
    expect(s.map((t) => t.id)).not.toContain('method');
  });
  it('counts "N of total" and picks touch wording', () => {
    expect(counterText(0, 10)).toBe('1 of 10');
    expect(counterText(9, 10)).toBe('10 of 10');
    const turn = TOUR.find((t) => t.id === 'turn')!;
    expect(stepBody(turn, true)).toBe(turn.touchBody);
    expect(stepBody(turn, false)).toBe(turn.body);
    const method = TOUR.find((t) => t.id === 'method')!; // no touch variant: falls back
    expect(stepBody(method, true)).toBe(method.body);
  });
});
