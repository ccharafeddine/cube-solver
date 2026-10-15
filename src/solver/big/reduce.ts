/**
 * Reduction solver for 4x4 to 7x7.
 *
 * 1. Parity: wing orbits whose permutation is odd get one inner-slice quarter
 *    turn (OLL parity on even cubes); on even cubes an odd corner permutation
 *    gets one outer turn (PLL parity). Both are fixed first, before anything
 *    they would disturb is solved.
 * 2. Centres: pure commutator 3-cycles, one centre orbit at a time.
 * 3. Edges: pure commutator 3-cycles pair every wing with its midge (odd
 *    cubes) or put it in its solved slot (even cubes).
 * 4. 3x3: the reduced cube is solved as a 3x3 with outer turns only, which
 *    keep the centres and the paired edges intact.
 *
 * The commutators are found by a short search ([a b a', c] with single-layer
 * turns) and spread to every triple of positions by conjugation, so the same
 * code serves every size. Every solution is checked by playing it back.
 */
import { applyTurn, isSolved, layerMove, model, moveToTurn, type Move, type State, type Turn } from '../../cube/facelets';
import { fromNormalized, moveName, parity } from '../../cube/cubie';
import { parseMoves } from '../../cube/notation';
import { solveTwoPhase } from '../twophase';
import { cornerScheme } from '../solver2';
import { layerTurns, inverseTurn, seqPerm, pieces } from './core';

export interface Phase { name: string; moves: Move[] }
export type BigSolve = { ok: true; moves: Move[]; phases: Phase[] } | { ok: false; error: string };

interface Orbit {
  kind: 'centre' | 'edge';
  /** Sticker indices of each slot, ordered consistently across the orbit. */
  slots: number[][];
  /** For every ordered pair from*S+to, directed cycles (from -> to -> third) with their move sequences. */
  pairs: Map<number, { third: number; seq: Turn[] }[]>;
}

const libs = new Map<number, Orbit[]>();

/** Slot orderings and 3-cycle libraries for every centre and wing orbit of an n cube. */
export function orbitLibrary(n: number): Orbit[] {
  const hit = libs.get(n);
  if (hit) return hit;
  const { pieces: ps, orbits } = pieces(n);
  const turns = layerTurns(n); // turns[i ^ 1] is the inverse of turns[i]
  const perms = turns.map((t) => seqPerm(n, [t]));
  const infos: { kind: 'centre' | 'edge'; slots: number[][]; slotOf: Map<number, number>; slotPerm: number[][] }[] = [];
  for (const orbit of orbits) {
    const kind = ps[orbit[0]].kind;
    if (kind === 'corner' || orbit.length !== 24) continue; // corners, midges and fixed centres go to the 3x3 phase
    // Transport one slot's sticker order to every other slot, so a turn maps slot order to slot order.
    const slotOf = new Map<number, number>();
    const slots: number[][] = Array(24);
    const order = new Map<number, number[]>([[orbit[0], ps[orbit[0]].stickers]]);
    const queue = [orbit[0]];
    while (queue.length) {
      const p = queue.shift()!;
      const ss = order.get(p)!;
      for (const perm of perms) {
        const img = ss.map((x) => perm[x]);
        const q = ps.findIndex((x) => x.stickers.includes(img[0]));
        if (!order.has(q)) { order.set(q, img); queue.push(q); }
      }
    }
    orbit.forEach((p, k) => { slots[k] = order.get(p)!; slots[k].forEach((x) => slotOf.set(x, k)); });
    const slotPerm = perms.map((perm) => slots.map((ss) => slotOf.get(perm[ss[0]])!));
    infos.push({ kind: kind === 'edge' ? 'edge' : 'centre', slots, slotOf, slotPerm });
  }
  const bases = findBases(n, turns, infos);
  const out: Orbit[] = infos.map((o, k) => ({ kind: o.kind, slots: o.slots, pairs: spread(bases[k], turns, o.slotPerm) }));
  libs.set(n, out);
  return out;
}

type Cycle = { a: number; b: number; c: number; seq: Turn[] };

/**
 * Every pure 3-cycle of the form [a b a', c] with single-layer turns, sorted
 * by orbit. Many bases (not just one) keep the conjugated cycles short.
 */
function findBases(n: number, turns: Turn[], infos: { slots: number[][]; slotOf: Map<number, number> }[]): Cycle[][] {
  const all = turns.flatMap((t) => (t.q === 1 ? [t, { ...t, q: 2 }] : [t]));
  const out: Cycle[][] = infos.map(() => []);
  const seen = infos.map(() => new Set<string>());
  const owner = new Map<number, number>();
  infos.forEach((o, k) => o.slotOf.forEach((_, st) => owner.set(st, k)));
  for (const a of turns) for (const b of turns) {
    if (a.axis === b.axis) continue;
    for (const y of all) {
      const x = [a, b, inverseTurn(a)];
      const seq = [...x, y, ...x.slice().reverse().map(inverseTurn), inverseTurn(y)];
      const p = seqPerm(n, seq);
      const moved: number[] = [];
      for (let i = 0; i < p.length && moved.length <= 6; i++) if (p[i] !== i) moved.push(i);
      const k = owner.get(moved[0]);
      if (k === undefined || !moved.every((st) => owner.get(st) === k)) continue;
      const { slots, slotOf } = infos[k];
      if (moved.length !== 3 * slots[0].length) continue;
      const a0 = slotOf.get(moved[0])!;
      const b0 = slotOf.get(p[slots[a0][0]])!;
      const c0 = slotOf.get(p[slots[b0][0]])!;
      // Must carry slot order to slot order (a wing never arrives flipped).
      if (![a0, b0, c0].every((sl, i) => slots[sl].every((st, j) => p[st] === slots[[b0, c0, a0][i]][j]))) continue;
      const key = `${a0},${b0},${c0}`;
      if (seen[k].has(key)) continue;
      seen[k].add(key);
      out[k].push({ a: a0, b: b0, c: c0, seq });
    }
  }
  out.forEach((list) => { if (!list.length) throw new Error(`no 3-cycle found for an orbit of the ${n}x${n}`); });
  return out;
}

/** Conjugate the base cycles by setup turns until every triple of slots has a cycle (fewest setup turns first). */
function spread(bases: Cycle[], turns: Turn[], slotPerm: number[][]) {
  const S = slotPerm[0].length;
  const keyOf = (a: number, b: number, c: number) => {
    // Rotate so the smallest slot leads: (a b c) = (b c a).
    const m = Math.min(a, b, c);
    const [x, y, z] = m === a ? [a, b, c] : m === b ? [b, c, a] : [c, a, b];
    return (x * S + y) * S + z;
  };
  const seen = new Map<number, { setup: number[]; base: Cycle }>();
  const queue: [number, number, number, number[], Cycle][] = [];
  const inverses = bases.map((b): Cycle => ({ a: b.c, b: b.b, c: b.a, seq: b.seq.slice().reverse().map(inverseTurn) }));
  for (const cy of [...bases, ...inverses]) {
    const k = keyOf(cy.a, cy.b, cy.c);
    if (!seen.has(k)) { seen.set(k, { setup: [], base: cy }); queue.push([cy.a, cy.b, cy.c, [], cy]); }
  }
  while (queue.length) {
    const [a, b, c, setup, cy] = queue.shift()!;
    for (let i = 0; i < turns.length; i++) {
      // Doing turn i first, then the cycle, then undoing i cycles the slots that turn i^-1 maps them to.
      const ip = slotPerm[i ^ 1];
      const na = ip[a], nb = ip[b], nc = ip[c];
      const k = keyOf(na, nb, nc);
      if (seen.has(k)) continue;
      const s2 = [i, ...setup];
      seen.set(k, { setup: s2, base: cy });
      queue.push([na, nb, nc, s2, cy]);
    }
  }
  const pairs = new Map<number, { third: number; seq: Turn[] }[]>();
  for (const [k, { setup, base: cy }] of seen) {
    const a = Math.floor(k / S / S), b = Math.floor(k / S) % S, c = k % S;
    const pre = setup.map((i) => turns[i]);
    const seq = [...pre, ...cy.seq, ...pre.slice().reverse().map(inverseTurn)];
    for (const [x, y, z] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const list = pairs.get(x * S + y) ?? [];
      list.push({ third: z, seq });
      pairs.set(x * S + y, list);
    }
  }
  for (const list of pairs.values()) list.sort((p, q) => p.seq.length - q.seq.length);
  return pairs;
}

const same = (a: number[], b: number[]) => a.every((x, i) => x === b[i]);

/**
 * Greedy placement with pure 3-cycles: fill slots in order, each time moving a
 * matching piece in from an unfinished slot. Returns null if it gets stuck
 * (which only an odd, unfixed parity can cause).
 */
function solveOrbit(state: State, n: number, orbit: Orbit, target: (slot: number) => number[], out: Turn[]): State | null {
  const S = orbit.slots.length;
  const read = (s: State, k: number) => orbit.slots[k].map((i) => s[i]);
  const fixed = new Array<boolean>(S).fill(false);
  for (let p = 0; p < S; p++) {
    const want = target(p);
    if (same(read(state, p), want)) { fixed[p] = true; continue; }
    const here = read(state, p);
    let best: Turn[] | null = null;
    for (let q = 0; q < S; q++) {
      if (q === p || fixed[q] || !same(read(state, q), want)) continue;
      for (const { third, seq } of orbit.pairs.get(q * S + p) ?? []) {
        // A finished third slot is fine only if it receives exactly what it already holds.
        if (fixed[third] && !same(here, target(third))) continue;
        if (!best || seq.length < best.length) best = seq;
        break; // lists are sorted, so the first usable one is the shortest for this q
      }
    }
    if (!best) return null;
    for (const t of best) state = applyTurn(state, n, t);
    out.push(...best);
    fixed[p] = true;
  }
  return state;
}

/** Merge runs of turns on the same single layer. */
function mergeTurns(ts: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of ts) {
    const last = out[out.length - 1];
    if (last && last.axis === t.axis && last.layers[0] === t.layers[0]) {
      const q = (last.q + t.q) % 4;
      out.pop();
      if (q) out.push({ ...t, q });
    } else out.push(t);
  }
  return out;
}

export const turnsToMoves = (ts: Turn[], n: number): Move[] => mergeTurns(ts).map((t) => layerMove(t, n));

const perm2 = (p: number[]) => parity(p);

export function solveBig(input: State, n: number, opts: { timeMs?: number } = {}): BigSolve {
  const nn = n * n;
  if (input.length !== 6 * nn) return { ok: false, error: `A ${n}x${n} needs ${6 * nn} stickers.` };
  const counts = Array(6).fill(0);
  for (const c of input) counts[c]++;
  if (counts.some((k) => k !== nn)) return { ok: false, error: `Each colour must appear on exactly ${nn} stickers.` };
  const odd = n % 2 === 1;
  const mid = (n - 1) / 2;
  const at = (f: number, r: number, c: number) => f * nn + r * n + c;
  let state: State = Uint8Array.from(input);
  const { stickers } = model(n);
  const phases: { name: string; turns: Turn[] }[] = [];
  const play = (ts: Turn[]) => { for (const t of ts) state = applyTurn(state, n, t); };

  // Colour of each face: the fixed centres on odd cubes, the DBL corner on even ones.
  let scheme: number[] | null;
  if (odd) scheme = [0, 1, 2, 3, 4, 5].map((f) => state[at(f, mid, mid)]);
  else {
    const s2 = new Uint8Array(24);
    for (let f = 0; f < 6; f++) for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) s2[f * 4 + r * 2 + c] = state[at(f, r * (n - 1), c * (n - 1))];
    scheme = cornerScheme(s2);
  }
  if (!scheme || new Set(scheme).size !== 6)
    return { ok: false, error: odd ? 'The fixed centres must show six different colours.' : 'The colours do not form a real cube: some pair of colours shares a corner twice or never.' };
  const faceOf = new Map(scheme.map((c, f) => [c, f]));

  // The reduced 3x3: corners, one edge sticker per edge (the midge on odd cubes), centres.
  const three = (s: State) => {
    const k = (i: number) => (i === 0 ? 0 : i === 2 ? n - 1 : odd ? mid : 1);
    const f = new Array<number>(54);
    for (let face = 0; face < 6; face++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
      f[face * 9 + r * 3 + c] = r === 1 && c === 1 ? face : faceOf.get(s[at(face, k(r), k(c))])!;
    return f;
  };
  const corners = fromNormalized(three(state), false);
  if (!corners.ok) return corners;
  if (corners.cubie.co.reduce((a, b) => a + b, 0) % 3) return { ok: false, error: 'Corner twist is off: one corner has been rotated in place.' };

  const orbits = orbitLibrary(n);
  const target = (orbit: Orbit, s: State) => (slot: number) => orbit.slots[slot].map((st) => {
    if (orbit.kind === 'centre' || !odd) return scheme![stickers[st].face];
    // Odd cubes pair each wing with the midge of its edge, colour for colour.
    const { face, row, col } = stickers[st];
    const edgeRow = row === 0 || row === n - 1;
    return s[at(face, edgeRow ? row : mid, edgeRow ? mid : col)];
  });

  // 1. Parity.
  const par: Turn[] = [];
  if (!odd && perm2(Array.from(corners.cubie.cp)) === 1) { par.push({ axis: 1, layers: [n - 1], q: 1 }); play(par); }
  for (const orbit of orbits) {
    if (orbit.kind !== 'edge') continue;
    const tgt = target(orbit, state);
    const goals = orbit.slots.map((_, k) => tgt(k).join());
    const sigma = orbit.slots.map((ss) => goals.indexOf(ss.map((i) => state[i]).join()));
    if (sigma.some((x) => x < 0) || new Set(sigma).size !== sigma.length)
      return { ok: false, error: 'Some edge pieces are impossible or repeated: check the edge stickers.' };
    if (perm2(sigma) === 1) {
      // One quarter turn of an inner layer through this orbit swaps its parity.
      const { pos } = stickers[orbit.slots[0][0]];
      const axis = pos.findIndex((v) => Math.abs(v) !== n - 1) as 0 | 1 | 2;
      const t: Turn = { axis, layers: [pos[axis]], q: 1 };
      par.push(t);
      play([t]);
    }
  }
  phases.push({ name: 'Fix parity', turns: par });

  // 2. Centres.
  const ctr: Turn[] = [];
  for (const orbit of orbits) {
    if (orbit.kind !== 'centre') continue;
    const counts = new Map<number, number>();
    orbit.slots.forEach((ss) => { const c = state[ss[0]]; counts.set(c, (counts.get(c) ?? 0) + 1); });
    if ([...counts.values()].some((k) => k !== 4) || counts.size !== 6)
      return { ok: false, error: 'Centre pieces do not add up: each ring of centres needs four of every colour.' };
    const next = solveOrbit(state, n, orbit, target(orbit, state), ctr);
    if (!next) return { ok: false, error: 'Centres could not be solved.' };
    state = next;
  }
  phases.push({ name: 'Solve the centres', turns: ctr });

  // 3. Edges.
  const edg: Turn[] = [];
  for (const orbit of orbits) {
    if (orbit.kind !== 'edge') continue;
    const next = solveOrbit(state, n, orbit, target(orbit, state), edg);
    if (!next) return { ok: false, error: 'Edges could not be paired.' };
    state = next;
  }
  phases.push({ name: 'Pair the edges', turns: edg });

  // 4. 3x3 stage with outer turns.
  const parsed = fromNormalized(three(state), true);
  if (!parsed.ok) return parsed;
  const r = solveTwoPhase(parsed.cubie, { timeMs: opts.timeMs ?? 150 });
  if (!r.ok) return r;
  const outer = parseMoves(r.moves.map(moveName).join(' ')).flatMap((m) => {
    const t = moveToTurn(m, n);
    return t.q === 2 ? [{ ...t, q: 1 }, { ...t, q: 1 }] : [t];
  });
  play(outer);
  phases.push({ name: 'Solve it like a 3x3', turns: outer });

  if (!isSolved(state, n)) return { ok: false, error: 'Internal check failed: the solution did not solve the cube.' };
  const named = phases.map((p) => ({ name: p.name, moves: turnsToMoves(p.turns, n) })).filter((p) => p.moves.length);
  // Final check by playback from the input, in notation.
  const moves = named.flatMap((p) => p.moves);
  let check: State = Uint8Array.from(input);
  for (const m of moves) check = applyTurn(check, n, moveToTurn(m, n));
  if (!isSolved(check, n)) return { ok: false, error: 'Internal check failed: the written solution does not replay.' };
  return { ok: true, moves, phases: named };
}
