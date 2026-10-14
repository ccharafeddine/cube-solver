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
import { model, type State, type Turn } from '../cube/facelets';

export const COLORS = ['#ffffff', '#c41e3a', '#009e60', '#ffd500', '#ff5800', '#0051ba'];
export const COLOR_NAMES = ['White', 'Red', 'Green', 'Yellow', 'Orange', 'Blue'];

interface Piece { mesh: THREE.Object3D; grid: THREE.Vector3; home: THREE.Matrix4 }

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
  onStickerClick: (index: number) => void = () => {};

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(4.2, 3.6, 5.6);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 14;
    this.scene.add(this.root, new THREE.AmbientLight(0xffffff, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(5, 8, 6);
    this.scene.add(sun);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.listenForClicks();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  resetView() {
    this.camera.position.set(4.2, 3.6, 5.6);
    this.controls.target.set(0, 0, 0);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Rebuild meshes for an n x n cube. */
  build(n: number) {
    this.n = n;
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
    this.pieces.push({ mesh, grid: grid.clone(), home: mesh.matrix.clone() });
  }

  setState(state: State) {
    this.stickerMeshes.forEach((m, i) => (m.material as THREE.MeshStandardMaterial).color.set(COLORS[state[i]]));
  }

  /** Animate one turn, then show `after`. Turns queue up and play in order. */
  animate(turn: Turn, after: State, ms = 220): Promise<void> {
    this.busy = this.busy.then(() => this.play(turn, after, ms));
    return this.busy;
  }

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

  private listenForClicks() {
    const el = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      // A drag rotates the view; only a near-stationary click paints.
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObjects(this.stickerMeshes)[0];
      if (hit) this.onStickerClick(hit.object.userData.sticker as number);
    });
  }
}
