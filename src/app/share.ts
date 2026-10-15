/**
 * Import, export and shareable-URL encoding of cube states.
 *
 * The text form is the standard facelet string: one letter per sticker in the
 * order U, R, F, D, L, B, each face row by row, using the face letters as
 * colours (so the solved 3x3 is UUUUUUUUURRRRRRRRR...). That is the format
 * most cube tools and Kociemba's own solver read.
 */
import { applyMoves, solved, type State } from '../cube/facelets';
import { parseMoves } from '../cube/notation';
import { ENABLED_SIZES, type Size } from '../solver/protocol';

const LETTERS = 'URFDLB';

export const toFaceletString = (s: State) => Array.from(s, (c) => LETTERS[c]).join('');

export function fromFaceletString(text: string): { n: Size; state: State } | null {
  const t = text.trim().toUpperCase();
  if (!/^[URFDLB]+$/.test(t)) return null;
  const n = ENABLED_SIZES.find((k) => 6 * k * k === t.length);
  if (!n) return null;
  return { n, state: Uint8Array.from(t, (ch) => LETTERS.indexOf(ch)) };
}

export interface Snapshot { n: Size; state: State; moves?: string[]; solution?: string[] }

export function toJSON(s: Snapshot): string {
  return JSON.stringify({
    app: 'cube-solver', version: 1, n: s.n, facelets: toFaceletString(s.state),
    moves: s.moves ?? [], solution: s.solution ?? [],
  }, null, 2);
}

export type ImportResult = { ok: true; n: Size; state: State; moves?: string[] } | { ok: false; error: string };

/**
 * Accepts any of: the JSON export, a facelet string, or a move sequence
 * (applied to a solved cube of the current size).
 */
export function importText(text: string, currentN: Size): ImportResult {
  const t = text.trim();
  if (!t) return { ok: false, error: 'Nothing to import.' };
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const f = fromFaceletString(String(j.facelets ?? ''));
      if (!f) return { ok: false, error: 'The JSON has no valid "facelets" string.' };
      return { ok: true, n: f.n, state: f.state, moves: Array.isArray(j.moves) ? j.moves.map(String) : undefined };
    } catch {
      return { ok: false, error: 'That is not valid JSON.' };
    }
  }
  const f = fromFaceletString(t.replace(/\s+/g, ''));
  if (f) return { ok: true, ...f };
  try {
    const moves = parseMoves(t);
    return { ok: true, n: currentN, state: applyMoves(solved(currentN), currentN, moves) };
  } catch (e) {
    return { ok: false, error: `Not a facelet string, JSON export, or move sequence (${(e as Error).message}).` };
  }
}

/** URL hash: #n=3&f=<facelets>. Short, human-readable, and bookmarkable. */
export const toHash = (n: number, s: State) => `#n=${n}&f=${toFaceletString(s)}`;

export function fromHash(hash: string): { n: Size; state: State } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const f = fromFaceletString(p.get('f') ?? '');
  if (!f || String(f.n) !== (p.get('n') ?? String(f.n))) return null;
  return f;
}
