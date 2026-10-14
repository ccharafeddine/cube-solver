/**
 * Ranking candidate next moves.
 *
 * Every quarter turn is tried and scored by how far it leaves the cube from
 * solved. In beginner mode the score also weighs how easy the turn is to do by
 * hand, so a slightly longer path that sticks to R and U can rank above one
 * that needs an awkward B or D turn.
 */
export const QUARTER_NAMES = ['U', "U'", 'R', "R'", 'F', "F'", 'D', "D'", 'L', "L'", 'B', "B'"];

/** Ease-by-hand cost of a turn: R and U are fingertrick-friendly, B and D need regrips. */
const FACE_COST: Record<string, number> = { R: 1, U: 1, L: 1.3, F: 1.5, D: 1.8, B: 2.3 };
export const ergonomicCost = (move: string) => FACE_COST[move[0]] ?? 2;

/** Weight of ergonomics against distance in beginner mode (one regrip ~ half a move). */
export const ERGONOMIC_WEIGHT = 0.6;

export interface Candidate {
  move: string;
  /** Quarter turns to solved after this move. */
  distance: number;
  /** True when the distance is proven, false when it is the best found in the time budget. */
  exact: boolean;
  /** Change versus the current distance (-1 = progress). */
  delta: number;
  score: number;
  /** Proven lower bound on the distance (pattern databases), used to break ties. */
  bound?: number;
}

export function rankCandidates(
  current: number,
  distances: { move: string; distance: number; exact: boolean; bound?: number }[],
  beginner: boolean,
): Candidate[] {
  return distances
    .map((d) => ({
      ...d,
      delta: d.distance - current,
      score: d.distance + (beginner ? ERGONOMIC_WEIGHT * ergonomicCost(d.move) : 0),
    }))
    .sort((a, b) =>
      a.score - b.score ||
      // Among equal estimates, a lower proven bound means more room to be short.
      (a.bound ?? a.distance) - (b.bound ?? b.distance) ||
      ergonomicCost(a.move) - ergonomicCost(b.move) ||
      a.move.localeCompare(b.move));
}
