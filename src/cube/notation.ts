import type { Face, Move } from './facelets';

const TOKEN = /^(\d*)([URFDLBxyzMES])(w?)(2|'|2')?$/;

/** Parse standard notation (WCA plus `Rw`/`3Rw` wide moves, M/E/S slices and x/y/z rotations). */
export function parseMoves(text: string): Move[] {
  const out: Move[] = [];
  for (const tok of text.trim().split(/\s+/).filter(Boolean)) {
    const m = TOKEN.exec(tok.replace(/’/g, "'"));
    if (!m) throw new Error(`Not a move: "${tok}"`);
    const [, num, face, wide, suffix] = m;
    const depth = wide ? (num ? Number(num) : 2) : 1;
    if (num && !wide) throw new Error(`Layer count needs a wide move: "${tok}"`);
    const power = suffix === "'" ? 3 : suffix === '2' || suffix === "2'" ? 2 : 1;
    out.push({ face: face as Face, power, depth });
  }
  return out;
}

export function formatMove(m: Move): string {
  const wide = m.depth > 1 ? (m.depth > 2 ? `${m.depth}${m.face}w` : `${m.face}w`) : m.face;
  return wide + (m.power === 2 ? '2' : m.power === 3 ? "'" : '');
}

export const formatMoves = (ms: Move[]) => ms.map(formatMove).join(' ');

export function invertMoves(ms: Move[]): Move[] {
  return ms.slice().reverse().map((m) => ({ ...m, power: (4 - m.power) as 1 | 2 | 3 }));
}

/** Quarter-turn metric: a half turn counts as two moves. */
export const qtm = (ms: Move[]) => ms.reduce((n, m) => n + (m.power === 2 ? 2 : 1), 0);
/** Half-turn metric, for reference. */
export const htm = (ms: Move[]) => ms.length;

/** Merge consecutive turns of the same face/depth (R R -> R2, R R' -> nothing). */
export function simplify(ms: Move[]): Move[] {
  const out: Move[] = [];
  for (const m of ms) {
    const last = out[out.length - 1];
    if (last && last.face === m.face && last.depth === m.depth) {
      const p = (last.power + m.power) % 4;
      out.pop();
      if (p) out.push({ ...m, power: p as 1 | 2 | 3 });
    } else out.push({ ...m });
  }
  return out;
}
