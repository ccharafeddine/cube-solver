/**
 * Three.js view of the cube: orbit to rotate the whole cube, click a sticker
 * to paint it, and animated layer turns.
 *
 * Meshes never change identity. A turn temporarily parents the turning
 * layer's meshes to a pivot, spins the pivot, then puts every mesh back at
 * its home transform and recolours from the new state. The scene therefore
 * cannot drift from the model however many turns are played.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { model, type State, type Turn, type Vec3 } from '../cube/facelets';
import { dragToTurn } from '../app/drag';
import { DEFAULT_CAMERA } from '../cube/orient';
import { ExplodeController, explodeOffset, staggerDelay } from './explode';

/** Extra zoom-out at full explode; the exploded cube is about 1.6x wider. */
const EXPLODE_ZOOM_OUT = 0.75;
export const COLORS = ['#ffffff', '#c41e3a', '#009e60', '#ffd500', '#ff5800', '#0051ba'];
export const COLOR_NAMES = ['White', 'Red', 'Green', 'Yellow', 'Orange', 'Blue'];

interface Piece { mesh: THREE.Object3D; grid: THREE.Vector3; home: THREE.Matrix4; homePos: THREE.Vector3; delay: number }

export class CubeView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private pieces: Piece[] = [];
  private stickerMeshes: THREE.Mesh[] = [];
  private n = 3;
  private busy: Promise<void> = Promise.resolve();
  private pending = 0;
  /** When true, clicks paint stickers instead of turning layers. */
  paintMode = false;
  onStickerClick: (index: number) => void = () => {};
  /** A drag on a sticker asked for this turn. */
  onDragTurn: (turn: Turn) => void = () => {};

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(...DEFAULT_CAMERA);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 14;
    // Right-drag always spins the view (panning is off, so the right button is free).
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.scene.add(this.root, new THREE.AmbientLight(0xffffff, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 8, 6);
    this.scene.add(sun);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.listenForClicks();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.updateExplode();
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Camera back to the standard view: slightly above, front-right corner toward you. */
  resetView() {
    this.camera.position.set(...DEFAULT_CAMERA);
    this.controls.target.set(0, 0, 0);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Portrait screens: zoom out so the whole cube fits the narrow width.
    this.baseZoom = Math.min(1, (w / h) * 1.15);
    this.camera.zoom = this.baseZoom / (1 + EXPLODE_ZOOM_OUT * this.lastAmount);
    this.camera.updateProjectionMatrix();
  }

  /** Rebuild meshes for an n x n cube. */
  build(n: number) {
    this.n = n;
    this.lit = null;
    this.explode.set(false, true);
    this.explodeFx = null;
    this.root.clear();
    this.pieces = [];
    this.stickerMeshes = [];
    // Grid coordinates run -(n-1)..n-1 in steps of 2; scale to a ~2.6 unit cube.
    const s = 2.6 / (2 * n);
    this.root.scale.setScalar(s);
    const body = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const box = new THREE.BoxGeometry(1.96, 1.96, 1.96);
    const m = n - 1;
    for (let x = -m; x <= m; x += 2)
      for (let y = -m; y <= m; y += 2)
        for (let z = -m; z <= m; z += 2) {
          if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== m) continue;
          const mesh = new THREE.Mesh(box, body);
          mesh.position.set(x, y, z);
          this.addPiece(mesh);
        }
    const plane = new THREE.PlaneGeometry(1.7, 1.7);
    model(n).stickers.forEach((st, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: COLORS[st.face], roughness: 0.35 });
      const mesh = new THREE.Mesh(plane, mat);
      const [nx, ny, nz] = st.normal;
      mesh.position.set(st.pos[0] + nx * 0.99, st.pos[1] + ny * 0.99, st.pos[2] + nz * 0.99);
      mesh.lookAt(mesh.position.clone().add(new THREE.Vector3(nx, ny, nz)));
      mesh.userData.sticker = i;
      this.stickerMeshes.push(mesh);
      this.addPiece(mesh, new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2]));
    });
  }

  private addPiece(mesh: THREE.Object3D, grid = mesh.position.clone()) {
    mesh.updateMatrix();
    this.root.add(mesh);
    this.pieces.push({ mesh, grid: grid.clone(), home: mesh.matrix.clone(), homePos: mesh.position.clone(), delay: staggerDelay([grid.x, grid.y, grid.z]) });
  }

  // ---------- exploded view ----------
  private explode = new ExplodeController();
  private explodeFx: { group: THREE.Group; lines: { line: THREE.Line; home: THREE.Vector3; delay: number }[]; mats: THREE.Material[]; base: number[] } | null = null;
  private lastAmount = 0;
  private baseZoom = 1;
  onExplodeChange: (exploded: boolean) => void = () => {};

  /** True while exploded or moving: layer turns must wait. */
  get exploded() { return !this.explode.assembled; }

  /** Explode (true) or reassemble (false). Waits for queued turns to finish first. */
  async setExploded(on: boolean) {
    await this.idle();
    if (on && !this.explodeFx) this.buildExplodeFx();
    this.explode.set(on, matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.onExplodeChange(on);
  }

  get explodeTarget() { return this.explode.target; }

  /** Guide lines from each piece back to its home slot, ghost outlines of the slots, and a floor grid. */
  private buildExplodeFx() {
    const group = new THREE.Group();
    const accent = new THREE.Color('#8b5cf6'), cyan = new THREE.Color('#38e1ff');
    const lineMat = new THREE.LineDashedMaterial({ color: cyan, transparent: true, opacity: 0, dashSize: 0.18, gapSize: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    const ghostMat = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false });
    const dotMat = new THREE.PointsMaterial({ color: cyan, size: 0.22, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = this.n - 1;
    const lines: { line: THREE.Line; home: THREE.Vector3; delay: number }[] = [];
    const ghostGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.96, 1.96, 1.96));
    const homes: number[] = [];
    for (let x = -m; x <= m; x += 2) for (let y = -m; y <= m; y += 2) for (let z = -m; z <= m; z += 2) {
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== m) continue;
      const home = new THREE.Vector3(x, y, z);
      const geo = new THREE.BufferGeometry().setFromPoints([home.clone(), home.clone()]);
      const line = new THREE.Line(geo, lineMat);
      group.add(line);
      lines.push({ line, home, delay: staggerDelay([x, y, z]) });
      const ghost = new THREE.LineSegments(ghostGeo, ghostMat);
      ghost.position.copy(home);
      group.add(ghost);
      homes.push(x, y, z);
    }
    const dots = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(homes, 3)), dotMat);
    group.add(dots);
    const grid = new THREE.GridHelper(m * 6 + 8, (m * 6 + 8) / 2, accent, accent);
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true; gridMat.opacity = 0; gridMat.depthWrite = false;
    grid.position.y = -(m + 1) * (1 + 0.6) - 1.2;
    group.add(grid);
    this.root.add(group);
    this.explodeFx = { group, lines, mats: [lineMat, ghostMat, dotMat, gridMat], base: [0.9, 0.4, 0.95, 0.18] };
  }

  /** Per frame: place pieces and effects for the current explode amount. */
  private updateExplode() {
    const moving = this.explode.animating;
    const overall = this.explode.amount(0);
    if (!moving && overall === this.lastAmount) return;
    this.lastAmount = overall;
    // Pull the camera back as the pieces spread, so the exploded cube stays in frame.
    this.camera.zoom = this.baseZoom / (1 + EXPLODE_ZOOM_OUT * overall);
    this.camera.updateProjectionMatrix();
    const off = new THREE.Vector3();
    for (const p of this.pieces) {
      const a = this.explode.amount(p.delay);
      const [ox, oy, oz] = explodeOffset([p.grid.x, p.grid.y, p.grid.z], a);
      p.mesh.position.copy(p.homePos).add(off.set(ox, oy, oz));
    }
    const fx = this.explodeFx;
    if (!fx) return;
    fx.group.visible = overall > 0.001;
    fx.mats.forEach((m, i) => { (m as THREE.Material & { opacity: number }).opacity = fx.base[i] * overall; });
    for (const l of fx.lines) {
      const a = this.explode.amount(l.delay);
      const [ox, oy, oz] = explodeOffset([l.home.x, l.home.y, l.home.z], a);
      const pos = l.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(1, l.home.x + ox, l.home.y + oy, l.home.z + oz);
      pos.needsUpdate = true;
      l.line.computeLineDistances();
    }
  }

  private lastState: State | null = null;
  private lit: Set<number> | null = null;

  setState(state: State) {
    this.lastState = state;
    const dim = new THREE.Color('#3a3946');
    this.stickerMeshes.forEach((m, i) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.color.set(COLORS[state[i]]);
      if (this.lit && !this.lit.has(i)) mat.color.lerp(dim, 0.72);
      mat.emissive.set(this.lit?.has(i) ? 0x222222 : 0x000000);
    });
  }

  /**
   * Spotlight the stickers of the layers a turn moves (dimming the rest), or
   * clear the spotlight with null. Used by the notation lessons.
   */
  highlight(turn: Turn | null) {
    if (!turn) this.lit = null;
    else {
      const layers = new Set(turn.layers);
      this.lit = new Set();
      model(this.n).stickers.forEach((st, i) => { if (layers.has(st.pos[turn.axis])) this.lit!.add(i); });
    }
    if (this.lastState) this.setState(this.lastState);
  }

  /**
   * Animate one turn, then show `after`. Turns queue up and play in order;
   * a long queue (fast typing, playing a whole solution) speeds up so the
   * cube never lags far behind the model.
   */
  animate(turn: Turn, after: State, ms = 220): Promise<void> {
    // Safety net: the turn animation assumes pieces sit at home. If the cube
    // is exploded, show the new state without animating (the model stays right).
    if (this.exploded) { this.setState(after); return this.busy; }
    this.pending++;
    this.busy = this.busy.then(() => {
      const speedUp = Math.min(4, 1 + (this.pending - 1) * 0.5);
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      return this.play(turn, after, reduced ? 0 : ms / speedUp);
    }).finally(() => { this.pending--; });
    return this.busy;
  }

  get animating() { return this.pending > 0; }

  /** Resolves when every queued turn has finished animating. */
  idle(): Promise<void> { return this.busy; }

  private play(turn: Turn, after: State, ms: number): Promise<void> {
    const axis = new THREE.Vector3(...([0, 1, 2].map((a) => (a === turn.axis ? 1 : 0)) as [number, number, number]));
    const layers = new Set(turn.layers);
    const moving = this.pieces.filter((p) => layers.has(Math.round(p.grid.getComponent(turn.axis))));
    const pivot = new THREE.Group();
    this.root.add(pivot);
    moving.forEach((p) => pivot.attach(p.mesh));
    // Clockwise seen from +axis is a negative rotation; q = 3 is the short way round.
    const q = ((turn.q % 4) + 4) % 4;
    const angle = q === 3 ? Math.PI / 2 : -(q * Math.PI) / 2;
    const duration = ms * (q === 2 ? 1.4 : 1);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        const t = Math.min(1, (performance.now() - t0) / Math.max(1, duration));
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        pivot.setRotationFromAxisAngle(axis, angle * e);
        if (t < 1) return void requestAnimationFrame(tick);
        moving.forEach((p) => {
          this.root.attach(p.mesh);
          p.mesh.matrix.copy(p.home);
          p.mesh.matrix.decompose(p.mesh.position, p.mesh.quaternion, p.mesh.scale);
        });
        this.root.remove(pivot);
        this.setState(after);
        resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  get size() { return this.n; }

  private hitSticker(e: PointerEvent): number | null {
    const el = this.renderer.domElement;
    const r = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.root.children, false)[0];
    if (!hit) return null;
    if (hit.object.userData.sticker !== undefined) return hit.object.userData.sticker as number;
    // Hit the black plastic between stickers: use the nearest sticker, so
    // grabbing a seam still turns a layer instead of spinning the camera.
    let best: number | null = null, bestD = Infinity;
    for (const m of this.stickerMeshes) {
      const d = m.getWorldPosition(new THREE.Vector3()).distanceToSquared(hit.point);
      if (d < bestD) { bestD = d; best = m.userData.sticker as number; }
    }
    return best;
  }

  /** Grid coordinates -> screen pixels (relative to the canvas). */
  /** Spin the camera around the cube by a screen drag (used by Shift-drag). */
  orbitBy(dx: number, dy: number) {
    const el = this.renderer.domElement;
    const k = (2 * Math.PI) / Math.max(1, el.clientHeight);
    const offset = this.camera.position.clone().sub(this.controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta -= dx * k;
    sph.phi = Math.min(Math.PI - 0.05, Math.max(0.05, sph.phi - dy * k));
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(sph));
    this.camera.lookAt(this.controls.target);
  }

  private project = (p: Vec3): [number, number] => {
    const v = new THREE.Vector3(...p).applyMatrix4(this.root.matrixWorld).project(this.camera);
    const el = this.renderer.domElement;
    return [((v.x + 1) / 2) * el.clientWidth, ((1 - v.y) / 2) * el.clientHeight];
  };

  /**
   * Pointer input: a drag that starts on a sticker turns that layer; a drag
   * on the background orbits the camera; a tap on a sticker paints it in
   * paint mode. Works the same for mouse, pen and touch.
   */
  private listenForClicks() {
    // Listen on the host in the capture phase so a press on a sticker can be
    // claimed before OrbitControls (on the canvas) starts spinning the camera.
    const host = this.host;
    let start: { x: number; y: number; sticker: number; id: number } | null = null;
    let turned = false;
    let orbit: { x: number; y: number; id: number } | null = null;
    host.addEventListener('pointerdown', (e) => {
      // Overlays inside the viewport (buttons, cards) handle their own clicks.
      if (e.target !== this.renderer.domElement) return;
      // Right-drag: leave it to OrbitControls, which spins the view even over stickers.
      if (e.button === 2) return;
      // Shift-drag: spin the view from anywhere, even starting on a sticker.
      if (e.shiftKey && e.button === 0 && e.pointerType === 'mouse') {
        e.stopPropagation();
        orbit = { x: e.clientX, y: e.clientY, id: e.pointerId };
        host.setPointerCapture(e.pointerId);
        return;
      }
      // Exploded and not painting: any drag orbits the view.
      if (this.exploded && !this.paintMode) return;
      const sticker = this.hitSticker(e);
      if (sticker === null) return; // background: let OrbitControls orbit
      e.stopPropagation();
      start = { x: e.clientX, y: e.clientY, sticker, id: e.pointerId };
      turned = false;
      host.setPointerCapture(e.pointerId);
    }, { capture: true });
    host.addEventListener('pointermove', (e) => {
      if (orbit && orbit.id === e.pointerId) {
        e.stopPropagation();
        this.orbitBy(e.clientX - orbit.x, e.clientY - orbit.y);
        orbit.x = e.clientX; orbit.y = e.clientY;
        return;
      }
      if (!start || start.id !== e.pointerId) {
        if (e.buttons === 0) this.renderer.domElement.style.cursor = this.hitSticker(e) !== null ? (this.paintMode ? 'crosshair' : 'grab') : 'default';
        return;
      }
      e.stopPropagation();
      if (turned || this.paintMode || this.exploded) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < 12) return;
      const st = model(this.n).stickers[start.sticker];
      const turn = dragToTurn(st.pos, st.normal, [dx, dy], this.project);
      if (turn) {
        turned = true;
        this.onDragTurn(turn);
      }
    }, { capture: true });
    const end = (e: PointerEvent) => {
      if (orbit && orbit.id === e.pointerId) { orbit = null; e.stopPropagation(); return; }
      if (!start || start.id !== e.pointerId) return;
      e.stopPropagation();
      if (!turned && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8) this.onStickerClick(start.sticker);
      start = null;
    };
    host.addEventListener('pointerup', end, { capture: true });
    host.addEventListener('pointercancel', () => { start = null; orbit = null; }, { capture: true });
  }
}
