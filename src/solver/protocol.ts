import type { Candidate } from './rank';
import type { Step, MethodId } from './methods';

export type Mode = 'fast' | 'optimal';
/** Supported cube sizes. */
export type Size = 2 | 3 | 4 | 5 | 6 | 7;
export const SIZES: Size[] = [2, 3, 4, 5, 6, 7];
/** Sizes the app offers so far (big cubes are switched on one size at a time). */
export const ENABLED_SIZES: Size[] = [2, 3, 4, 5];

export interface AnalyzeRequest {
  id: number;
  n: Size;
  state: number[];
  mode: Mode;
  /** Think time for the main solve, ms. */
  timeMs: number;
  method: MethodId;
  /** Just the quick main solution (used to turn a random state into scramble moves). */
  solveOnly?: boolean;
}

export type AnalyzeResponse =
  | { id: number; kind: 'invalid'; error: string }
  /** Optimal search progress: proven no solution shorter than `depth`. */
  | { id: number; kind: 'progress'; depth: number; nodes: number; elapsedMs: number }
  /** Tables are being built or loaded. */
  | { id: number; kind: 'status'; text: string }
  | {
      id: number;
      kind: 'result';
      /** Final (true) or an early best-so-far that will be improved (false). */
      final: boolean;
      solution: string[];
      /** Quarter-turn count of the solution (half turns count two). */
      qtm: number;
      /** True when the solution is proven shortest. */
      optimal: boolean;
      note?: string;
      candidates?: Candidate[];
      method?: Step[];
    };
