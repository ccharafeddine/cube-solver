import { describe, expect, it } from 'vitest';
import { keepInView } from './scroll';

const rect = (top: number, h: number) => ({ top, bottom: top + h }) as DOMRect;
function box(scrollTop: number) {
  return { scrollTop, scrollHeight: 1000, clientHeight: 100, getBoundingClientRect: () => rect(0, 100) } as unknown as HTMLElement;
}
const at = (top: number) => ({ getBoundingClientRect: () => rect(top, 20) }) as Element;

describe('keepInView', () => {
  it('scrolls down just enough to show a move below the box', () => {
    const b = box(50);
    keepInView(b, at(150));
    expect(b.scrollTop).toBe(50 + 170 - 92);
  });
  it('scrolls up to a move above the box and leaves visible moves alone', () => {
    const b = box(300);
    keepInView(b, at(-40));
    expect(b.scrollTop).toBe(300 - 48);
    keepInView(b, at(40));
    expect(b.scrollTop).toBe(252);
  });
  it('does nothing when the list fits', () => {
    const b = { scrollTop: 0, scrollHeight: 80, clientHeight: 100 } as unknown as HTMLElement;
    keepInView(b, at(500));
    expect(b.scrollTop).toBe(0);
  });
});
