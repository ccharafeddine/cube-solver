<p align="center"><img src="public/icon-192.png" width="96" alt="Cube Solver logo" /></p>

<h1 align="center">Cube Solver</h1>

<p align="center">
  Set up any 2x2 or 3x3 Rubik's cube, by scrambling, turning, or painting stickers,<br />
  and get a solution in standard notation, animated on a 3D cube you can rotate.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-646cff?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/three.js-000000?logo=threedotjs&logoColor=white" alt="three.js" />
  <img src="https://img.shields.io/badge/Tauri_2-24c8db?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/PWA-installable-863bff" alt="PWA" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
</p>

<p align="center"><img src="docs/screenshot-3x3.png" width="850" alt="Cube Solver with a scrambled 3x3, its solution, ranked next moves and the layer-by-layer breakdown" /></p>

## Features

- A **3D cube for 2x2 and 3x3**. Drag to rotate the view. Turn layers with the buttons, the keyboard (U R F D L B, Shift for prime), or by typing an algorithm.
- **Reset**, **Scramble** (random-state: every reachable position is equally likely), and **Undo**.
- **Paint any sticker** from the colour menu to copy a real cube. The cube is **checked for solvability** as you go, and you get a specific reason when a state can't exist: wrong colour counts, an impossible piece, a twisted corner, a flipped edge, or swapped pieces (parity).
- **2x2: always optimal.** A complete table of all 3,674,160 positions is built in your browser in under a second, so every solution is the shortest possible. Every candidate move also gets its exact distance to solved.
- **3x3 has Fast and Optimal modes.**
  - **Fast** uses Kociemba's two-phase algorithm. It finds about 20 moves in milliseconds, then keeps improving the solution while the think time lasts, streaming each better one to the screen.
  - **Optimal** runs an IDA* search for the proven-shortest solution in quarter turns. It is quick up to about 12–14 quarter turns. When a deep scramble runs out of think time, it shows the fast solution and says how far it got toward proving the optimum.
- **Ranked next moves.** All 12 quarter turns are tried and sorted by distance to solved, with the change shown (-1 = progress). In **Beginner mode** the ranking also counts how easy each turn is by hand: R and U are easy, B and D need regrips. Click a candidate to play it.
- **Layer-by-layer breakdown** (3x3). The beginner's method, step by step: cross, first-layer corners, middle layer, last-layer edge orientation, corner orientation, corner permutation, and edge permutation. Each step can be played on its own. CFOP, Roux and ZZ are listed in the method menu as planned.
- **Standard notation** throughout. Move counts are in the **quarter-turn metric**, so a half turn counts as two; the half-turn count is shown alongside.
- **Playback:** play the whole solution or step through it move by move, with adjustable animation speed.
- **Light/dark theme** that follows your system until you pick one. Settings are remembered.
- Runs as a **web app**, an **installable PWA** that works offline, or a **Windows desktop app** built with Tauri.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Testing

```bash
npm test            # unit tests (vitest): cube model, notation, validation, every solver
npm run typecheck   # strict TypeScript
npm run build       # type-check + production build to dist/
```

The tests check the sticker model against the cubie model for every move. They also check that the 2x2 table reaches every state and that God's number is 14 in quarter turns. Every solver's output is checked by playing it back and confirming the cube ends up solved.

## Install as an app (PWA)

```bash
npm run build
npm run preview     # serves dist/ at http://localhost:4173
```

Open it in Chrome or Edge and use the install icon in the address bar. You can also host `dist/` on any static host (it uses relative paths). After the first load the app works offline.

## Desktop app (Windows, Tauri)

Prerequisites: [Rust](https://rustup.rs), the Microsoft C++ Build Tools, and WebView2 (WebView2 is already on Windows 10/11).

```bash
npm run desktop:dev   # run the desktop app against the dev server
npm run desktop       # build installers
```

The installers are written to `src-tauri/target/release/bundle/`:

- `nsis/Cube Solver_<version>_x64-setup.exe`: a per-user installer, no admin rights needed.
- `msi/Cube Solver_<version>_x64_en-US.msi`

The app executable alone is `src-tauri/target/release/cube-solver.exe`. The binaries are unsigned, so SmartScreen may warn on first run: choose "More info → Run anyway".

## How it works

| Piece | File | Notes |
|---|---|---|
| Sticker model | `src/cube/facelets.ts` | Any NxN. Moves come from 3D geometry, so one code path covers every size and the renderer uses the same coordinates. |
| Cubie model | `src/cube/cubie.ts` | Kociemba's conventions; facelet ↔ cubie conversion, solvability checks |
| Notation | `src/cube/notation.ts` | WCA moves, wide moves, rotations, QTM/HTM counts, simplification |
| 2x2 solver | `src/solver/solver2.ts` | Full BFS distance table, optimal in QTM |
| 3x3 Fast | `src/solver/twophase.ts` | Two-phase IDA* with four pruning tables; streams improvements |
| 3x3 Optimal | `src/solver/optimal3.ts` | QTM IDA* with admissible sub-problem heuristics |
| Layer by layer | `src/solver/lbl.ts` | Per-step search over the moves a learner uses |
| Ranking | `src/solver/rank.ts` | Distance, plus ergonomics in beginner mode |
| Worker | `src/solver/worker.ts` | All solving happens off the UI thread |
| 3D view | `src/ui/scene.ts` | three.js; layer turns via a temporary pivot |

## Roadmap

See [PLAN.md](PLAN.md). Next up: the CFOP, Roux and ZZ breakdowns. On the backlog: 4x4/5x5 by reduction, and camera scanning of a real cube.
