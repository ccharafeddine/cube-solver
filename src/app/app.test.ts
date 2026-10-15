import { describe, it, expect } from 'vitest';
import { fromFaceletString, toFaceletString, importText, toHash, fromHash, toJSON } from './share';
import { History, inverseMove } from './history';
import { compareVersions, checkForUpdate, updatesEnabled } from './update';
import { dragToTurn } from './drag';
import { applyMoves, applyTurn, isSolved, model, moveToTurn, solved, turnToMove, type Vec3 } from '../cube/facelets';
import { parseMoves, formatMove } from '../cube/notation';

describe('share and import', () => {
  const s = applyMoves(solved(3), 3, parseMoves("R U F'"));
  it('round-trips facelet strings', () => {
    expect(toFaceletString(solved(3)).slice(0, 10)).toBe('UUUUUUUUUR');
    expect(fromFaceletString(toFaceletString(s))!.state).toEqual(s);
    expect(fromFaceletString('UUU')).toBeNull();
  });
  it('round-trips the URL hash', () => {
    expect(fromHash(toHash(3, s))!.state).toEqual(s);
    expect(fromHash('#n=3&f=zzz')).toBeNull();
  });
  it('imports JSON, facelets and moves', () => {
    const j = importText(toJSON({ n: 3, state: s, moves: ['R'] }), 2);
    expect(j.ok && j.n === 3 && j.moves).toEqual(['R']);
    const m = importText("R U F'", 3);
    expect(m.ok && m.state).toEqual(s);
    const f = importText(toFaceletString(solved(2)), 3);
    expect(f.ok && f.n).toBe(2);
    expect(importText('hello', 3).ok).toBe(false);
  });
});

describe('history', () => {
  it('steps back and forward and branches', () => {
    const h = new History(solved(3), 3);
    h.push('R'); h.push('U');
    expect(h.back()).toBe('U');
    expect(inverseMove('U')).toBe("U'");
    expect(h.position).toBe(1);
    h.push('F');
    expect(h.list).toEqual(['R', 'F']);
    expect(h.forward()).toBeNull();
    expect(isSolved(h.jump(0), 3)).toBe(true);
    expect(h.stateAt(2)).toEqual(applyMoves(solved(3), 3, parseMoves('R F')));
  });
});

describe('update check', () => {
  it('runs only in the Tauri desktop app', () => {
    expect(updatesEnabled({ __TAURI_INTERNALS__: {} })).toBe(true);
    expect(updatesEnabled({})).toBe(false);
  });
  it('compares versions', () => {
    expect(compareVersions('v1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', 'v1.0.0')).toBe(0);
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
  });
  it('reports an available update', async () => {
    const fake = (async () => new Response(JSON.stringify({ tag_name: 'v1.1.0', html_url: 'u' }))) as typeof fetch;
    expect(await checkForUpdate('1.0.0', fake)).toEqual({ kind: 'available', latest: 'v1.1.0', url: 'u' });
    const err = (async () => { throw new Error('offline'); }) as typeof fetch;
    expect((await checkForUpdate('1.0.0', err)).kind).toBe('error');
  });
});

describe('turn <-> notation', () => {
  it('maps single-layer turns back to the same move', () => {
    for (const tok of ['U', "U'", 'U2', 'R', "L'", 'D2', 'F', "B'", 'M', "E'", 'S2']) {
      const m = parseMoves(tok)[0];
      const t = moveToTurn(m, 3);
      const back = turnToMove(t, 3)!;
      expect(applyTurn(solved(3), 3, moveToTurn(back, 3))).toEqual(applyTurn(solved(3), 3, t));
      expect(formatMove(back)).toBe(tok);
    }
  });
});

describe('drag to turn', () => {
  // Orthographic camera looking at the F face: x right, y up (screen y down).
  const project = (p: Vec3): [number, number] => [p[0] * 10, -p[1] * 10];
  const sticker = (face: number, r: number, c: number) => model(3).stickers.find((s) => s.face === face && s.row === r && s.col === c)!;
  it('dragging the top-front row left is a U turn', () => {
    const s = sticker(2, 0, 1);
    const t = dragToTurn(s.pos, s.normal, [-30, 0], project)!;
    expect(formatMove(turnToMove(t, 3)!)).toBe('U');
  });
  it('dragging the right column up is an R turn', () => {
    const s = sticker(2, 1, 2);
    const t = dragToTurn(s.pos, s.normal, [0, -30], project)!;
    expect(formatMove(turnToMove(t, 3)!)).toBe('R');
  });
  it('ignores tiny drags', () => {
    const s = sticker(2, 1, 1);
    expect(dragToTurn(s.pos, s.normal, [0.2, 0], project)).toBeNull();
  });
});
