/**
 * CFOP (Fridrich): cross, four F2L pairs (corner and edge inserted together),
 * then OLL and PLL. OLL and PLL use the two-look subsets (edges then corners;
 * corners then edges), the usual first algorithm sets people learn.
 *
 * Each pair is found by IDA* over U and the four side faces (D would disturb
 * the cross), solving whichever remaining pair is cheapest first, the way a
 * solver looks ahead for an easy pair.
 */
import { solvabilityError, type Cubie } from '../../cube/cubie';
import { solveCross } from './lbl';
import {
  C, CORNER_PERMS, E, EDGE_PERMS, EO_ALGS, SLOTS, StepRecorder, SUNE, faces, lastLayer, llCO, llCP, llEO, llEP,
  pieceDist, pieceSearch, type MethodResult, type Piece,
} from './common';

const F2L_MOVES = faces('URFLB');
const SLOT_NAMES = ['front-right', 'back-right', 'back-left', 'front-left'];

export function solveF2LPairs(rec: StepRecorder, done: Piece[], label = (k: number) => `F2L pair (${SLOT_NAMES[k]})`) {
  const remaining = [0, 1, 2, 3];
  while (remaining.length) {
    // Cheapest pair first: by the larger of its two piece distances.
    const cost = (k: number) => {
      const [c, e] = SLOTS[k];
      const loc = (p: Piece) => (p.kind === 'e' ? rec.cube.ep.indexOf(p.id) * 2 + rec.cube.eo[rec.cube.ep.indexOf(p.id)] : rec.cube.cp.indexOf(p.id) * 3 + rec.cube.co[rec.cube.cp.indexOf(p.id)]);
      return Math.max(pieceDist(C(c), F2L_MOVES)[loc(C(c))], pieceDist(E(e), F2L_MOVES)[loc(E(e))]);
    };
    remaining.sort((a, b) => cost(a) - cost(b));
    const k = remaining.shift()!;
    const [c, e] = SLOTS[k];
    const targets = [...done, C(c), E(e)];
    const r = pieceSearch(rec.cube, targets, F2L_MOVES, 12);
    rec.add(label(k), r);
    done.push(C(c), E(e));
  }
}

export function solveCFOP(start: Cubie): MethodResult {
  const err = solvabilityError(start);
  if (err) return { ok: false, error: err };
  try {
    const rec = new StepRecorder(start);
    solveCross(rec);
    solveF2LPairs(rec, [E(4), E(5), E(6), E(7)]);
    lastLayer(rec, [
      ['OLL: orient edges', llEO, EO_ALGS, 6],
      ['OLL: orient corners', llCO, SUNE, 7],
      ['PLL: permute corners', llCP, CORNER_PERMS, 5],
      ['PLL: permute edges', llEP, EDGE_PERMS, 5],
    ]);
    return { ok: true, steps: rec.steps };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
