/**
 * Layer by layer (beginner's method), first layer on D: cross, corners with
 * the R U R' U' trigger, middle-layer insertions, then four last-layer steps
 * with one or two algorithms each. Deliberately longer than the computer
 * solution: it is the one a learner can follow.
 */
import { applyCubieMove, solvabilityError, type Cubie } from '../../cube/cubie';
import {
  AUF, CORNER_PERMS, E, EDGE_PERMS, EO_ALGS, StepRecorder, SUNE, cornerOk, edgeOk, faces, forSlot,
  lastLayer, llCO, llCP, llEO, llEP, macro, macroSearch, pieceSearch, type MethodResult, type Piece,
} from './common';

export const ALL_FACES = faces('URFDLB');

/** Cross on D, one edge at a time, each placed optimally while keeping the others. */
export function solveCross(rec: StepRecorder, name = 'Cross') {
  const done: Piece[] = [];
  const ms: number[] = [];
  let c = rec.cube;
  for (const e of [5, 4, 7, 6]) {
    done.push(E(e));
    const r = pieceSearch(c, done, ALL_FACES, 8);
    if (!r) throw new Error('cross search failed');
    ms.push(...r);
    c = r.reduce(applyCubieMove, c);
  }
  rec.add(name, ms);
}

export function solveLBL(start: Cubie): MethodResult {
  const err = solvabilityError(start);
  if (err) return { ok: false, error: err };
  try {
    const rec = new StepRecorder(start);
    solveCross(rec);
    const crossOk = (x: Cubie) => [4, 5, 6, 7].every((e) => edgeOk(x, e));

    const triggers = [0, 1, 2, 3].map((k) => macro(forSlot("R U R' U'", k)));
    const corners = [4, 7, 6, 5];
    let ms: number[] = [];
    let c = rec.cube;
    corners.forEach((_, i) => {
      const need = corners.slice(0, i + 1);
      const r = macroSearch(c, (x) => crossOk(x) && need.every((q) => cornerOk(x, q)), [...AUF, ...triggers], 9);
      if (!r) throw new Error('first-layer corners failed');
      ms.push(...r);
      c = r.reduce(applyCubieMove, c);
    });
    rec.add('First layer corners', ms);

    const inserts = [0, 1, 2, 3].flatMap((k) => [
      macro(forSlot("U R U' R' U' F' U F", k)),
      macro(forSlot("U' F' U F U R U' R'", k)),
    ]);
    const layer1 = (x: Cubie) => crossOk(x) && [4, 5, 6, 7].every((q) => cornerOk(x, q));
    const slots = [8, 11, 10, 9];
    ms = [];
    slots.forEach((_, i) => {
      const need = slots.slice(0, i + 1);
      const r = macroSearch(c, (x) => layer1(x) && need.every((q) => edgeOk(x, q)), [...AUF, ...inserts], 4);
      if (!r) throw new Error('middle layer failed');
      ms.push(...r);
      c = r.reduce(applyCubieMove, c);
    });
    rec.add('Middle layer', ms);

    lastLayer(rec, [
      ['Last layer cross (orient edges)', llEO, EO_ALGS.slice(0, 1), 6],
      ['Orient last-layer corners', llCO, SUNE, 7],
      ['Permute last-layer corners', llCP, CORNER_PERMS, 5],
      ['Permute last-layer edges', llEP, EDGE_PERMS, 5],
    ]);
    return { ok: true, steps: rec.steps };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
