/**
 * Sticker-level model of an NxN cube.
 *
 * Stickers are stored face by face in the order U, R, F, D, L, B, each face
 * row-major as it appears on the standard unfolded net. For N = 3 this is
 * exactly Kociemba's facelet order (U1..U9, R1..R9, ...), which lets the
 * cubie model and the two-phase solver read the same array.
 *
 * Moves are derived from geometry rather than hand-written cycles: every
 * sticker gets a 3D position and outward normal, and a turn rotates the
 * stickers of one layer. One code path then serves every size, and the
 * renderer uses the same coordinates.
 */

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];
/** A colour is the index of the face it belongs to when solved (0..5). */
export type Color = number;

export type Vec3 = [number, number, number];

export interface Sticker {
  face: number;
  row: number;
  col: number;
  /** Position on a grid where cubie centres sit at odd/even integers in -(N-1)..N-1. */
  pos: Vec3;
  normal: Vec3;
}

const NORMALS: Vec3[] = [
  [0, 1, 0], // U
  [1, 0, 0], // R
  [0, 0, 1], // F
  [0, -1, 0], // D
  [-1, 0, 0], // L
  [0, 0, -1], // B
];

/** Grid coordinate of row/col index i on an N cube (scaled by 2 to stay integral). */
const g = (i: number, n: number) => 2 * i - (n - 1);

function stickerPos(face: number, r: number, c: number, n: number): Vec3 {
  const m = n - 1;
  const x = g(c, n);
  const rc = g(r, n);
  const cc = g(c, n);
  switch (face) {
    case 0: return [x, m, rc]; // U: viewed from above, top row is the back
    case 1: return [m, -rc, -cc]; // R: col 0 is the front
    case 2: return [x, -rc, m]; // F
    case 3: return [x, -m, -rc]; // D: viewed from below, top row is the front
    case 4: return [-m, -rc, cc]; // L: col 0 is the back
    default: return [-cc, -rc, -m]; // B: col 0 is the right
  }
}

export interface CubeModel {
  n: number;
  stickers: Sticker[];
  /** Map "x,y,z,nx,ny,nz" -> sticker index. */
  index: Map<string, number>;
}

const models = new Map<number, CubeModel>();

export function model(n: number): CubeModel {
  const cached = models.get(n);
  if (cached) return cached;
  const stickers: Sticker[] = [];
  const index = new Map<string, number>();
  for (let f = 0; f < 6; f++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const s: Sticker = { face: f, row: r, col: c, pos: stickerPos(f, r, c, n), normal: NORMALS[f] };
        index.set(key(s.pos, s.normal), stickers.length);
        stickers.push(s);
      }
    }
  }
  const m: CubeModel = { n, stickers, index };
  models.set(n, m);
  return m;
}

const key = (p: Vec3, q: Vec3) => `${p.join(',')},${q.join(',')}`;

export type State = Uint8Array;

export function solved(n: number): State {
  const s = new Uint8Array(6 * n * n);
  for (let i = 0; i < s.length; i++) s[i] = Math.floor(i / (n * n));
  return s;
}

export function isSolved(s: State, n: number): boolean {
  const nn = n * n;
  for (let f = 0; f < 6; f++) {
    const c = s[f * nn];
    for (let i = 1; i < nn; i++) if (s[f * nn + i] !== c) return false;
  }
  return true;
}

/** A turn: rotate every sticker whose coordinate on `axis` lies in `layers`, clockwise seen from +axis `-turns` quarter turns. */
export interface Turn {
  axis: 0 | 1 | 2;
  layers: number[];
  /** Quarter turns, clockwise as seen from the positive end of the axis. */
  q: number;
}

/** Rotate a vector by +90° (right-handed) about an axis, `k` times. */
function rot(v: Vec3, axis: number, k: number): Vec3 {
  let [x, y, z] = v;
  k = ((k % 4) + 4) % 4;
  for (let i = 0; i < k; i++) {
    if (axis === 0) [y, z] = [-z, y];
    else if (axis === 1) [z, x] = [-x, z];
    else [x, y] = [-y, x];
  }
  return [x, y, z];
}

const permCache = new Map<string, Int32Array>();

/** perm[i] = the sticker index that sticker i moves to. */
export function turnPerm(n: number, t: Turn): Int32Array {
  const ck = `${n}|${t.axis}|${t.layers.join(',')}|${t.q}`;
  const hit = permCache.get(ck);
  if (hit) return hit;
  const { stickers, index } = model(n);
  const perm = new Int32Array(stickers.length);
  const layerSet = new Set(t.layers);
  // Clockwise seen from +axis is a negative right-handed rotation.
  const k = -t.q;
  stickers.forEach((s, i) => {
    if (!layerSet.has(s.pos[t.axis])) {
      perm[i] = i;
      return;
    }
    const j = index.get(key(rot(s.pos, t.axis, k), rot(s.normal, t.axis, k)));
    if (j === undefined) throw new Error('rotation left the grid');
    perm[i] = j;
  });
  permCache.set(ck, perm);
  return perm;
}

export function applyTurn(s: State, n: number, t: Turn): State {
  const perm = turnPerm(n, t);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[perm[i]] = s[i];
  return out;
}

/** Face index -> [axis, sign]. */
const FACE_AXIS: Record<Face, [0 | 1 | 2, 1 | -1]> = {
  U: [1, 1], D: [1, -1], R: [0, 1], L: [0, -1], F: [2, 1], B: [2, -1],
};

export interface Move {
  face: Face | 'x' | 'y' | 'z' | 'M' | 'E' | 'S';
  /** 1 = clockwise, 2 = half, 3 = counter-clockwise (prime). */
  power: 1 | 2 | 3;
  /** Layers deep for wide moves (1 = outer layer only). */
  depth: number;
  /** Turn only the `depth`-th layer instead of all layers down to it (SiGN `3R`). */
  slice?: boolean;
}

export function moveToTurn(m: Move, n: number): Turn {
  const all = Array.from({ length: n }, (_, i) => g(i, n));
  if (m.face === 'x' || m.face === 'y' || m.face === 'z') {
    const axis = ({ x: 0, y: 1, z: 2 } as const)[m.face];
    return { axis, layers: all, q: m.power };
  }
  if (m.face === 'M' || m.face === 'E' || m.face === 'S') {
    // Slice moves turn every inner layer: M follows L, E follows D, S follows F.
    const inner = all.slice(1, n - 1);
    const axis = ({ M: 0, E: 1, S: 2 } as const)[m.face];
    return { axis, layers: inner, q: m.face === 'S' ? m.power : 4 - m.power };
  }
  const [axis, sign] = FACE_AXIS[m.face];
  const layers = m.slice
    ? [sign > 0 ? all[n - m.depth] : all[m.depth - 1]]
    : sign > 0 ? all.slice(n - m.depth) : all.slice(0, m.depth);
  // A clockwise turn of a negative face is counter-clockwise seen from +axis.
  return { axis, layers, q: sign > 0 ? m.power : 4 - m.power };
}

export function applyMove(s: State, n: number, m: Move): State {
  return applyTurn(s, n, moveToTurn(m, n));
}

export function applyMoves(s: State, n: number, ms: Move[]): State {
  for (const m of ms) s = applyMove(s, n, m);
  return s;
}

/**
 * The notation for a single-layer turn (the inverse of moveToTurn for one
 * layer): outer layers become face turns, the middle layer of an odd cube
 * becomes M/E/S. Returns null for inner layers that have no single-letter
 * name (e.g. the second layer of a 4x4).
 */
export function turnToMove(t: Turn, n: number): Move | null {
  if (t.layers.length !== 1) return null;
  const layer = t.layers[0];
  const q = ((t.q % 4) + 4) % 4 as 0 | 1 | 2 | 3;
  if (q === 0) return null;
  const pos: Face[] = ['R', 'U', 'F'], neg: Face[] = ['L', 'D', 'B'];
  if (layer === n - 1) return { face: pos[t.axis], power: q as 1 | 2 | 3, depth: 1 };
  if (layer === -(n - 1)) return { face: neg[t.axis], power: (4 - q) as 1 | 2 | 3, depth: 1 };
  if (n === 3 && layer === 0) {
    const slice = (['M', 'E', 'S'] as const)[t.axis];
    // M follows L and E follows D (negative sides); S follows F.
    return { face: slice, power: (slice === 'S' ? q : 4 - q) as 1 | 2 | 3, depth: 1 };
  }
  return null;
}

/**
 * Like turnToMove but names every single layer of any cube, inner ones in
 * SiGN style: `2R` is the second layer from R, `3L'` the third from L. The
 * middle layer of an odd cube is named from R, U or F.
 */
export function layerMove(t: Turn, n: number): Move {
  const layer = t.layers[0];
  const q = (((t.q % 4) + 4) % 4) as 1 | 2 | 3;
  if (layer >= 0) {
    const depth = (n - 1 - layer) / 2 + 1;
    return { face: (['R', 'U', 'F'] as const)[t.axis], power: q, depth, slice: depth > 1 || undefined };
  }
  const depth = (layer + n - 1) / 2 + 1;
  return { face: (['L', 'D', 'B'] as const)[t.axis], power: (4 - q) as 1 | 2 | 3, depth, slice: depth > 1 || undefined };
}

/** Colour counts per face colour, for setup validation hints. */
export function colorCounts(s: State): number[] {
  const c = [0, 0, 0, 0, 0, 0];
  for (const x of s) c[x]++;
  return c;
}
