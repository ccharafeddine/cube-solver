/**
 * ZZ: EOLine (orient every edge, then place DF and DB), F2L built with only
 * R, U and L turns (which never flip an edge back), then a last layer whose
 * edges are already oriented: orient corners, permute corners, permute edges.
 *
 * Edge orientation is solved exactly: the 2048 flip states are small enough
 * for a complete distance table.
 */
import { applyCubieMove, solvabilityError, type Cubie } from '../../cube/cubie';
import { buildMoveTable, flip } from '../coords';
import {
  C, CORNER_PERMS, E, EDGE_PERMS, StepRecorder, SUNE, faces, lastLayer, llCO, llCP, llEP,
  pieceSearch, type MethodResult,
} from './common';

let flipTables: { mv: Int32Array; dist: Uint8Array } | null = null;
function eoTables() {
  if (flipTables) return flipTables;
  const mv = buildMoveTable(2048, flip, Array.from({ length: 18 }, (_, i) => i));
  const dist = new Uint8Array(2048).fill(255);
  dist[0] = 0;
  let frontier = [0];
  for (let d = 1; frontier.length; d++) {
    const next: number[] = [];
    for (const x of frontier) for (let m = 0; m < 18; m++) {
      const y = mv[x * 18 + m];
      if (dist[y] === 255) { dist[y] = d; next.push(y); }
    }
    frontier = next;
  }
  flipTables = { mv, dist };
  return flipTables;
}

/** Shortest move sequence that orients all edges (exact, by walking the distance table). */
export function solveEO(c: Cubie): number[] {
  const { mv, dist } = eoTables();
  let x = flip(c);
  const out: number[] = [];
  while (dist[x] > 0) {
    let m = 0;
    while (dist[mv[x * 18 + m]] !== dist[x] - 1) m++;
    out.push(m);
    x = mv[x * 18 + m];
  }
  return out;
}

const EO_SAFE = faces('UDRL').concat([7, 16]); // + F2, B2
const RUL = faces('RUL');

export function solveZZ(start: Cubie): MethodResult {
  const err = solvabilityError(start);
  if (err) return { ok: false, error: err };
  try {
    const rec = new StepRecorder(start);
    const eo = solveEO(rec.cube);
    rec.add('EO: orient all edges', eo);
    rec.add('Line: place DF and DB', pieceSearch(rec.cube, [E(5), E(7)], EO_SAFE, 10));
    const line = [E(5), E(7)];
    const left = [E(6), C(5), E(9), C(6), E(10)];
    const right = [E(4), C(4), E(8), C(7), E(11)];
    // Build each block piece by piece (edge, then each corner-edge pair).
    const build = (name: string, pieces: typeof left, done: typeof left) => {
      const groups = [[pieces[0]], [pieces[1], pieces[2]], [pieces[3], pieces[4]]];
      const before = rec.cube;
      const ms: number[] = [];
      for (const g of groups) {
        done.push(...g);
        const r = pieceSearch(rec.cube, [...done], RUL, 14);
        if (!r) throw new Error(`${name} failed`);
        rec.cube = r.reduce(applyCubieMove, rec.cube);
        ms.push(...r);
      }
      rec.cube = before;
      rec.add(name, ms);
    };
    const done = [...line];
    build('F2L: left block', left, done);
    build('F2L: right block', right, done);
    lastLayer(rec, [
      ['LL: orient corners', llCO, SUNE, 7],
      ['LL: permute corners', llCP, CORNER_PERMS, 5],
      ['LL: permute edges', llEP, EDGE_PERMS, 5],
    ]);
    return { ok: true, steps: rec.steps };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
