import { describe, it, expect } from 'vitest';
import { applyMoves, solved } from '../cube/facelets';
import { parseMoves, qtm } from '../cube/notation';
import {
  LESSONS, QUIZ, TOUR, checkAttempt, gradeQuiz, loadProgress, saveProgress, freshProgress, progressSummary, PROGRESS_KEY, targetState,
} from './lessons';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
// Faces in the sticker array: U R F D L B, 9 stickers each.
const face = (s: Uint8Array, f: number) => Array.from(s.slice(f * 9, f * 9 + 9));
const [U, R, F, D, L] = [0, 1, 2, 3, 4];
const after = (m: string) => applyMoves(solved(3), 3, parseMoves(m));

describe('lesson content', () => {
  it('has unique ids, parseable moves, and the target among the choices', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      expect(() => parseMoves(l.move)).not.toThrow();
      for (const c of l.choices) expect(() => parseMoves(c)).not.toThrow();
      // Every move of the target can be played from the answer buttons.
      for (const m of l.move.split(' ')) expect(l.choices).toContain(m);
    }
  });
  it('covers faces, prime, double, slices, wide, rotations and QTM', () => {
    const all = LESSONS.map((l) => l.move).join(' ');
    for (const m of ['U', 'D', 'L', 'R', 'F', 'B', "R'", 'U2', 'M', 'E', 'S', 'Rw', 'x', 'y', 'z']) expect(all.split(' ')).toContain(m);
    expect(LESSONS.some((l) => l.id === 'qtm')).toBe(true);
  });
  // The lesson text describes directions; check them against the model.
  it('describes directions that match the cube model', () => {
    expect(face(after('R'), F).filter((_, i) => i % 3 === 2)).toEqual([D, D, D]); // R: front stickers go up, D colour arrives
    expect(face(after('U'), F).slice(0, 3)).toEqual([R, R, R]); // U: front row moves left, right's row arrives
    expect(face(after('D'), F).slice(6)).toEqual([L, L, L]); // D: front row moves right
    expect(face(after('L'), F).filter((_, i) => i % 3 === 0)).toEqual([U, U, U]); // L: front column moves down
    expect(face(after('M'), F).filter((_, i) => i % 3 === 1)).toEqual([U, U, U]); // M follows L
    expect(face(after('E'), F).slice(3, 6)).toEqual([L, L, L]); // E follows D
    expect(face(after('S'), R).filter((_, i) => i % 3 === 1)).toEqual([U, U, U]); // S follows F: top goes right
    expect(face(after('x'), U)).toEqual(Array(9).fill(F)); // x: front comes to the top
    expect(face(after('y'), F)).toEqual(Array(9).fill(R)); // y: right comes to the front
    expect(face(after('z'), R)).toEqual(Array(9).fill(U)); // z: top goes to the right
    expect(after('Rw')).toEqual(after("R M'"));
    expect(face(after('B'), L).filter((_, i) => i % 3 === 0)).toEqual([U, U, U]); // B: top row goes left
  });
  it('quarter-turn lesson counts 4', () => {
    expect(qtm(parseMoves(LESSONS.find((l) => l.id === 'qtm')!.move))).toBe(4);
  });
});

describe('checkAttempt', () => {
  const lesson = (id: string) => LESSONS.find((l) => l.id === id)!;
  it('accepts the move and equivalent sequences', () => {
    expect(checkAttempt(lesson('faces'), ['R']).kind).toBe('correct');
    expect(checkAttempt(lesson('double'), ['U2']).kind).toBe('correct');
    expect(checkAttempt(lesson('double'), ["U'", "U'"]).kind).toBe('correct');
    expect(checkAttempt(lesson('wide'), ['R', "M'"]).kind).toBe('correct');
    expect(checkAttempt(lesson('prime'), ['R', 'R', 'R']).kind).toBe('correct');
  });
  it('reports partial progress through multi-step targets', () => {
    expect(checkAttempt(lesson('double'), ['U'])).toEqual({ kind: 'partial', done: 1, of: 2 });
    expect(checkAttempt(lesson('qtm'), ['R', 'U'])).toEqual({ kind: 'partial', done: 2, of: 4 });
    expect(checkAttempt(lesson('faces-dlb'), ['D', 'L'])).toEqual({ kind: 'partial', done: 2, of: 3 });
  });
  it('flags wrong moves with what was expected', () => {
    expect(checkAttempt(lesson('faces'), ['L'])).toEqual({ kind: 'wrong', expected: 'R', got: 'L' });
    expect(checkAttempt(lesson('prime'), ['R']).kind).toBe('wrong');
    expect(checkAttempt(lesson('rot-x'), ['R']).kind).toBe('wrong');
  });
  it('targets differ from solved for every lesson', () => {
    for (const l of LESSONS) expect(targetState(l)).not.toEqual(solved(3));
  });
});

describe('quiz', () => {
  it('has valid answers and grades', () => {
    for (const q of QUIZ) expect(q.answer).toBeLessThan(q.choices.length);
    expect(gradeQuiz(QUIZ.map((q) => q.answer))).toEqual({ score: QUIZ.length, of: QUIZ.length, wrong: [] });
    const r = gradeQuiz(QUIZ.map(() => null));
    expect(r.score).toBe(0);
    expect(r.wrong).toHaveLength(QUIZ.length);
  });
  it('the QTM answer matches the metric', () => {
    const q = QUIZ.find((x) => x.q.includes('quarter turns'))!;
    expect(Number(q.choices[q.answer])).toBe(qtm(parseMoves("R U2 R'")));
  });
});

describe('tour steps', () => {
  it('are ten, with unique ids and selectors that exist in index.html', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf-8');
    expect(TOUR).toHaveLength(10);
    expect(new Set(TOUR.map((t) => t.id)).size).toBe(TOUR.length);
    for (const t of TOUR) {
      const needle = t.target.startsWith('#') ? `id="${t.target.slice(1)}"` : t.target === '.bar' ? 'class="bar"'
        : t.target.replace(/^\[|\]$/g, '');
      expect(html, t.id).toContain(needle);
    }
  });
  it('covers the required areas and mentions spinning', () => {
    const ids = TOUR.map((t) => t.id);
    for (const id of ['cube', 'rotate', 'turn', 'paint', 'actions', 'solve', 'next', 'method', 'history', 'share']) expect(ids).toContain(id);
    const rotate = TOUR.find((t) => t.id === 'rotate')!;
    expect(rotate.body).toMatch(/Right-drag or Shift-drag/);
  });
  it('touch wording never says click or right-drag', () => {
    for (const t of TOUR) if (t.touchBody) expect(t.touchBody).not.toMatch(/\bclick|right-drag|Shift/i);
  });
});

describe('progress', () => {
  it('starts fresh and round-trips', () => {
    const s = memory();
    expect(loadProgress(s)).toEqual(freshProgress());
    const p = { ...freshProgress(), offered: true, lessonsDone: ['faces', 'prime'], lesson: 2, tour: 3, quizBest: 5 };
    saveProgress(s, p);
    expect(loadProgress(s)).toEqual(p);
  });
  it('survives corrupt or out-of-range data', () => {
    expect(loadProgress(memory({ [PROGRESS_KEY]: '{not json' }))).toEqual(freshProgress());
    const p = loadProgress(memory({ [PROGRESS_KEY]: JSON.stringify({ offered: true, lessonsDone: ['faces', 'bogus'], lesson: 999, tour: -4, quizBest: 'x' }) }));
    expect(p).toMatchObject({ offered: true, lessonsDone: ['faces'], lesson: LESSONS.length - 1, tour: 0, quizBest: null });
  });
  it('summarises', () => {
    expect(progressSummary(freshProgress())).toBe(`0/${LESSONS.length} lessons · quiz not taken · tour not started`);
    expect(progressSummary({ ...freshProgress(), lessonsDone: ['faces'], quizBest: 4, tourDone: true })).toContain('quiz best 4/');
  });
});
