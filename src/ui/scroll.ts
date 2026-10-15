/**
 * Scroll a list box (not the page) so `child` is visible, with a little
 * margin. Only the box's own scrollTop changes, so the layout never jumps.
 */
export function keepInView(box: HTMLElement, child: Element | null | undefined, margin = 8): void {
  if (!child || box.scrollHeight <= box.clientHeight) return;
  const b = box.getBoundingClientRect();
  const c = child.getBoundingClientRect();
  if (c.top < b.top + margin) box.scrollTop -= b.top + margin - c.top;
  else if (c.bottom > b.bottom - margin) box.scrollTop += c.bottom - (b.bottom - margin);
}
