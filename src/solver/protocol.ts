import type { Candidate } from './rank';
import type { Step } from './lbl';

export type Mode = 'fast' | 'optimal';

export interface AnalyzeRequest {
  id: number;
  n: 2 | 3;
  state: number[];
  mode: Mode;
  beginner: boolean;
  /** Think time for the main solve, ms. */
  timeMs: number;
}

export type AnalyzeResponse =
  | { id: number; kind: 'invalid'; error: string }
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
