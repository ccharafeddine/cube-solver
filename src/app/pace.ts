/**
 * Plays a move list one turn at a time at the speed slider's pace: each turn
 * waits for the previous animation to land, then a short gap. The duration
 * and gap are read before every turn, so moving the slider mid-sequence
 * takes effect on the next turn.
 */
export interface PaceHooks {
  /** Play one move (starts its animation). Return false to stop. */
  play: (move: string) => boolean | void;
  /** Resolves when the current animation has finished. */
  idle: () => Promise<void>;
  /** Pause after each turn, in ms, read live. */
  gapMs: () => number;
  /** True once something else has taken over (a new sequence, a reset). */
  cancelled: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export async function playPaced(moves: string[], h: PaceHooks): Promise<boolean> {
  const sleep = h.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (const m of moves) {
    if (h.cancelled()) return false;
    if (h.play(m) === false) return false;
    await h.idle();
    if (h.cancelled()) return false;
    await sleep(h.gapMs());
  }
  return true;
}
