/**
 * Move history you can step through: a baseline state (set by reset,
 * scramble, painting or import) plus the moves played since, with a cursor.
 * Stepping back and forward replays moves, so the 3D view can animate them.
 */
import { applyMove, type State } from '../cube/facelets';
import { parseMoves } from '../cube/notation';

export class History {
  private moves: string[] = [];
  private cursor = 0;
  constructor(private base: State, private n: number) {}

  /** New baseline: clears the move list. */
  reset(base: State, n = this.n) {
    this.base = base;
    this.n = n;
    this.moves = [];
    this.cursor = 0;
  }

  /** Play a move at the cursor, dropping any moves after it (like a new branch). */
  push(move: string) {
    this.moves.splice(this.cursor);
    this.moves.push(move);
    this.cursor++;
  }

  get list() { return this.moves.slice(); }
  get position() { return this.cursor; }
  get canBack() { return this.cursor > 0; }
  get canForward() { return this.cursor < this.moves.length; }

  /** Move to undo (its inverse is what to play), or null. */
  back(): string | null {
    if (!this.canBack) return null;
    return this.moves[--this.cursor];
  }

  forward(): string | null {
    if (!this.canForward) return null;
    return this.moves[this.cursor++];
  }

  /** State at a given cursor position. */
  stateAt(pos: number): State {
    let s = this.base;
    for (const m of this.moves.slice(0, pos)) s = applyMove(s, this.n, parseMoves(m)[0]);
    return s;
  }

  jump(pos: number): State {
    this.cursor = Math.max(0, Math.min(pos, this.moves.length));
    return this.stateAt(this.cursor);
  }
}

export const inverseMove = (m: string) => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : `${m}'`);
