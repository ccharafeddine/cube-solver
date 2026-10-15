/// <reference lib="webworker" />
import { analyze } from './analyze';
import type { AnalyzeRequest } from './protocol';
import { GROUPS, buildGroup, pdbReady, setPdb } from './pdb';
import { loadTables, saveTables } from './tableCache';

/**
 * Builds or loads the pattern databases once per worker (IndexedDB keeps them
 * across launches, so only the very first run pays the ~3 s build), then
 * answers one analysis at a time. The UI cancels by terminating the worker.
 */
async function ensureTables(id: number) {
  if (pdbReady()) return;
  const cached = await loadTables(GROUPS.map((g) => g.name)).catch(() => null);
  if (cached) return setPdb(cached);
  self.postMessage({ id, kind: 'status', text: 'Building solver tables (first run only, a few seconds)…' });
  const built = GROUPS.map(buildGroup);
  setPdb(built);
  await saveTables(GROUPS.map((g) => g.name), built).catch(() => {});
}

self.onmessage = async (e: MessageEvent<AnalyzeRequest>) => {
  try {
    if (e.data.n === 3 && (e.data.warm || !e.data.solveOnly)) await ensureTables(e.data.id);
    // A warm-up solves its (random) state once so the move and pruning tables are built, and stays quiet.
    if (e.data.warm) { analyze({ ...e.data, solveOnly: true }, () => {}); return; }
    analyze(e.data, (r) => self.postMessage(r));
  } catch (err) {
    self.postMessage({ id: e.data.id, kind: 'invalid', error: `Solver error: ${(err as Error).message}` });
  }
};
