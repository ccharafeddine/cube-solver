/**
 * The interactive tutorial: notation lessons with a quiz, and a spotlight
 * tour of the app. Content and checking live in lessons.ts; this file is the
 * DOM and the 3D-view choreography. Progress is saved after every step so the
 * tutorial can be resumed or replayed from the Tutorial menu.
 */
import { applyTurn, moveToTurn, solved, type State } from '../cube/facelets';
import { parseMoves } from '../cube/notation';
import type { CubeView } from '../ui/scene';
import { SpotlightTour } from './spotlight';
import {
  LESSONS, QUIZ, TOUR, checkAttempt, gradeQuiz, loadProgress, saveProgress, progressSummary, type Progress,
} from './lessons';

export interface TutorialHost {
  view: CubeView;
  /** Switch to a solved 3x3 for lessons, remembering the user's cube. */
  enterLessons(): void;
  /** Put the lesson cube back to solved without animation. */
  resetCube(): void;
  /** Leave lessons and restore the cube the user had before. */
  exitLessons(): void;
  /** Play a move as if the user had (used by the answer buttons). */
  playMove(move: string): void;
  selectTab(tab: 'turn' | 'paint' | 'io'): void;
  /** Turn duration for demonstrations. */
  turnMs(): number;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Tutorial {
  progress: Progress;
  private coach: HTMLElement;
  private tour: SpotlightTour;
  private mode: 'off' | 'lesson' | 'quiz' | 'tour' = 'off';
  private played: string[] = [];
  private demoing = false;
  private solvedOnce = false;
  /** Bumped to cancel an in-flight demonstration. */
  private demoToken = 0;
  private quizAnswers: (number | null)[] = [];

  constructor(private host: TutorialHost, private store: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
    this.progress = loadProgress(store);
    this.coach = el('section', { id: 'coach', className: 'coach hidden' });
    this.coach.setAttribute('role', 'dialog');
    this.coach.setAttribute('aria-modal', 'false');
    this.coach.setAttribute('aria-labelledby', 'coach-title');
    document.body.append(this.coach);
    this.tour = new SpotlightTour(TOUR, {
      selectTab: (t) => this.host.selectTab(t),
      onStep: (id) => { this.progress.tour = Math.max(0, TOUR.findIndex((t) => t.id === id)); this.save(); },
      onClose: (finished) => {
        if (finished) { this.progress.tourDone = true; this.progress.tour = 0; }
        this.save();
        this.mode = 'off';
        this.host.selectTab('turn');
      },
    });
  }

  private save() { saveProgress(this.store, this.progress); }

  get active() { return this.mode !== 'off'; }
  /** True while a demonstration plays: user moves are ignored so the cube cannot desync. */
  get blocksInput() { return this.demoing || this.mode === 'quiz'; }
  /** The spotlight tour handles its own keys. */
  get capturesKeys() { return this.mode === 'tour'; }
  summary() { return progressSummary(this.progress); }

  // ---------- first-run offer ----------
  /** Shows the offer inside `slot` if this is the first launch. */
  offer(slot: HTMLElement) {
    if (this.progress.offered) return;
    const done = () => { this.progress.offered = true; this.save(); slot.classList.add('hidden'); };
    const learn = el('button', { className: 'primary', textContent: 'Learn the notation' });
    learn.onclick = () => { done(); this.startLessons(); };
    const tour = el('button', { textContent: 'Tour the app' });
    tour.onclick = () => { done(); this.startTour(); };
    const skip = el('button', { textContent: 'Not now' });
    skip.onclick = done;
    slot.replaceChildren(
      el('b', { id: 'offer-title' }, 'Welcome to Cube Solver'),
      el('p', {}, 'New to cube notation? A 5-minute interactive lesson teaches it on the cube, and a short tour shows you around the app. Both are always in the 🎓 Tutorial menu.'),
      el('div', { className: 'row' }, skip, tour, learn),
    );
    slot.setAttribute('aria-labelledby', 'offer-title');
    slot.classList.remove('hidden');
    learn.focus();
  }

  // ---------- notation lessons ----------
  startLessons(from = this.progress.lesson) {
    this.stopAll();
    this.mode = 'lesson';
    this.host.enterLessons();
    this.showLesson(Math.min(from, LESSONS.length - 1));
  }

  private showLesson(i: number) {
    this.progress.lesson = i;
    this.save();
    const lesson = LESSONS[i];
    this.played = [];
    this.solvedOnce = false;
    this.host.resetCube();
    const feedback = el('p', { className: 'feedback', id: 'coach-feedback' });
    feedback.setAttribute('aria-live', 'polite');
    const choices = el('div', { className: 'row choices' });
    choices.setAttribute('aria-label', 'Answer with a move');
    for (const c of lesson.choices) {
      const b = el('button', { className: 'mono', textContent: c });
      b.setAttribute('aria-label', `Play ${c}`);
      b.onclick = () => this.host.playMove(c);
      choices.append(b);
    }
    const again = el('button', { textContent: '↻ Show again' });
    again.onclick = () => void this.demo(lesson.move, feedback);
    const back = el('button', { textContent: 'Back', disabled: i === 0 });
    back.onclick = () => this.showLesson(i - 1);
    const next = el('button', { className: 'primary', textContent: i + 1 < LESSONS.length ? 'Next lesson' : 'Take the quiz', disabled: !this.progress.lessonsDone.includes(lesson.id) });
    next.id = 'coach-next';
    next.onclick = () => (i + 1 < LESSONS.length ? this.showLesson(i + 1) : this.startQuiz());
    const skip = el('button', { className: 'link', textContent: 'Skip' });
    skip.onclick = () => (i + 1 < LESSONS.length ? this.showLesson(i + 1) : this.startQuiz());
    const dots = el('div', { className: 'dots' });
    dots.setAttribute('aria-label', `Lesson ${i + 1} of ${LESSONS.length}`);
    LESSONS.forEach((l, k) => {
      const d = el('button', { className: 'dot' + (k === i ? ' cur' : '') + (this.progress.lessonsDone.includes(l.id) ? ' done' : '') });
      d.setAttribute('aria-label', `Lesson ${k + 1}: ${l.title}${this.progress.lessonsDone.includes(l.id) ? ' (done)' : ''}`);
      d.onclick = () => this.showLesson(k);
      dots.append(d);
    });
    this.renderCoach(
      el('div', { className: 'row spread coach-head' }, el('span', { className: 'muted' }, `Notation · ${i + 1}/${LESSONS.length}`), this.closeButton()),
      dots,
      el('h2', { id: 'coach-title' }, lesson.title),
      el('p', {}, lesson.body),
      el('p', { className: 'ask' }, 'Your turn: play ', el('b', { className: 'mono big' }, lesson.move), ' — drag the cube, use the keys, or tap below.'),
      choices,
      feedback,
      el('div', { className: 'row' }, again, el('span', { className: 'grow' }), back, skip, next),
    );
    (this.coach.querySelector('h2') as HTMLElement).focus();
    void this.demo(lesson.move, feedback);
  }

  /** Spotlight and animate each move, then put the cube back for the user. */
  private async demo(moves: string, feedback: HTMLElement) {
    const token = ++this.demoToken;
    this.demoing = true;
    this.played = [];
    this.host.resetCube();
    feedback.className = 'feedback';
    feedback.textContent = 'Watch…';
    const { view } = this.host;
    const n = 3;
    let s: State = solved(n);
    const ms = Math.max(350, this.host.turnMs() * 1.6);
    const turns = parseMoves(moves).map((m) => moveToTurn(m, n));
    try {
      await sleep(reducedMotion() ? 0 : 350);
      for (const t of turns) {
        if (token !== this.demoToken) return;
        view.highlight(t);
        await sleep(reducedMotion() ? 0 : 450);
        s = applyTurn(s, n, t);
        await view.animate(t, s, ms);
      }
      await sleep(reducedMotion() ? 200 : 700);
      for (const t of turns.slice().reverse()) {
        if (token !== this.demoToken) return;
        s = applyTurn(s, n, { ...t, q: 4 - t.q });
        await view.animate({ ...t, q: 4 - t.q }, s, ms / 2);
      }
    } finally {
      if (token === this.demoToken) {
        this.demoing = false;
        this.host.resetCube();
        view.highlight(turns[0] ?? null);
        if (feedback.isConnected) feedback.textContent = 'Now you try.';
      }
    }
  }

  /** Called by the app after every move the user plays. */
  onMove(move: string) {
    if (this.mode !== 'lesson' || this.demoing) return;
    const i = this.progress.lesson;
    const lesson = LESSONS[i];
    this.played.push(move);
    const v = checkAttempt(lesson, this.played);
    const fb = document.getElementById('coach-feedback');
    if (!fb) return;
    const expected = parseMoves(lesson.move);
    if (v.kind === 'correct') {
      fb.className = 'feedback good';
      fb.textContent = this.solvedOnce ? 'Correct again.' : `Correct! ${lesson.move} it is.`;
      this.solvedOnce = true;
      this.host.view.highlight(null);
      if (!this.progress.lessonsDone.includes(lesson.id)) this.progress.lessonsDone.push(lesson.id);
      this.save();
      const next = document.getElementById('coach-next') as HTMLButtonElement | null;
      if (next) { next.disabled = false; next.focus(); }
      this.markDot(i);
      this.played = [];
      setTimeout(() => { if (this.mode === 'lesson' && this.progress.lesson === i && !this.demoing) this.host.resetCube(); }, 900);
    } else if (v.kind === 'partial') {
      fb.className = 'feedback';
      fb.textContent = `Good, keep going (${v.done} of ${v.of} quarter turns).`;
      // Point at the layer of the next expected move.
      const qs = expected.flatMap((m) => (m.power === 2 ? [m, m] : [m]));
      const nextMove = qs[v.done];
      if (nextMove) this.host.view.highlight(moveToTurn(nextMove, 3));
    } else {
      fb.className = 'feedback bad';
      fb.textContent = `Not quite: you played ${v.got}, the lesson asks for ${v.expected}. ${lesson.hint} The cube is reset, so try again.`;
      this.played = [];
      setTimeout(() => {
        if (this.mode === 'lesson' && this.progress.lesson === i && !this.demoing) {
          this.host.resetCube();
          this.host.view.highlight(moveToTurn(expected[0], 3));
        }
      }, 700);
    }
  }

  private markDot(i: number) {
    const d = this.coach.querySelectorAll('.dot')[i];
    d?.classList.add('done');
  }

  // ---------- quiz ----------
  startQuiz() {
    this.demoToken++;
    this.demoing = false;
    this.host.view.highlight(null);
    this.mode = 'quiz';
    this.quizAnswers = QUIZ.map(() => null);
    this.showQuestion(0);
  }

  private showQuestion(i: number) {
    if (i >= QUIZ.length) return this.showQuizResult();
    const q = QUIZ[i];
    const feedback = el('p', { className: 'feedback' });
    feedback.setAttribute('aria-live', 'polite');
    const next = el('button', { className: 'primary', textContent: i + 1 < QUIZ.length ? 'Next question' : 'See my score', disabled: true });
    next.onclick = () => this.showQuestion(i + 1);
    const opts = el('div', { className: 'quiz-opts' });
    opts.setAttribute('role', 'group');
    opts.setAttribute('aria-labelledby', 'coach-title');
    q.choices.forEach((c, k) => {
      const b = el('button', { textContent: c });
      b.onclick = () => {
        if (this.quizAnswers[i] !== null) return;
        this.quizAnswers[i] = k;
        const right = k === q.answer;
        b.classList.add(right ? 'right' : 'wrong');
        opts.children[q.answer].classList.add('right');
        opts.querySelectorAll('button').forEach((x) => x.setAttribute('aria-disabled', 'true'));
        feedback.className = `feedback ${right ? 'good' : 'bad'}`;
        feedback.textContent = (right ? 'Right. ' : `Not quite: the answer is “${q.choices[q.answer]}”. `) + q.explain;
        next.disabled = false;
        next.focus();
      };
      opts.append(b);
    });
    this.renderCoach(
      el('div', { className: 'row spread coach-head' }, el('span', { className: 'muted' }, `Quiz · question ${i + 1}/${QUIZ.length}`), this.closeButton()),
      el('h2', { id: 'coach-title' }, q.q),
      opts,
      feedback,
      el('div', { className: 'row' }, el('span', { className: 'grow' }), next),
    );
    (opts.firstElementChild as HTMLElement).focus();
  }

  private showQuizResult() {
    const r = gradeQuiz(this.quizAnswers);
    this.progress.quizBest = Math.max(this.progress.quizBest ?? 0, r.score);
    this.save();
    const retry = el('button', { textContent: 'Retry the quiz' });
    retry.onclick = () => this.startQuiz();
    const tour = el('button', { className: 'primary', textContent: this.progress.tourDone ? 'Replay the app tour' : 'Take the app tour' });
    tour.onclick = () => this.startTour(0);
    const close = el('button', { textContent: 'Done' });
    close.onclick = () => this.stopAll();
    const msg = r.score === r.of ? 'Perfect score. You can read any algorithm now.'
      : r.score >= r.of - 2 ? 'Nearly there. The lessons are one click away in the Tutorial menu.'
        : 'Worth another look: replay the lessons from the Tutorial menu, then retry.';
    this.renderCoach(
      el('div', { className: 'row spread coach-head' }, el('span', { className: 'muted' }, 'Quiz'), this.closeButton()),
      el('h2', { id: 'coach-title' }, `You scored ${r.score} of ${r.of}`),
      el('p', {}, msg),
      el('div', { className: 'row' }, retry, close, el('span', { className: 'grow' }), tour),
    );
    tour.focus();
  }

  // ---------- app tour ----------
  startTour(from = this.progress.tourDone ? 0 : this.progress.tour) {
    this.stopAll();
    this.mode = 'tour';
    this.tour.start(from);
  }

  // ---------- shared ----------
  private renderCoach(...kids: (Node | string)[]) {
    this.coach.replaceChildren(...kids);
    this.coach.querySelector('h2')?.setAttribute('tabindex', '-1');
    this.coach.classList.remove('hidden');
  }

  private closeButton() {
    const b = el('button', { className: 'icon', textContent: '✕' });
    b.setAttribute('aria-label', 'Close the tutorial (progress is saved)');
    b.title = 'Close (progress is saved)';
    b.onclick = () => this.stopAll();
    return b;
  }

  /** Close whatever is open. Progress stays saved for resuming. */
  stopAll() {
    this.demoToken++;
    this.demoing = false;
    if (this.mode === 'tour') this.tour.close(false);
    if (this.mode === 'lesson' || this.mode === 'quiz') {
      this.host.view.highlight(null);
      this.host.exitLessons();
    }
    this.mode = 'off';
    this.coach.classList.add('hidden');
  }

  resetProgress() {
    const offered = this.progress.offered;
    this.progress = { ...loadProgress({ getItem: () => null, setItem: () => {} }), offered };
    this.save();
  }
}
