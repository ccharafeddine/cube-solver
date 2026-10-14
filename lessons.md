# Lessons

Rules learned building Cube Solver. Read them before changing the build, the solver or the packaging.

## Packaging (Windows, Tauri)

- **Check free disk space before `npm run desktop`.** A first Tauri release build compiles about 400 crates. `src-tauri/target` reaches several GB, and the build peaks higher than that. With about 3 GB free, rustc died with `LLVM ERROR: IO failure on output stream: no space on device` while compiling `tauri-utils`. Keep at least 10 GB free on C:. Delete `src-tauri/target` to reclaim the space; the next build just takes longer.
- The first Tauri build takes several minutes; later builds take seconds to a minute. Run it in the background and tail the log rather than waiting on it.
- Use an NSIS installer with `installMode: currentUser`, so no admin rights or UAC prompt are needed. This repeats the chess-solver lesson: portable or self-extracting exes look broken. The installers are about 2 MB, against about 100 MB for Electron.
- The CSP in `tauri.conf.json` must list every origin the app fetches (`https://api.github.com` for the update check). Workers need `worker-src 'self' blob:`.
- Opening external links from a Tauri webview needs `tauri-plugin-opener` plus the `opener:allow-open-url` capability. `window.open` silently does nothing there.
- `npx tauri icon public/icon-1024.png -o src-tauri/icons` generates every icon size. Delete the android/ios folders it also creates.
- On a fresh checkout, `git` warns about LF→CRLF line endings. That's harmless, but keep it in mind when diffing generated files.

## Solver engineering

- **Check the models against each other.** The sticker model derives moves from 3D geometry; the cubie model uses Kociemba's hand-written tables. A test applies all 18 moves both ways and compares the stickers. That one test caught every orientation mistake before any solver was written.
- Build move tables by walking each coordinate's state space from solved (BFS with one representative cube per value). This needs only coordinate *getters*, and the walk proves the coordinate is closed under the move set.
- On a 2x2, F and B are the same turn up to a whole-cube rotation, so candidate moves tie in pairs. Tests must not assume a single best move.
- Pattern-database lookups are the hot loop. Hand-unrolling the base-24 index math roughly doubled nodes per second compared with a generic loop over group definitions.
- An IDA* heuristic must be admissible. A test checks the PDB bound never exceeds a proven optimal length.
- An upper bound that equals a lower bound proves the distance. Ranking uses this to mark proven candidates without running an optimal search.
- Clamp each candidate's estimate with facts you know for certain: one move changes the distance by at most 1, and the solution's own first turn makes progress.
- Roux's last six edges need M turns, which move centres. The cubie model fixes the centres, so that one step runs on stickers and judges progress by colours.

## Front end

- **OrbitControls versus drag-to-turn.** OrbitControls listens on the canvas, so a sticker drag also spun the camera. Fix it by listening on the *host* element in the capture phase and calling `stopPropagation()` when the press lands on the cube. Presses on the plastic seams between stickers map to the nearest sticker, so a near miss still turns a layer instead of orbiting.
- The worker can't be interrupted while it computes. Cancel by terminating it and starting a new one. Caching the pattern databases in IndexedDB makes the restart cheap.
- Tag each request with an id and ignore late answers. This is chess-solver's "results keyed by position" rule.
- While a solution is being played, don't re-solve after every move: the remaining solution is still valid, and re-solving made playback stutter.
- Queue animations and speed up when the queue grows (fast typing, playing a whole solution), so the 3D view never lags behind the model.
- Portrait screens need a wider view of the cube. Zoom the camera out based on the aspect ratio.
- Vitest's `console.log` output can be swallowed. Use `process.stderr.write` in throwaway benchmarks.
- In vitest, `expect()` inside a loop over 3.6M table entries took 18 s. Count in plain JS and assert once.

## Tutorial (v1.1.0)

- Check lesson answers against the cube's state, not the keystrokes. `U U` is a fine `U2` and `R M'` is `Rw`. Expanding the target into quarter turns and matching prefixes gives "keep going" feedback for free.
- Test any prose that describes a direction ("M follows L: the front goes down") against the model. One unit test per claim is cheap and stops the text drifting from the code.
- A demonstration animation that's still in flight sets its own final colours when it lands. Cancelling one has to wait for `view.idle()` before showing the reset cube, or a stale frame wins.
- Block user moves while a demonstration plays, or the model and the view fall out of step.
- Spotlight tour steps should name selectors that a test checks against index.html, and skip targets that are hidden (for example the 3x3-only controls on a 2x2) instead of pointing at nothing.
- On phones, dock the coach and tour cards to the bottom and cap their height, so the cube they talk about stays visible.
