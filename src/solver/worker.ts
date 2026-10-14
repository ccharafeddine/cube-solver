/// <reference lib="webworker" />
import { analyze } from './analyze';
import type { AnalyzeRequest } from './protocol';

// One request at a time; the UI terminates and replaces the worker to cancel.
self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  try {
    analyze(e.data, (r) => self.postMessage(r));
  } catch (err) {
    self.postMessage({ id: e.data.id, kind: 'invalid', error: `Solver error: ${(err as Error).message}` });
  }
};
