/**
 * Tutorial content and the pure logic behind it: the notation lessons, how
 * an attempt is checked, the quiz, the app-tour steps and saved progress.
 * Nothing here touches the DOM, so all of it is unit-tested.
 */
import { applyMoves, solved, type State } from '../cube/facelets';
import { parseMoves, qtm } from '../cube/notation';

export interface Lesson {
  id: string;
  /** Short heading, e.g. "R — right face". */
  title: string;
  /** What the move is, in one or two sentences. */
  body: string;
  /** The move (or short sequence) the user is asked to perform. */
  move: string;
  /** Answer buttons offered alongside keys and dragging. */
  choices: string[];
  /** A hint shown after a wrong attempt. */
  hint: string;
}

export const LESSONS: Lesson[] = [
  { id: 'faces', title: 'Faces: R', move: 'R', choices: ['R', 'L', 'U', 'F'],
    body: 'Each face has a letter: U (up), D (down), L (left), R (right), F (front) and B (back). A letter alone means turn that face a quarter turn clockwise, as if you were looking straight at it.',
    hint: 'R is the right face. Picture looking at it from the right: clockwise moves the front stickers up.' },
  { id: 'faces-u', title: 'Faces: U', move: 'U', choices: ['U', 'D', "U'", 'F'],
    body: 'U turns the top layer clockwise seen from above, so the front stickers move to the left.',
    hint: 'U is the top layer. Seen from above, clockwise sends the front row to the left.' },
  { id: 'faces-f', title: 'Faces: F', move: 'F', choices: ['F', 'B', 'R', "F'"],
    body: 'F turns the face pointing at you clockwise. B is the face at the back, clockwise as seen from behind, which looks counter-clockwise from the front.',
    hint: 'F is the side facing you. Turn it like a steering wheel to the right.' },
  { id: 'faces-dlb', title: 'Faces: D, L and B', move: 'D L B', choices: ['D', 'L', 'B', 'U', 'R', 'F'],
    body: 'The three hidden faces follow the same rule: clockwise as seen from that side. D moves the front row right, L moves the front column down, B moves the top row left.',
    hint: 'Do D, then L, then B: each one clockwise as seen from its own side.' },
  { id: 'prime', title: "Prime: R'", move: "R'", choices: ["R'", 'R', 'R2', "L'"],
    body: "An apostrophe, called prime, means counter-clockwise. R' undoes R. With the keyboard, hold Shift.",
    hint: "R' turns the right face the other way: the front stickers go down." },
  { id: 'double', title: 'Double: U2', move: 'U2', choices: ['U2', 'U', "U'", 'D2'],
    body: 'A 2 means a half turn. U2 is the same as U U, and the direction does not matter.',
    hint: 'Turn the top face twice: U then U again.' },
  { id: 'm', title: 'Slice: M', move: 'M', choices: ['M', "M'", 'L', 'x'],
    body: 'M is the middle layer between L and R. It turns the same way as L, so the front stickers move down.',
    hint: 'M follows L: the middle column on the front moves down.' },
  { id: 'e', title: 'Slice: E', move: 'E', choices: ['E', "E'", 'D', 'y'],
    body: 'E is the equator layer between U and D. It turns the same way as D, so the front stickers move right.',
    hint: 'E follows D: the middle row on the front moves to the right.' },
  { id: 's', title: 'Slice: S', move: 'S', choices: ['S', "S'", 'F', 'z'],
    body: 'S is the standing layer between F and B. It turns the same way as F.',
    hint: 'S follows F: the middle row on top moves to the right.' },
  { id: 'wide', title: 'Wide: Rw', move: 'Rw', choices: ['Rw', 'R', "Rw'", 'M'],
    body: "A w (or a lowercase letter, as in r) means a wide turn: the face plus the layer next to it. Rw is R and M' together.",
    hint: 'Rw turns the right two layers at once, the same way as R.' },
  { id: 'rot-x', title: 'Rotation: x', move: 'x', choices: ['x', "x'", 'y', 'R'],
    body: 'x, y and z turn the whole cube in your hands. No layer moves against another. x follows R: the front comes up to the top.',
    hint: 'x rotates the whole cube like R: the front face goes to the top.' },
  { id: 'rot-y', title: 'Rotation: y', move: 'y', choices: ['y', "y'", 'x', 'U'],
    body: 'y turns the whole cube like U: the right face comes to the front.',
    hint: 'y rotates the whole cube like U: the right side comes round to the front.' },
  { id: 'rot-z', title: 'Rotation: z', move: 'z', choices: ['z', "z'", 'x', 'F'],
    body: 'z turns the whole cube like F: the top comes round to the right.',
    hint: 'z rotates the whole cube like F, clockwise as you look at it.' },
  { id: 'qtm', title: 'Counting quarter turns', move: "R U2 R'", choices: ['R', "R'", 'U2', 'U'],
    body: "This app counts in the quarter-turn metric (QTM): R and R' count 1, a half turn like U2 counts 2. So R U2 R' is 4 quarter turns. Rotations x y z count 0.",
    hint: "Play R, then U2, then R'." },
];

/** Moves -> states for the lesson's target, starting from solved. */
export function targetState(lesson: Lesson, n = 3): State {
  return applyMoves(solved(n), n, parseMoves(lesson.move));
}

export type Verdict =
  | { kind: 'correct' }
  /** On track: keep going (e.g. the first U of U2, or step one of "D L B"). */
  | { kind: 'partial'; done: number; of: number }
  | { kind: 'wrong'; expected: string; got: string };

const sameState = (a: State, b: State) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Judge the moves the user has played since the lesson asked for `lesson.move`.
 * Any sequence reaching the target state counts (U U is a fine U2); a sequence
 * that matches a prefix of the target in quarter turns is "partial"; anything
 * else is wrong.
 */
export function checkAttempt(lesson: Lesson, played: string[], n = 3): Verdict {
  const target = targetState(lesson, n);
  const now = applyMoves(solved(n), n, parseMoves(played.join(' ')));
  if (sameState(now, target)) return { kind: 'correct' };
  // Expand the target into quarter turns and see if we are on one of its prefixes.
  const quarters = parseMoves(lesson.move).flatMap((m) =>
    m.power === 2 ? [{ ...m, power: 1 as const }, { ...m, power: 1 as const }] : [m]);
  const of = quarters.length;
  for (let k = 1; k < of; k++) {
    if (sameState(now, applyMoves(solved(n), n, quarters.slice(0, k)))) return { kind: 'partial', done: k, of };
  }
  return { kind: 'wrong', expected: lesson.move, got: played.join(' ') };
}

export interface QuizQuestion { q: string; choices: string[]; answer: number; explain: string }

export const QUIZ: QuizQuestion[] = [
  { q: "What does R' do?", choices: ['Right face clockwise', 'Right face counter-clockwise', 'Right face twice', 'Whole cube like R'], answer: 1,
    explain: "The prime mark means counter-clockwise, as seen from that face." },
  { q: "How many quarter turns is R U2 R'?", choices: ['3', '4', '2', '5'], answer: 1,
    explain: `R and R' count 1 each and U2 counts 2: ${qtm(parseMoves("R U2 R'"))} in all.` },
  { q: 'Which face does M turn like?', choices: ['R', 'L', 'U', 'F'], answer: 1, explain: 'M, the middle slice, follows L.' },
  { q: 'What does x do?', choices: ['Turns the middle slice', 'Rotates the whole cube like R', 'Rotates the whole cube like U', 'Turns R and L together'], answer: 1,
    explain: 'x, y and z rotate the whole cube like R, U and F.' },
  { q: 'Which layers does Rw turn?', choices: ['Only R', 'R and the middle layer', 'R and L', 'All three'], answer: 1, explain: "A wide move turns the face and the layer next to it: Rw = R M'." },
  { q: 'Which move undoes U2?', choices: ["U'", 'U', 'U2', 'D2'], answer: 2, explain: 'A half turn is its own inverse.' },
];

export function gradeQuiz(answers: (number | null)[]): { score: number; of: number; wrong: number[] } {
  const wrong: number[] = [];
  QUIZ.forEach((q, i) => { if (answers[i] !== q.answer) wrong.push(i); });
  return { score: QUIZ.length - wrong.length, of: QUIZ.length, wrong };
}

export interface TourStep {
  id: string;
  /** CSS selector of the element to spotlight. */
  target: string;
  title: string;
  body: string;
  /** Tab to open first, if the target lives in one. */
  tab?: 'turn' | 'paint' | 'io';
}

export const TOUR: TourStep[] = [
  { id: 'rotate', target: '#viewport', tab: 'turn', title: 'Look around and turn',
    body: 'Drag the background to rotate the view; scroll or pinch to zoom. Drag any sticker to turn its layer, with a mouse, a pen or a finger.' },
  { id: 'movepad', target: '#movepad', tab: 'turn', title: 'Move pad and keys',
    body: "Tap a move, type moves in the box, or press U R F D L B M E S and x y z on the keyboard (Shift for prime)." },
  { id: 'paint', target: '#palette', tab: 'paint', title: 'Paint your own cube',
    body: 'Pick a colour, then click stickers on the cube. Without a colour, a click cycles through them. Number keys 1 to 6 pick colours.' },
  { id: 'net', target: '#net', tab: 'paint', title: 'The net editor',
    body: 'The flat net shows all 54 stickers at once, so you can copy a real cube face by face. The colour counts below catch typos, and impossible cubes are explained.' },
  { id: 'actions', target: '.bar', tab: 'turn', title: 'Scramble, reset, undo',
    body: 'Scramble gives a random position, Reset returns to solved, the arrows undo and redo (Ctrl+Z / Ctrl+Y). The slider sets animation speed.' },
  { id: 'solver', target: '#solution-card', title: 'The solution',
    body: 'The solver runs in the background as soon as the cube changes. Press Play or Space to watch it, or ← → to step one move at a time.' },
  { id: 'mode', target: '#mode-group', title: 'Fast or Optimal',
    body: 'Fast finds a short solution in milliseconds and keeps improving. Optimal proves the shortest solution in quarter turns; deep positions take longer, and you can stop at any time.' },
  { id: 'next', target: '#candidates', title: 'Ranked next moves',
    body: 'Every possible next move, with how far it leaves you from solved. Green gets closer, red goes further. ≈ marks an estimate.' },
  { id: 'beginner', target: 'label.check', title: 'Beginner mode',
    body: 'Beginner mode blends distance with how easy a turn is by hand, so R and U rank ahead of B and D when they are equally good.' },
  { id: 'method', target: '#method-card', title: 'Method breakdowns',
    body: 'See the solve the way people learn it: layer by layer, CFOP, Roux or ZZ. Each step plays on its own.' },
  { id: 'history', target: '#history', title: 'History',
    body: 'Every move you play is listed here. Click any move to jump back to that point.' },
  { id: 'share', target: '[data-panel="io"]', tab: 'io', title: 'Share, import, export',
    body: 'Copy a share link, the facelet string, JSON or the solution, or paste one in to load a cube. Download saves a .json file.' },
];

export interface Progress {
  v: 1;
  /** The first-run offer has been answered (taken or skipped). */
  offered: boolean;
  /** Ids of finished lessons. */
  lessonsDone: string[];
  /** Index of the lesson to resume. */
  lesson: number;
  /** Index of the tour step to resume. */
  tour: number;
  tourDone: boolean;
  /** Best quiz score so far, or null if never taken. */
  quizBest: number | null;
}

export const PROGRESS_KEY = 'cube-solver-tutorial';
export const freshProgress = (): Progress => ({ v: 1, offered: false, lessonsDone: [], lesson: 0, tour: 0, tourDone: false, quizBest: null });

type KV = Pick<Storage, 'getItem' | 'setItem'>;

/** Read saved progress, tolerating missing, corrupt or out-of-range data. */
export function loadProgress(store: KV): Progress {
  const p = freshProgress();
  let raw: Partial<Progress> = {};
  try { raw = JSON.parse(store.getItem(PROGRESS_KEY) ?? '{}') ?? {}; } catch { /* corrupt: start over */ }
  if (typeof raw !== 'object') return p;
  const ids = new Set(LESSONS.map((l) => l.id));
  const clamp = (x: unknown, max: number) => (Number.isInteger(x) ? Math.max(0, Math.min(max, x as number)) : 0);
  return {
    v: 1,
    offered: raw.offered === true,
    lessonsDone: Array.isArray(raw.lessonsDone) ? raw.lessonsDone.filter((x) => ids.has(x)) : p.lessonsDone,
    lesson: clamp(raw.lesson, LESSONS.length - 1),
    tour: clamp(raw.tour, TOUR.length - 1),
    tourDone: raw.tourDone === true,
    quizBest: Number.isInteger(raw.quizBest) ? (raw.quizBest as number) : null,
  };
}

export const saveProgress = (store: KV, p: Progress) => store.setItem(PROGRESS_KEY, JSON.stringify(p));

/** One-line summary for the tutorial menu. */
export function progressSummary(p: Progress): string {
  const lessons = `${p.lessonsDone.length}/${LESSONS.length} lessons`;
  const quiz = p.quizBest === null ? 'quiz not taken' : `quiz best ${p.quizBest}/${QUIZ.length}`;
  const tour = p.tourDone ? 'tour done' : p.tour > 0 ? `tour at step ${p.tour + 1}/${TOUR.length}` : 'tour not started';
  return `${lessons} · ${quiz} · ${tour}`;
}
