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

/**
 * Turn length for scrambles: like a person mixing a cube, about 1.75x quicker
 * than normal playback at the same slider setting, but never a blur (60 ms
 * floor) and never sluggish (260 ms ceiling).
 */
export const scrambleMs = (normalMs: number) => Math.round(Math.min(260, Math.max(60, normalMs / 1.75)));

/**
 * Random-move scramble for any size: each turn on a different axis from the
 * one before, or a different layer of it, so no turn cancels or merges with
 * the last. Layers are named by `name(axis, layer, power)`.
 */
export function randomMoves(n: number, count: number, rand = Math.random): { axis: number; layer: number; power: 1 | 2 | 3 }[] {
  const out: { axis: number; layer: number; power: 1 | 2 | 3 }[] = [];
  // Skip the middle layer of odd cubes for 3x3 and below, as WCA scrambles do.
  const layers = Array.from({ length: n }, (_, i) => i).filter((i) => n > 3 || i === 0 || i === n - 1);
  while (out.length < count) {
    const axis = Math.floor(rand() * 3), layer = layers[Math.floor(rand() * layers.length)];
    const last = out[out.length - 1];
    if (last && last.axis === axis && last.layer === layer) continue;
    // Avoid A B A on one axis, which reads like a wasted pair.
    const prev = out[out.length - 2];
    if (last && prev && last.axis === axis && prev.axis === axis && prev.layer === layer) continue;
    out.push({ axis, layer, power: (1 + Math.floor(rand() * 3)) as 1 | 2 | 3 });
  }
  return out;
}
