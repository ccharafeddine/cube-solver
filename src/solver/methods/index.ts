import type { Cubie } from '../../cube/cubie';
import type { MethodResult } from './common';
import { solveLBL } from './lbl';
import { solveCFOP } from './cfop';
import { solveRoux } from './roux';
import { solveZZ } from './zz';

export type MethodId = 'lbl' | 'cfop' | 'roux' | 'zz';
export const METHODS: { id: MethodId; name: string; blurb: string }[] = [
  { id: 'lbl', name: 'Layer by layer', blurb: 'The easiest way to learn: solve one layer at a time. A cross on the bottom, the bottom corners, the middle layer, then the top layer in four steps.' },
  { id: 'cfop', name: 'CFOP', blurb: 'What most fast solvers use. A cross, then F2L (the first two layers, built in pairs), then OLL (make the top one colour) and PLL (move the top pieces into place).' },
  { id: 'roux', name: 'Roux', blurb: 'Build a 1x2x3 block on each side, then solve the top corners (CMLL), then the last six edges with only M and U turns.' },
  { id: 'zz', name: 'ZZ', blurb: 'First flip every edge the right way round (EOLine). Then build the first two layers with only R, U and L turns, then finish the top layer.' },
];

export function solveMethod(id: MethodId, c: Cubie): MethodResult {
  switch (id) {
    case 'cfop': return solveCFOP(c);
    case 'roux': return solveRoux(c);
    case 'zz': return solveZZ(c);
    default: return solveLBL(c);
  }
}
export type { Step, MethodResult } from './common';
