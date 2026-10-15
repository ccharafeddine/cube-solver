/**
 * Shared machinery for big cubes (4x4 and up): single-layer turns as sticker
 * permutations, piece positions and their orbits.
 */
import { layerMove, model, turnPerm, type Turn } from '../../cube/facelets';
import { formatMove } from '../../cube/notation';

export type Perm = Int32Array;

/** Every single-layer quarter turn (both directions) on every layer. */
export function layerTurns(n: number): Turn[] {
  const out: Turn[] = [];
  for (let axis = 0 as 0 | 1 | 2; axis < 3; axis = (axis + 1) as 0 | 1 | 2)
    for (let i = 0; i < n; i++) for (const q of [1, 3]) out.push({ axis, layers: [2 * i - (n - 1)], q });
  return out;
}

export const inverseTurn = (t: Turn): Turn => ({ ...t, q: (4 - t.q) % 4 });

/** Sticker permutation of a sequence: result[i] = where sticker i ends up. */
export function seqPerm(n: number, seq: Turn[]): Perm {
  const size = 6 * n * n;
  let p = new Int32Array(size);
  for (let i = 0; i < size; i++) p[i] = i;
  for (const t of seq) {
    const tp = turnPerm(n, t);
    const q = new Int32Array(size);
    for (let i = 0; i < size; i++) q[i] = tp[p[i]];
    p = q;
  }
  return p;
}

export interface Piece {
  /** Sticker indices, in a fixed order per position. */
  stickers: number[];
  /** Cubie position on the grid. */
  pos: [number, number, number];
  kind: 'corner' | 'edge' | 'centre';
}

const cache = new Map<number, { pieces: Piece[]; pieceOf: Int32Array; orbits: number[][] }>();

/**
 * Piece positions of an n cube, and their orbits: the sets of positions a
 * piece can visit. On a 4x4 those are the corners, one 24-wing orbit and one
 * 24-centre orbit; bigger cubes add more wing and centre orbits.
 */
export function pieces(n: number) {
  const hit = cache.get(n);
  if (hit) return hit;
  const { stickers } = model(n);
  const m = n - 1;
  const byPos = new Map<string, number[]>();
  stickers.forEach((s, i) => {
    const k = s.pos.join(',');
    byPos.set(k, [...(byPos.get(k) ?? []), i]);
  });
  const list: Piece[] = [];
  const pieceOf = new Int32Array(stickers.length);
  for (const [k, ss] of byPos) {
    const pos = k.split(',').map(Number) as [number, number, number];
    const outer = pos.filter((v) => Math.abs(v) === m).length;
    // Fixed sticker order: by face index, so the same position always reads the same way.
    ss.sort((a, b) => stickers[a].face - stickers[b].face);
    ss.forEach((s) => (pieceOf[s] = list.length));
    list.push({ stickers: ss, pos, kind: outer === 3 ? 'corner' : outer === 2 ? 'edge' : 'centre' });
  }
  // Orbits: union positions connected by any single-layer quarter turn.
  const parent = list.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const t of layerTurns(n)) {
    const tp = turnPerm(n, t);
    list.forEach((p, i) => { const j = pieceOf[tp[p.stickers[0]]]; parent[find(i)] = find(j); });
  }
  const groups = new Map<number, number[]>();
  list.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });
  const res = { pieces: list, pieceOf, orbits: [...groups.values()] };
  cache.set(n, res);
  return res;
}

/** Notation for one single-layer turn, e.g. `R`, `2R'`, `3L2`. */
export const turnName = (t: Turn, n: number) => formatMove(layerMove(t, n));
