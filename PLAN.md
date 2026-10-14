# Cube Solver — Build Plan

A Rubik's cube analysis tool, built to the same standard as `ccharafeddine/chess-solver`. You set up any cube state (2x2 and 3x3 now; larger sizes are on the backlog), and the app gives you a solution in standard notation, animates it on a 3D cube you can rotate, and ranks the candidate next moves by distance to solved.

Repo: `ccharafeddine/cube-solver`. All commits are made locally on Windows as `ccharafeddine`. No cloud agents.

---

## 1. What chess-solver sets as the bar

| Area | What chess-solver does | What cube-solver does to match |
|---|---|---|
| Stack | React 19, TypeScript ~5.9 (strict), Vite 8, Electron 41, electron-builder 26 | TypeScript, Vite and three.js with a Web Worker solver, packaged with Tauri 2 and as a PWA (see §2) |
| Engine | Stockfish 18 multi-threaded NNUE WASM in a Web Worker. Streams partial results, MultiPV 1/3/5, think time 1/3/5/10s, hash and timeout tuning, and handles stop/go race conditions | Solver runs in a Web Worker. It streams progressively better solutions, with a top-N selector and a think-time selector |
| Domain depth | FEN/PGN import and export, tactical motifs, opening names, mate and stalemate detection, move list navigation | Notation parser and printer (WCA plus SiGN wide and slice moves), state import and export, state validation (parity and orientation), move list navigation, step labels (cross/F2L/OLL/PLL-style phases) |
| Layout | `src/engine/*.ts` holds pure logic with a `*.test.ts` file next to each module. `src/components/*.tsx` holds the UI. `App.tsx` does orchestration. `electron/main.cjs` is the desktop shell | Same split: pure `src/cube` and `src/solver` modules with tests next to them, UI in `src/ui` and `main.ts`, desktop in `src-tauri` (see §3) |
| Testing | Vitest in a node environment, with ESLint (typescript-eslint plus react-hooks) | Vitest in node; every solver's output is replayed to confirm it solves (ESLint not added yet) |
| CI/CD | `ci.yml` runs lint → test → build. `release.yml` triggers on a `v*` tag, creates the release with notes from `docs/release-notes/<tag>.md`, and builds an NSIS installer on Windows and a universal DMG on macOS | `ci.yml` runs test → type-check/build; release workflow still to come |
| Desktop | Fixed-port local server so settings persist, single-instance lock with a liveness probe, window sized to its content, CSP, SharedArrayBuffer enabled, external links opened in the browser | Tauri 2 shell with a strict CSP and minimal capabilities |
| Polish | Light/dark theme that follows the OS until the user picks one, update check against GitHub releases, settings menu, PowerShell icon scripts, screenshots and badges in the README, THIRD_PARTY_NOTICES, licenses bundled in the packaged app | Theme following the OS, remembered settings, generated icons, README with badges and a screenshot; update check still to come |
| Conventions | Comments explain *why* (each constant has its rationale). Commits are short and imperative ("Fix…", "Add…"). PRs are merged to `master`. Release notes use Added/Fixed sections. `progress.txt` and `lessons.md` are mentioned in the commit log but are not in the repo (they appear to be local working notes) | Same |

## 2. Stack (revised, confirmed)

The owner replaced the original React and Electron plan with this one:

- **One TypeScript codebase** (strict mode), built with **Vite 8**, with plain DOM UI. There is no UI framework because the app has a single screen.
- **three.js** draws the 3D cube. OrbitControls rotate the view, and layer turns are animated through a temporary pivot group.
- **The solver runs in a Web Worker** (an ES module worker). All tables are generated in the worker at runtime, so nothing large is committed.
- **Tauri 2** produces the Windows desktop app: an NSIS per-user installer plus an MSI. This replaces Electron and cuts the download from about 100 MB to a few MB.
- **PWA:** a web manifest and a hand-written service worker. Pages are fetched network-first and assets cache-first, so the app installs from Chrome or Edge and works offline.
- **Vitest** tests the cube logic and the solvers. `tsc` type-checks and `vite build` builds; CI runs both.
- **MIT license.** Every algorithm is our own implementation, and no GPL code is used.

## 3. Repo layout (as built)

```
src/
  cube/facelets.ts   NxN sticker model; moves derived from 3D geometry
  cube/cubie.ts      Kociemba cubie model, facelet<->cubie, solvability checks
  cube/notation.ts   WCA + wide + rotations; QTM/HTM counts; simplify
  solver/solver2.ts  2x2 optimal (full BFS table, QTM)
  solver/coords.ts   Kociemba coordinates, move + pruning table builders
  solver/twophase.ts 3x3 Fast (two-phase, streaming improvements)
  solver/optimal3.ts 3x3 Optimal (QTM IDA*)
  solver/lbl.ts      Layer-by-layer breakdown
  solver/rank.ts     Candidate ranking + ergonomics
  solver/analyze.ts  One full analysis (pure, tested); worker.ts wraps it
  ui/scene.ts        three.js view, painting, turn animation
  main.ts            UI wiring; style.css; index.html
public/              PWA manifest, service worker, icons
src-tauri/           Tauri 2 desktop shell (Rust), icons, config
```

## 4. Solvers

**2x2 (optimal).** The DBL corner stays fixed, so the search uses 7 corners: 7!·3⁶ = 3,674,160 states. A BFS distance table over the full state space (about 3.7 MB at one byte per state) gives an exact solve in milliseconds. The user can choose HTM or QTM.

**3x3 (Kociemba two-phase).**
- Phase 1 reduces the cube to the subgroup ⟨U, D, R2, L2, F2, B2⟩. Its coordinates are corner twist (2187), edge flip (2048), and UD-slice position (495).
- Phase 2 solves within that subgroup. Its coordinates are corner permutation (40320), UD edge permutation (40320), and slice permutation (24).
- Both phases use pruning tables combined with symmetry reduction. The solver searches on in the background and streams shorter solutions as it finds them (the cube-solving version of Stockfish's "best so far"). The think-time selector, like chess-solver's 1/3/5/10s, controls how long it keeps going. Most states get a solution of about 20 moves in under 100 ms.
- **In scope (decided):** a Fast / Optimal toggle. Optimal mode This uses IDA* with a corner pattern database (88M entries, about 44 MB at 4 bits per entry). It runs in a worker with a progress readout and can be cancelled.

**NxN (4x4 to 7x7) by reduction.**
1. Solve the centers: one face at a time, then the opposite face, then the remaining four, using commutator- and IDA*-based steps.
2. Pair the edges, using the slice-flip-slice method.
3. Fix parity. OLL parity occurs on even N and has a fixed algorithm (`Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw'`). PLL parity is fixed with `Rw2 U2 Rw2 Uw2 Rw2 Uw2`, or its NxN generalization.
4. Solve the result as a 3x3 with Kociemba.

Solutions will be long (about 100 moves or more on 5x5), and the UI will say so clearly. Every solution is checked by applying it to the start state and confirming the result is solved before it is shown.

**Ranked candidate moves.** For every legal single turn, the app applies it and computes the distance to solved after that turn:
- 2x2: exact, from the table.
- 3x3: the best two-phase length found within the time budget (exact when Optimal mode is on).
- NxN: an estimate, using the reduction stage index plus the remaining length.

**Beginner mode** ranks by a blend: `score = distance + w * ergonomicCost` (w tunable in settings), favoring R/U/L/F turns, penalizing B/D, wide moves, slice moves and cube rotations. **Non-beginner** ranks by distance to solved only.

The results are sorted, and the top N are shown (1/3/5/all, the same as chess-solver's MultiPV). Each one shows the move, its resulting distance, and a Δ value (-1 means the move makes progress). Clicking a candidate plays that move with animation.

## 5. Features and UI

> **Status after the first build:** these are done: the orbiting 3D cube, keyboard and button turns, typed algorithms, the colour menu painting on the 3D cube, solvability errors, reset, random-state scramble, undo, the solution with play and step, ranked candidates with a top-N selector, the Fast/Optimal toggle, beginner mode, think time, animation speed, theme, and the layer-by-layer breakdown. Still open: drag-to-turn, the 2D net editor, STM, URL sharing, the update check, and the CFOP/Roux/ZZ breakdowns.

- **3D cube:** drag to orbit, plus a reset-view button. Click and drag on a face to turn a layer. Keyboard shortcuts follow the cstimer-style layout.
- **Size selector:** 2x2 and 3x3 now. The decided ceiling is 7x7, and 4x4/5x5 are on the backlog.
- **Setup mode:** a 2D net editor with a color palette. You can also paint directly on the 3D cube. Validation errors are specific, for example "corner twist off by 1: one corner rotated".
- **Basic controls:** Reset (back to solved) and Scramble. A scramble can be random-state or a random sequence of N moves. You can also type or paste a scramble in notation.
- **Solution panel:** shows the notation in groups, labeled by phase. Move count is shown in HTM, QTM, and STM.
- **Playback bar:** play/pause, step forward and back, jump to start and end, and a speed slider. The current move is highlighted in sync with the 3D animation.
- **Move list:** the user's own moves, with undo/redo. Branching works the way chess-solver handles replacing a continuation.
- **Sharing:** export and import the state as a facelet string and as a URL hash.
- **Methods menu:** Layer-by-layer (default), CFOP, Roux, ZZ. Each produces a human-style solution labeled by step (e.g. cross / F2L / OLL / PLL), alongside the computer solution (Fast or Optimal).
- **Colour menu:** a paint-any-sticker palette modeled on chess-solver's piece selector; pick a colour, click any sticker (net or 3D).
- **Settings and polish:** theme (follows the OS by default), metric (QTM default; a 180° turn counts as two moves), beginner mode toggle, color scheme (standard Western), animation speed, think time, and an update check against GitHub releases.

## 6. Testing

- **Vitest, `src/**/*.test.ts`:**
  - Move identities (X⁴ = id, inverses, the sexy move repeated 6 times = id, superflip order).
  - Notation round-trips.
  - Validator cases: twist, flip, parity, and a swapped sticker.
  - Scrambles are always valid.
  - Every solver: for 500 random states per size, the solution applied to the state gives solved. The 2x2 solver must return optimal length, checked against BFS.
  - Kociemba stays at or under about 22 moves on known hard positions (superflip = 20).
  - Ranking is consistent: the best candidate's distance equals the solution length minus 1.
- **Benchmarks:** a `npm run bench` script, with results recorded in the README.
- **CI:** `ci.yml` runs lint → test → build, the same as chess-solver.

## 7. Packaging (web, PWA, desktop)

- **Web:** `npm run build` writes a static `dist/` with relative paths, so it can be hosted anywhere.
- **PWA:** `public/manifest.webmanifest` and `public/sw.js`. The service worker is registered only in production builds served over http(s), and not inside Tauri.
- **Desktop:** `npm run desktop` runs `tauri build` and produces an NSIS per-user installer and an MSI under `src-tauri/target/release/bundle/`. The CSP allows only the app itself plus blob: workers. Tauri capabilities are limited to `core:default`.

### Packaging lessons from chess-solver

The repo's `progress.txt` and `lessons.md` were **not found** on the PC. They are not in the `Documents\chess-solver` checkout and not in git history. The lessons below come from the chess-solver project memory note (`.claude\projects\...chess-solver\memory\chess-solver-project.md`):

- Do not commit large engine or table binaries. Build them from dependencies or at runtime. (chess-solver moved Stockfish out of Git LFS.) Here, all solver tables are built in the worker.
- A portable single exe that unpacks itself on every launch made the app look like it never opened. Ship a **per-user installer** instead. Here that is Tauri NSIS with `installMode: currentUser`.
- The first electron-builder `dist` run needed Developer Mode or admin because of winCodeSign symlinks. Tauri avoids that toolchain.
- Electron's BrowserWindow didn't reliably honor COOP/COEP headers. This app needs no SharedArrayBuffer (single-threaded worker), so cross-origin isolation is not a dependency.
- Key results by the position they were computed for, and drop stale ones. Here, each analysis carries a request id and late results are ignored.
- Editors allow illegal positions, so every solver entry point validates first. Here, `fromFacelets`/`parse2` and `solvabilityError` run before any search.
- Use a fixed dev port so origin-keyed storage persists. Here, Vite uses `strictPort` 5173, which Tauri's `devUrl` relies on.

## 8. Milestones (revised)

**Done in the first build:**
- **M0** Scaffold: Vite + TypeScript, Vitest, CI, MIT license, PWA, Tauri shell.
- **M1** Cube model: NxN stickers, cubies, notation, solvability checks, with tests.
- **M2** 3D view: rotatable cube, animated turns, playback, painting.
- **M3** 2x2: optimal solver, exact ranking, random-state scramble.
- **M4** 3x3 Fast: two-phase, streaming.
- **M5** 3x3 Optimal: QTM IDA*, the Fast/Optimal toggle, exact ranking when the solution is short.
- **M6** Ranking: distance only, or blended with ergonomics in beginner mode.
- **M7** Layer-by-layer method breakdown, with each step playable.

**Next:**
- **M8** CFOP, Roux and ZZ breakdowns (already listed in the methods menu as planned).
- **M9** A stronger optimal 3x3: a corner pattern database (about 44 MB), possibly in WASM, so deep scrambles are proven optimal faster.
- **M10** Polish: drag-to-turn on the cube, a 2D net editor, URL sharing, more screenshots, release notes, and a tagged release workflow.

### Backlog
- **4x4 and 5x5** by reduction (centres, then edge pairing, then parity fixes, then the 3x3 solver). The sticker model and the renderer already handle any N.
- **Camera scanning:** a bottom-bar option that scans a real cube with the webcam and shows the scanned state digitally for confirmation.

## 9. Decisions (confirmed by the owner)

1. **Max size:** 7x7 was decided first. The revised scope ships 2x2 and 3x3 now and puts 4x4/5x5 on the backlog.
2. **3x3 modes:** both Optimal and Fast, with a toggle (optimal moved from stretch into scope).
3. **Methods menu:** layer-by-layer, CFOP, Roux, ZZ; layer-by-layer is the default.
4. **Ranking:** beginner mode blends ergonomics (ease by hand) with distance; non-beginner ranks by distance to solved only.
5. **License:** MIT, so no GPL code reuse.
6. **Metric:** quarter-turn metric; a 180° turn counts as two moves.
7. **Colours / input:** paint-any-sticker colour menu like chess-solver's piece menu. Camera scanning of a real cube is on the backlog as a bottom-bar option showing the scanned cube digitally.
8. **Stack:** one TypeScript codebase with Vite, three.js and a Web Worker solver, packaged with Tauri for Windows plus a PWA. This replaces React and Electron.
