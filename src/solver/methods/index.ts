import type { Cubie } from '../../cube/cubie';
import type { MethodResult } from './common';
import { solveLBL } from './lbl';
import { solveCFOP } from './cfop';
import { solveRoux } from './roux';
import { solveZZ } from './zz';

export type MethodId = 'lbl' | 'cfop' | 'roux' | 'zz';
export const METHODS: { id: MethodId; name: string; blurb: string }[] = [
  { id: 'lbl', name: 'Layer by layer', blurb: 'The beginner method: cross, first layer, middle layer, then the last layer in four steps.' },
  { id: 'cfop', name: 'CFOP', blurb: 'Cross, F2L pairs, OLL, PLL (two-look). The most common speedsolving method.' },
  { id: 'roux', name: 'Roux', blurb: 'Two 1x2x3 blocks, CMLL for the corners, then the last six edges with M and U.' },
  { id: 'zz', name: 'ZZ', blurb: 'Orient every edge first (EOLine), build F2L with R, U, L only, then the last layer.' },
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
