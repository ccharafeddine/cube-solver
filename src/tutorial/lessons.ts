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
    body: 'Every side of the cube has a letter: U is up (the top), D is down, L is left, R is right, F is front and B is back. A letter on its own means: turn that side a quarter turn clockwise. Clockwise is the way clock hands go, when you look straight at that side.',
    hint: 'R is the right side. Imagine looking at it from the right: clockwise moves the front stickers up.' },
  { id: 'faces-u', title: 'Faces: U', move: 'U', choices: ['U', 'D', "U'", 'F'],
    body: 'U turns the top layer clockwise, as seen from above. The front stickers move to the left.',
    hint: 'U is the top layer. Seen from above, clockwise sends the front row to the left.' },
  { id: 'faces-f', title: 'Faces: F', move: 'F', choices: ['F', 'B', 'R', "F'"],
    body: 'F turns the side facing you clockwise, like turning a steering wheel to the right. B is the back side. It turns clockwise as seen from behind, so from the front it looks like it goes the other way.',
    hint: 'F is the side facing you. Turn it like a steering wheel to the right.' },
  { id: 'faces-dlb', title: 'Faces: D, L and B', move: 'D L B', choices: ['D', 'L', 'B', 'U', 'R', 'F'],
    body: 'The three sides you can\'t see follow the same rule: clockwise, as if you were looking right at that side. D moves the front row right. L moves the front column down. B moves the top row left.',
    hint: 'Do D, then L, then B: each one clockwise as seen from its own side.' },
  { id: 'prime', title: "Prime: R'", move: "R'", choices: ["R'", 'R', 'R2', "L'"],
    body: 'A little mark after the letter (\') is called prime. It means turn the other way, counter-clockwise. So R\' undoes R. On a keyboard, hold Shift.',
    hint: "R' turns the right face the other way: the front stickers go down." },
  { id: 'double', title: 'Double: U2', move: 'U2', choices: ['U2', 'U', "U'", 'D2'],
    body: 'A 2 after the letter means a half turn, which is two quarter turns. U2 is the same as U U. It doesn\'t matter which way you turn.',
    hint: 'Turn the top face twice: U then U again.' },
  { id: 'm', title: 'Slice: M', move: 'M', choices: ['M', "M'", 'L', 'x'],
    body: 'M is the middle layer, between L and R. It turns the same way as L, so the front stickers move down.',
    hint: 'M follows L: the middle column on the front moves down.' },
  { id: 'e', title: 'Slice: E', move: 'E', choices: ['E', "E'", 'D', 'y'],
    body: 'E is the middle layer between U and D, like the equator around a globe. It turns the same way as D, so the front stickers move right.',
    hint: 'E follows D: the middle row on the front moves to the right.' },
  { id: 's', title: 'Slice: S', move: 'S', choices: ['S', "S'", 'F', 'z'],
    body: 'S is the middle layer between F and B. It turns the same way as F.',
    hint: 'S follows F: the middle row on top moves to the right.' },
  { id: 'wide', title: 'Wide: Rw', move: 'Rw', choices: ['Rw', 'R', "Rw'", 'M'],
    body: 'A w after the letter means wide: turn that side and the layer next to it together. Some people write a small letter instead, like r. Rw is R and M\' at the same time.',
    hint: 'Rw turns the right two layers at once, the same way as R.' },
  { id: 'rot-x', title: 'Rotation: x', move: 'x', choices: ['x', "x'", 'y', 'R'],
    body: 'x, y and z turn the whole cube in your hands. No layer twists; the cube just faces a new way. x turns it like R: the front comes up to the top.',
    hint: 'x rotates the whole cube like R: the front face goes to the top.' },
  { id: 'rot-y', title: 'Rotation: y', move: 'y', choices: ['y', "y'", 'x', 'U'],
    body: 'y turns the whole cube like U: the right side comes round to the front.',
    hint: 'y rotates the whole cube like U: the right side comes round to the front.' },
  { id: 'rot-z', title: 'Rotation: z', move: 'z', choices: ['z', "z'", 'x', 'F'],
    body: 'z turns the whole cube like F: the top comes round to the right.',
    hint: 'z rotates the whole cube like F, clockwise as you look at it.' },
  { id: 'qtm', title: 'Counting quarter turns', move: "R U2 R'", choices: ['R', "R'", 'U2', 'U'],
    body: 'This app counts moves in quarter turns (you may see this called QTM). R or R\' counts as 1. A half turn like U2 counts as 2. So R U2 R\' is 4 quarter turns. Turning the whole cube with x, y or z counts as 0.',
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
  { q: 'Which layers does Rw turn?', choices: ['Only R', 'R and the middle layer', 'R and L', 'All three'], answer: 1, explain: "A wide move turns a side and the layer next to it: Rw is R and M' together." },
  { q: 'Which move undoes U2?', choices: ["U'", 'U', 'U2', 'D2'], answer: 2, explain: 'Doing U2 twice makes a full turn, so U2 undoes itself.' },
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
  /** Wording for touch screens, when it differs. */
  touchBody?: string;
  /** Tab to open first, if the target lives in one. */
  tab?: 'turn' | 'paint' | 'io';
}

export const TOUR: TourStep[] = [
  { id: 'cube', target: '#viewport', tab: 'turn', title: 'Your cube',
    body: 'This is your cube. Each small coloured square is a sticker. When you change the cube, the rest of the app updates by itself. It shows how to solve it, which turn to try next, and the steps people use to solve it by hand.' },
  { id: 'rotate', target: '#viewport', tab: 'turn', title: 'Spin the view',
    body: 'Try it: drag the empty space around the cube to spin it, so you can see every side. Nothing on the cube changes; you just look from a new angle. Right-drag or Shift-drag spins it even if you start on a sticker. The X, Y and Z buttons in the corner turn the whole cube a quarter turn (Shift-click turns it back). Scroll to zoom in and out, and press Alt+V to put the view back.',
    touchBody: 'Try it: drag the empty space around the cube to spin it, so you can see every side. Nothing on the cube changes; you just look from a new angle. The X, Y and Z buttons in the corner turn the whole cube a quarter turn. Pinch to zoom in and out.' },
  { id: 'turn', target: '#viewport', tab: 'turn', title: 'Turn a layer',
    body: 'A move means turning one layer of the cube, like twisting the top row. Try it: press on a sticker and drag it the way you want that layer to go. You can also press keys: R turns the right side, U the top, and the same for F, D, L, B and the middle layers M, E, S. Hold Shift to turn the other way. The move pad below has a button for every turn.',
    touchBody: 'A move means turning one layer of the cube, like twisting the top row. Try it: put your finger on a sticker and slide it the way you want that layer to go. The move pad below has a button for every turn.' },
  { id: 'paint', target: '[data-panel="paint"]', tab: 'paint', title: 'Copy your real cube',
    body: 'Got a mixed-up cube at home? You can copy it here. Pick a colour, then click a sticker on the 3D cube or on the flat map of all six sides. The colour counts show if a colour has too many or too few stickers. If your cube can\'t really exist, the app tells you why, for example when one corner is twisted.',
    touchBody: 'Got a mixed-up cube at home? You can copy it here. Pick a colour, then tap a sticker on the 3D cube or on the flat map of all six sides. The colour counts show if a colour has too many or too few stickers. If your cube can\'t really exist, the app tells you why, for example when one corner is twisted.' },
  { id: 'actions', target: '.bar', tab: 'turn', title: 'Scramble, reset, undo',
    body: 'Try it: press Scramble to mix the cube up at random. Reset makes it solved again. The curved arrows undo and redo your last move (Ctrl+Z and Ctrl+Y). The slider sets how fast the turns play.',
    touchBody: 'Try it: tap Scramble to mix the cube up at random. Reset makes it solved again. The curved arrows undo and redo your last move. The slider sets how fast the turns play.' },
  { id: 'solve', target: '#solution-card', title: 'Watch it get solved',
    body: 'As soon as the cube changes, the app works out a solution: a list of moves that ends with a solved cube. Press Play (or Space) to watch it. Use ← and → to go one move at a time. In the top bar, Fast finds a short answer right away. Optimal takes longer, but finds the shortest answer there is.',
    touchBody: 'As soon as the cube changes, the app works out a solution: a list of moves that ends with a solved cube. Tap Play to watch it. Use the arrow buttons to go one move at a time. In the top bar, Fast finds a short answer right away. Optimal takes longer, but finds the shortest answer there is.' },
  { id: 'next', target: '#next-card', title: 'What to turn next',
    body: 'This list shows every quarter turn you could make right now, best first. Each row says how many moves you would still need after that turn. Green −1 means one step closer to solved. ±0 means no closer, and red +1 means one step further away. A ≈ sign means the number is a good guess, not a sure thing. Click a row to make that move.',
    touchBody: 'This list shows every quarter turn you could make right now, best first. Each row says how many moves you would still need after that turn. Green −1 means one step closer to solved. ±0 means no closer, and red +1 means one step further away. A ≈ sign means the number is a good guess, not a sure thing. Tap a row to make that move.' },
  { id: 'method', target: '#method-card', title: 'Solve it in steps',
    body: 'People don\'t solve a cube all at once. They solve it in steps, like a cross on the bottom first, then the corners. Here you see the same solve split into those steps. Pick a way to solve: Layer by layer is the easiest to learn; CFOP, Roux and ZZ are what fast solvers use. Press Play step to watch just one step.' },
  { id: 'history', target: '#history-card', title: 'History',
    body: 'Every move you make is listed here, in order. Click any move to go back to that moment, then try something else from there.',
    touchBody: 'Every move you make is listed here, in order. Tap any move to go back to that moment, then try something else from there.' },
  { id: 'share', target: '[data-panel="io"]', tab: 'io', title: 'Share and save',
    body: 'Copy a link to your cube and send it to a friend. You can also copy the solution, or save the cube as text to load later (a facelet string, which has one letter per sticker, or JSON). To load a cube, paste the text in. That\'s the end of the tour! You can take it again any time from the 🎓 Tutorial menu.' },
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

/** First-run welcome card. */
export const WELCOME = {
  title: 'Welcome to Cube Solver',
  body: "Never solved a cube before? That's fine! The lessons teach the letters people use for turns, like R for \"turn the right side\". You try each one yourself on the cube. The tour shows what every part of the app does. You can find both later in the 🎓 Tutorial menu.",
  learn: 'Learn the moves',
  tour: 'Tour the app',
  skip: 'Not now',
};
