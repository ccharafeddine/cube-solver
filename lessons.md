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

## Spotlight tour

- A `box-shadow: 0 0 0 9999px` dim draws faintly in Chromium software rendering (headless and some GPU-less setups): the measured pixel stayed near the page colour. A spread of `100vmax` always covers the viewport and renders reliably. Measure the pixel; don't trust the computed style.
- To make the target clickable, set `pointer-events: none` on the spotlight and put four transparent rectangles *around* the hole to catch dim clicks. A full-screen blocker would kill the "try it now" steps.
- Overlay buttons inside the 3D viewport must not be swallowed by the capture-phase drag handler. Bail out unless the event target is the canvas itself.
- Tour keys belong in a capture-phase listener with `stopPropagation`, or ← → would also step the solution underneath.
- Keep placement pure (`holeRect`, `dimRects`, `placeCard`) and test it with numbers. Then the DOM class only measures and applies.

## Camera and exploded view

- Fit the camera from the bounding sphere: `distance = r * margin / sin(min(vFov/2, atan(tan(vFov/2) * aspect)))`. A fixed camera position with a zoom tweak for portrait screens left the cube too close and off centre in some windows.
- On resize, scale the camera distance by the ratio of the new fit to the old one. That keeps the user's own zoom level instead of snapping back.
- Reset the OrbitControls target and turn damping off for one `update()`. Otherwise leftover momentum drifts the view after a reset.
- Standard orientation on even cubes has no centres to read. Use a corner that the app's own face moves (R, U, F) never move: the DLB corner. Then any x/y/z rotation can be undone exactly.
- The turn animation re-parents meshes and snaps them back to their home matrix. Running it while pieces are exploded would fling them home mid-air. Gate turns at the entry points, and also make `animate()` just recolour when the cube is exploded, as a safety net.
- Make the explode controller reversible: start the new animation from the current eased amount and scale its duration by the distance left. Rapid toggling then never jumps.
- For a "glow" without a post-processing pass, use additive blending on thin lines and points, on a darkened viewport background. It's cheap and reads as sci-fi.

## Visual design system

- A list-valued `background-size` cycles across *every* layer. Putting a tiled texture first and a stack of radial "bubble" gradients after it tiled half the bubbles into a wallpaper. Give each tiled layer its own pseudo-element.
- Glossy aqua buttons need darker gradient midpoints than they look like they should. The white label sits over the middle band, so check contrast against that colour, not the light top.
- Clear-coat stickers plus a sky hemisphere light washed out the top face. Lacquer works with a weak sky light, lower ambient and a slightly rough clear coat.
- Floating cards over busy content (coach, welcome, tour) need near-opaque glass. Real translucency only works over calm backgrounds.
- A test that every skin defines every token, and that components only use declared tokens, keeps "skins only swap variables" true as the CSS grows.

- Mechanism parts that must turn with a cubie belong in the same piece list as the cubie; everything else is positioned from the explode amount each frame and hidden near zero so it never pokes through the assembled cube.

- Native <option> popups on Windows ignore gradient backgrounds and inherit colour oddly: always give select and option a solid background-color and color from the theme.
- Theme previews should use fixed colours, not tokens, so each swatch shows its own theme whatever theme is active.
- A service worker from a production build on the same port can serve stale bundles to the dev server; unregister in dev.

- Keep hidden inner geometry a hair below the sticker plane (0.97 vs 0.99); coplanar faces z-fight and show through stickers as ghost circles.

- Anything positioned relative to a staggered piece must use that piece's delay, or it leads the piece at the start of the animation. Better still, parent it to the piece.

- Queueing a whole sequence into the view at once makes it speed up to drain the queue and freezes each turn's duration at enqueue time. Pace sequences one turn at a time and read the slider before each turn.
- A support-distance clamp keeps the camera outside the cube, which blocks inspecting the mechanism. One-sided faces already cull from the inside, so a tiny fixed minDistance (0.08) with near 0.01 lets the camera fly in cleanly.
- Plain-language copy: one idea per sentence, explain a term the first time (move, prime, facelet string), and test sentence length and banned jargon so the copy stays simple.
