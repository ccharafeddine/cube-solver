/**
 * Roux: first block (left 1x2x3), second block (right 1x2x3), CMLL (the four
 * top corners, solved by orientation then permutation), then LSE, the last
 * six edges solved with only M and U turns: orient the edges, place UL and
 * UR, then finish the M slice.
 *
 * Blocks and CMLL run on the cubie model. LSE needs M turns, which move
 * centres, so it runs on stickers and judges progress by colours.
 */
import { solvabilityError, toFacelets, type Cubie } from '../../cube/cubie';
import { applyMove, isSolved, type Move, type State } from '../../cube/facelets';
import { formatMoves, simplify } from '../../cube/notation';
import {
  AUF, C, CORNER_PERMS, E, StepRecorder, SUNE, cornerOk, edgeOk, faces, llCO, llCP, macro, macroSearch,
  pieceSearch, type MethodResult, type Piece,
} from './common';

const FB: Piece[][] = [[E(6)], [C(5), E(9)], [C(6), E(10)]];
const SB: Piece[][] = [[E(4)], [C(4), E(8)], [C(7), E(11)]];

const blocksOk = (x: Cubie) =>
  [4, 6, 8, 9, 10, 11].every((i) => edgeOk(x, i)) && [4, 5, 6, 7].every((i) => cornerOk(x, i));

// ---- LSE on stickers ----
const U = 0, F = 18, D = 27, B = 45, L = 36, R = 9;
/** U/D-side sticker of the six LSE edge positions: UR UF UL UB DF DB. */
const LSE_UD = [U + 5, U + 7, U + 3, U + 1, D + 1, D + 7];
const centresUD = (s: State) => (s[U + 4] === 0 || s[U + 4] === 3);
/** Every LSE edge shows white or yellow on its U/D side. */
const eoGood = (s: State) => centresUD(s) && LSE_UD.every((i) => s[i] === 0 || s[i] === 3);
const cornersHome = (s: State) =>
  [[U, 0], [U + 2, 0], [U + 6, 0], [U + 8, 0], [F, 2], [F + 2, 2], [R, 1], [R + 2, 1], [B, 5], [B + 2, 5], [L, 4], [L + 2, 4]]
    .every(([i, c]) => s[i] === c);
const ulur = (s: State) =>
  eoGood(s) && s[U + 4] === 0 && cornersHome(s) && s[U + 3] === 0 && s[L + 1] === 4 && s[U + 5] === 0 && s[R + 1] === 1;

const LSE_MOVES: Move[] = ['U', 'M'].flatMap((f) => [1, 2, 3].map((p) => ({ face: f as Move['face'], power: p as 1 | 2 | 3, depth: 1 })));

function lseSearch(s: State, goal: (s: State) => boolean, maxDepth: number): Move[] | null {
  const path: Move[] = [];
  const dfs = (x: State, depth: number, prev: string): boolean => {
    if (goal(x)) return true;
    if (depth === 0) return false;
    for (const m of LSE_MOVES) {
      if (m.face === prev) continue;
      path.push(m);
      if (dfs(applyMove(x, 3, m), depth - 1, m.face)) return true;
      path.pop();
    }
    return false;
  };
  for (let d = 0; d <= maxDepth; d++) if (dfs(s, d, '')) return path;
  return null;
}

export function solveRoux(start: Cubie): MethodResult {
  const err = solvabilityError(start);
  if (err) return { ok: false, error: err };
  try {
    const rec = new StepRecorder(start);
    const blocks = (name: string, groups: Piece[][], moves: number[], done: Piece[]) => {
      const before = rec.cube;
      const ms: number[] = [];
      for (const g of groups) {
        done.push(...g);
        const r = pieceSearch(rec.cube, [...done], moves, 14);
        if (!r) throw new Error(`${name} failed`);
        ms.push(...r);
        rec.add('tmp', r);
        rec.steps.pop();
      }
      rec.cube = before;
      rec.add(name, ms);
    };
    const done: Piece[] = [];
    blocks('First block (left)', FB, faces('URFDLB'), done);
    blocks('Second block (right)', SB, faces('RUFB'), done);

    rec.add('CMLL: orient corners', macroSearch(rec.cube, (x) => blocksOk(x) && llCO(x), [...AUF, ...SUNE.map((a) => macro(a))], 7));
    rec.add('CMLL: permute corners', macroSearch(rec.cube, (x) => blocksOk(x) && llCO(x) && llCP(x), [...AUF, ...CORNER_PERMS.map((a) => macro(a))], 5));

    let s = toFacelets(rec.cube);
    const lse = (name: string, goal: (s: State) => boolean, depth: number) => {
      const r = lseSearch(s, goal, depth);
      if (!r) throw new Error(`${name} failed`);
      for (const m of r) s = applyMove(s, 3, m);
      const text = formatMoves(simplify(r));
      if (text) rec.steps.push({ name, moves: text });
    };
    lse('LSE: orient edges', eoGood, 12);
    lse('LSE: place UL and UR', ulur, 12);
    lse('LSE: finish M slice', (x) => isSolved(x, 3), 12);
    return { ok: true, steps: rec.steps };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
