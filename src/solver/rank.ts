/**
 * Ranking candidate next moves.
 *
 * Every quarter turn is tried and scored by how far it leaves the cube from
 * solved, purely by distance.
 */
export const QUARTER_NAMES = ['U', "U'", 'R', "R'", 'F', "F'", 'D', "D'", 'L', "L'", 'B', "B'"];


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
): Candidate[] {
  return distances
    .map((d) => ({
      ...d,
      delta: d.distance - current,
      score: d.distance,
    }))
    .sort((a, b) =>
      a.score - b.score ||
      // Among equal estimates, a lower proven bound means more room to be short.
      (a.bound ?? a.distance) - (b.bound ?? b.distance) ||
      a.move.localeCompare(b.move));
}
