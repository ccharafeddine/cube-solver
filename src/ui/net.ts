/**
 * Flat 2D net editor: the six faces unfolded in a cross (U on top; L F R B
 * across; D below). Each sticker is a button, so the editor is fully usable
 * from the keyboard and by screen readers.
 */
import type { State } from '../cube/facelets';
import { COLORS, COLOR_NAMES } from './scene';

// Grid placement of each face in a 4x3 layout (column, row).
const PLACE: [number, number][] = [[1, 0], [2, 1], [1, 1], [1, 2], [0, 1], [3, 1]];
const FACE_NAMES = ['Up', 'Right', 'Front', 'Down', 'Left', 'Back'];

export class NetEditor {
  private buttons: HTMLButtonElement[] = [];
  onSticker: (index: number) => void = () => {};

  constructor(private host: HTMLElement) {}

  build(n: number) {
    this.host.innerHTML = '';
    this.host.style.setProperty('--n', String(n));
    this.buttons = [];
    for (let f = 0; f < 6; f++) {
      const face = document.createElement('div');
      face.className = 'net-face';
      face.style.gridColumn = String(PLACE[f][0] + 1);
      face.style.gridRow = String(PLACE[f][1] + 1);
      face.setAttribute('role', 'group');
      face.setAttribute('aria-label', `${FACE_NAMES[f]} face`);
      for (let i = 0; i < n * n; i++) {
        const b = document.createElement('button');
        b.className = 'net-sticker';
        const idx = f * n * n + i;
        b.onclick = () => this.onSticker(idx);
        face.appendChild(b);
        this.buttons.push(b);
      }
      this.host.appendChild(face);
    }
  }

  setState(s: State, n: number) {
    this.buttons.forEach((b, i) => {
      const f = Math.floor(i / (n * n)), k = i % (n * n);
      b.style.background = COLORS[s[i]];
      b.setAttribute('aria-label', `${FACE_NAMES[f]} row ${Math.floor(k / n) + 1} column ${(k % n) + 1}: ${COLOR_NAMES[s[i]]}`);
    });
  }
}
