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
import { CUBE_SIZE, cubeRadius, fitDistance, along, MIN_DISTANCE, MAX_ZOOM_OUT } from './framing';
import { SCENE_SKINS, type SceneSkin } from '../theme/skins';
import { ExplodeController, explodeOffset, staggerDelay, spreadFor, explodeExtent, MECH, AXES, capPosition, footOffset, MECH3, foot3 } from './explode';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const COLORS = ['#ffffff', '#c41e3a', '#009e60', '#ffd500', '#ff5800', '#0051ba'];
export const COLOR_NAMES = ['White', 'Red', 'Green', 'Yellow', 'Orange', 'Blue'];

interface Piece { mesh: THREE.Object3D; grid: THREE.Vector3; home: THREE.Matrix4; homePos: THREE.Vector3; delay: number }

export class CubeView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
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
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    // Right-drag always spins the view (panning is off, so the right button is free).
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.sun.position.set(5, 8, 6);
    this.rim.position.set(-6, 3, -7);
    this.scene.add(this.root, this.ambient, this.sun, this.sky, this.rim);
    this.applySkin(this.skin);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    // The first load uses exactly the reset framing.
    this.resetView();
    this.listenForClicks();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.updateExplode();
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Camera back to the standard view: slightly above, front-right corner toward you. */
  // ---------- skin: lights and materials ----------
  private ambient = new THREE.AmbientLight(0xffffff, 2.2);
  private sun = new THREE.DirectionalLight(0xffffff, 1.2);
  private sky = new THREE.HemisphereLight(0xbfe6ff, 0x203040, 0);
  private rim = new THREE.DirectionalLight(0x9ee7ff, 0);
  private skin: SceneSkin = SCENE_SKINS.matte.light;
  private bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });

  /** Apply a skin's lighting and material finish (colours of stickers never change). */
  applySkin(p: SceneSkin) {
    this.skin = p;
    this.ambient.intensity = p.ambient;
    this.sun.intensity = p.key;
    this.sky.color.set(p.sky);
    this.sky.intensity = p.skyIntensity;
    this.rim.color.set(p.rim);
    this.rim.intensity = p.rimIntensity;
    this.bodyMat.color.set(p.body);
    this.bodyMat.roughness = p.bodyRoughness;
    for (const m of this.stickerMeshes) {
      const mat = m.material as THREE.MeshPhysicalMaterial;
      mat.roughness = p.stickerRoughness;
      mat.clearcoat = p.stickerClearcoat;
      mat.clearcoatRoughness = p.stickerClearcoatRoughness;
    }
  }

  resetView() {
    this.fit = this.fitFor(this.camera.aspect);
    this.controls.target.set(0, 0, 0);
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(...along(DEFAULT_CAMERA, this.fit));
    this.camera.lookAt(0, 0, 0);
    // Close enough to go inside the cube and inspect the mechanism.
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = this.fit * MAX_ZOOM_OUT;
    // Clear any damping momentum so the view stays exactly where it was put.
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
  }

  /** Fitted camera distance for the current aspect (same for every cube size). */
  private fit = 0;
  /** Camera distance from the orbit target (for checks and tests). */
  get cameraDistance() { return this.camera.position.distanceTo(this.controls.target); }

  private fitFor(aspect: number) { return fitDistance(cubeRadius(), this.camera.fov, aspect); }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep the cube framed when the window changes shape: scale the distance
    // by the new fit, so a user's own zoom level is kept proportionally.
    const fit = this.fitFor(w / h);
    if (this.fit > 0) {
      const off = this.camera.position.clone().sub(this.controls.target);
      this.camera.position.copy(this.controls.target).add(off.multiplyScalar(fit / this.fit));
      this.controls.maxDistance = fit * MAX_ZOOM_OUT;
    }
    this.fit = fit;
    this.baseZoom = 1;
    this.camera.zoom = this.baseZoom / this.explodeZoom(this.lastAmount);
    this.camera.updateProjectionMatrix();
  }

  /** Rebuild meshes for an n x n cube. */
  build(n: number) {
    this.n = n;
    this.lit = null;
    this.explode.set(false, true);
    this.explodeFx = null;
    this.mech = null;
    this.root.clear();
    this.pieces = [];
    this.stickerMeshes = [];
    // Grid coordinates run -(n-1)..n-1 in steps of 2; scale to a ~2.6 unit cube.
    const s = CUBE_SIZE / (2 * n);
    this.root.scale.setScalar(s);
    const body = this.bodyMat;
    const box = new THREE.BoxGeometry(1.96, 1.96, 1.96);
    const m = n - 1;
    for (let x = -m; x <= m; x += 2)
      for (let y = -m; y <= m; y += 2)
        for (let z = -m; z <= m; z += 2) {
          if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== m) continue;
          const isCentre = [x, y, z].filter((v) => v !== 0).length === 1;
          // Fixed centres of odd cubes are hollow shells (seen when exploded); everything else is a solid block.
          const mesh = n % 2 === 1 && isCentre ? this.centreShell([Math.sign(x), Math.sign(y), Math.sign(z)] as Vec3) : new THREE.Mesh(box, body);
          mesh.position.set(x, y, z);
          this.addPiece(mesh);
        }
    const plane = new THREE.PlaneGeometry(1.7, 1.7);
    model(n).stickers.forEach((st, i) => {
      const mat = new THREE.MeshPhysicalMaterial({ color: COLORS[st.face], roughness: this.skin.stickerRoughness,
        clearcoat: this.skin.stickerClearcoat, clearcoatRoughness: this.skin.stickerClearcoatRoughness });
      const mesh = new THREE.Mesh(plane, mat);
      const [nx, ny, nz] = st.normal;
      mesh.position.set(st.pos[0] + nx * 0.99, st.pos[1] + ny * 0.99, st.pos[2] + nz * 0.99);
      mesh.lookAt(mesh.position.clone().add(new THREE.Vector3(nx, ny, nz)));
      mesh.userData.sticker = i;
      this.stickerMeshes.push(mesh);
      this.addPiece(mesh, new THREE.Vector3(st.pos[0], st.pos[1], st.pos[2]));
    });
    if (n === 2) this.buildMechanism();
    if (n === 3) this.buildMechanism3();
    if (n > 3) this.buildMechanismBig(n);
  }

  /**
   * A 3x3 centre: a flat outer plate (the covered cap recess is folded into
   * it, so no circle ever shows on the face), four side walls, open toward the
   * core, and an inner tube the core arm enters. Being one piece, it moves
   * rigidly. Local +y points outward; ~100 triangles.
   */
  private metalMat = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.35, metalness: 0.9 });
  private screwGeo: THREE.BufferGeometry[] | null = null;

  /** A 3x3 centre screw with its spring: head at the local origin, shaft and spring running toward the core (-y). */
  private screwAssembly(): THREE.Group {
    const M = MECH3;
    if (!this.screwGeo) {
      const shaft = new THREE.CylinderGeometry(0.07, 0.07, M.screwLength, 8);
      shaft.translate(0, -M.screwLength / 2, 0);
      const head = new THREE.CylinderGeometry(0.2, 0.2, M.screwHeadHeight, 16);
      const turns = 6, pts: THREE.Vector3[] = [];
      for (let i = 0; i <= turns * 16; i++) {
        const t = i / (turns * 16), ang = t * turns * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(ang) * 0.16, -0.06 - t * M.springLength, Math.sin(ang) * 0.16));
      }
      this.screwGeo = [shaft, head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 16, 0.028, 6, false)];
    }
    const g = new THREE.Group();
    for (const geo of this.screwGeo) g.add(new THREE.Mesh(geo, this.metalMat));
    return g;
  }

  private centreShell(dir: Vec3): THREE.Group {
    const M = MECH3, body = this.bodyMat, h = 0.98, face = 0.97;
    const g = new THREE.Group();
    // A flat, solid outer plate: the cap is folded into it (on a real cube it sits flush in a covered recess).
    const base = new THREE.Mesh(new THREE.BoxGeometry(2 * h, M.plate, 2 * h), body);
    base.position.y = face - M.plate / 2;
    const wallH = h + face - M.plate, wy = -h + wallH / 2;
    const xw = new THREE.BoxGeometry(M.wall, wallH, 2 * h), zw = new THREE.BoxGeometry(2 * h - 2 * M.wall, wallH, M.wall);
    const walls = [[h - M.wall / 2, 0, xw], [-(h - M.wall / 2), 0, xw], [0, h - M.wall / 2, zw], [0, -(h - M.wall / 2), zw]] as const;
    g.add(base);
    for (const [wx, wz, geo] of walls) { const w = new THREE.Mesh(geo, body); w.position.set(wx, wy, wz); g.add(w); }
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(M.tubeRadius, M.tubeRadius, M.tubeLength, 16, 1, true), body);
    tube.position.y = face - M.plate - M.tubeLength / 2;
    // Screw and spring live in the tube and travel with the centre as one unit.
    const screw = this.screwAssembly();
    screw.position.y = M.screwHead - 2;
    g.add(tube, screw);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir));
    return g;
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

  /** Zoom-out factor for an explode amount, so the spread pieces stay in frame. */
  private explodeZoom(a: number) { return 1 + (explodeExtent(this.n) * 1.04 - 1) * a; }

  private mech: { group: THREE.Group; caps: { obj: THREE.Object3D; dir: Vec3; dist?: (a: number) => number; delay?: number }[]; feet: THREE.Object3D[] } | null = null;

  /**
   * The inside of a real 2x2, revealed when exploded: six thin spindles meeting at the centre (no core block), with six
   * axle arms, a hidden centre cap on each arm held by a screw and spring,
   * and an inner foot on every corner. Matte grey plastic, ~4k triangles.
   */
  private buildMechanism() {
    // Mid grey with a faint self-glow so it still reads against the dark exploded backdrop.
    const plastic = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.72, metalness: 0.02, emissive: 0x1c2430 });
    const darker = new THREE.MeshStandardMaterial({ color: 0x5c636c, roughness: 0.8, emissive: 0x141a22 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.35, metalness: 0.9 });
    const group = new THREE.Group();
    group.visible = false;
    // No core block: six spindles along the face axes meet at the centre.
    const armGeo = new THREE.CylinderGeometry(MECH.armRadius * 1.3, MECH.armRadius * 0.6, MECH.armLength, 10);
    armGeo.translate(0, MECH.armLength / 2, 0);
    const capGeo = new RoundedBoxGeometry(MECH.capRadius * 1.5, MECH.capThickness, MECH.capRadius * 1.5, 2, 0.08);
    const capRing = new THREE.CylinderGeometry(MECH.capRadius * 0.42, MECH.capRadius * 0.42, MECH.capThickness * 1.3, 20);
    const screwGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.05, 8);
    const headGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16);
    // A coil spring: a helix tube around the screw.
    const turns = 5, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= turns * 16; i++) {
      const t = i / (turns * 16), ang = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(ang) * 0.14, MECH.springInner + t * (MECH.springOuter - MECH.springInner), Math.sin(ang) * 0.14));
    }
    const springGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 16, 0.025, 6, false);
    const caps: { obj: THREE.Object3D; dir: Vec3 }[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const dir of AXES) {
      const q = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(...dir));
      const arm = new THREE.Mesh(armGeo, darker);
      arm.quaternion.copy(q);
      const spring = new THREE.Mesh(springGeo, metal);
      spring.quaternion.copy(q);
      group.add(arm, spring);
      // The cap carries its screw (head on the outside).
      const cap = new THREE.Group();
      cap.quaternion.copy(q);
      cap.add(new THREE.Mesh(capGeo, plastic), new THREE.Mesh(capRing, darker));
      const screw = new THREE.Mesh(screwGeo, metal);
      screw.position.y = -0.4;
      const head = new THREE.Mesh(headGeo, metal);
      head.position.y = MECH.capThickness * 0.65 + 0.04;
      cap.add(screw, head);
      group.add(cap);
      caps.push({ obj: cap, dir });
    }
    // The 2x2 spreads far, so the mechanism is drawn larger to stay the centre of attention.
    group.scale.setScalar(1.35);
    this.root.add(group);
    // Corner feet: part of each corner piece, so they turn and explode with it.
    const stemGeo = new THREE.CylinderGeometry(0.22, 0.3, MECH.footStem, 12);
    const padGeo = new RoundedBoxGeometry(MECH.footPad, MECH.footPad * 0.55, MECH.footPad, 2, 0.1);
    const feet: THREE.Object3D[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const home: Vec3 = [x, y, z];
      const inward = new THREE.Vector3(-x, -y, -z).normalize();
      const foot = new THREE.Group();
      const [fx, fy, fz] = footOffset(home);
      foot.position.set(x + fx, y + fy, z + fz);
      foot.quaternion.setFromUnitVectors(up, inward.clone().negate());
      const stem = new THREE.Mesh(stemGeo, plastic);
      stem.position.y = MECH.footStem / 2;
      const pad = new THREE.Mesh(padGeo, plastic);
      foot.add(stem, pad);
      foot.visible = false;
      this.addPiece(foot, new THREE.Vector3(x, y, z));
      feet.push(foot);
    }
    this.mech = { group, caps, feet };
  }

  /**
   * The inside of a real 3x3, revealed when exploded: the fixed core and arms,
   * the arms the hollow centres (with their screws and springs) slide off,
   * and the inner feet of every edge and corner. Edges and
   * corners have no holes; only centres are screwed down. ~6k triangles.
   */
  private buildMechanism3() {
    const plastic = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.72, metalness: 0.02, emissive: 0x1c2430 });
    const darker = new THREE.MeshStandardMaterial({ color: 0x5c636c, roughness: 0.8, emissive: 0x141a22 });
    const M = MECH3, up = new THREE.Vector3(0, 1, 0);
    const group = new THREE.Group();
    group.visible = false;
    group.add(new THREE.Mesh(new THREE.SphereGeometry(M.coreRadius, 24, 16), darker));
    const armGeo = new THREE.CylinderGeometry(M.armRadius, M.armRadius * 1.2, M.armLength, 14);
    armGeo.translate(0, M.armLength / 2, 0);
    for (const dir of AXES) {
      const q = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(...dir));
      const arm = new THREE.Mesh(armGeo, darker);
      arm.quaternion.copy(q);
      group.add(arm);
    }
    this.root.add(group);
    // Feet: part of each edge and corner, so they turn and explode with it.
    const stemGeo = new THREE.CylinderGeometry(0.18, 0.24, 1, 10);
    stemGeo.translate(0, 0.5, 0);
    const edgePadGeo = new RoundedBoxGeometry(0.9, 0.3, 0.55, 2, 0.08);
    const cornerPadGeo = new RoundedBoxGeometry(0.6, 0.3, 0.6, 2, 0.08);
    const feet: THREE.Object3D[] = [];
    for (let x = -2; x <= 2; x += 2) for (let y = -2; y <= 2; y += 2) for (let z = -2; z <= 2; z += 2) {
      const nz = [x, y, z].filter((v) => v !== 0).length;
      if (nz < 2) continue;
      const home: Vec3 = [x, y, z];
      const { inner, pad } = foot3(home);
      const foot = new THREE.Group();
      foot.position.set(...pad);
      const outward = new THREE.Vector3(...home).normalize();
      foot.quaternion.setFromUnitVectors(up, outward);
      const stem = new THREE.Mesh(stemGeo, plastic);
      stem.scale.y = new THREE.Vector3(...inner).distanceTo(new THREE.Vector3(...pad)) + 0.15;
      const padMesh = new THREE.Mesh(nz === 3 ? cornerPadGeo : edgePadGeo, plastic);
      foot.add(stem, padMesh);
      foot.visible = false;
      this.addPiece(foot, new THREE.Vector3(x, y, z));
      feet.push(foot);
    }
    this.mech = { group, caps: [], feet };
  }

  /**
   * Big-cube mechanism, shown when exploded (see PLAN.md, big-cube decisions).
   * Even cubes (4x4, 6x6): a spherical core; every piece has a foot ending
   * in a curved pad that rides on the sphere, and the centres are tracked by
   * it, so nothing has a fixed centre. Odd cubes (5x5, 7x7): a 3x3-style core,
   * a small hub with six arms out to the fixed centre-centres (hollow shells
   * with their screw and spring inside), and the same curved feet elsewhere.
   */
  private buildMechanismBig(n: number) {
    const plastic = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.72, metalness: 0.02, emissive: 0x1c2430 });
    const darker = new THREE.MeshStandardMaterial({ color: 0x5c636c, roughness: 0.8, emissive: 0x141a22 });
    const up = new THREE.Vector3(0, 1, 0);
    const odd = n % 2 === 1, m = n - 1;
    const group = new THREE.Group();
    group.visible = false;
    // The core fits inside the hollow left by the outer layer (half-width n - 2).
    const coreR = odd ? 0.9 : 0.92 * (n - 2);
    group.add(new THREE.Mesh(new THREE.SphereGeometry(coreR, 32, 20), darker));
    if (odd) {
      const armLen = m - 0.9;
      const armGeo = new THREE.CylinderGeometry(0.22, 0.28, armLen, 14);
      armGeo.translate(0, armLen / 2, 0);
      for (const dir of AXES) {
        const arm = new THREE.Mesh(armGeo, darker);
        arm.quaternion.setFromUnitVectors(up, new THREE.Vector3(...dir));
        group.add(arm);
      }
    } else {
      // Tracks: a raised ring around the sphere's equator on each axis, which the centre feet ride in.
      const ring = new THREE.TorusGeometry(coreR * 0.995, 0.06, 6, 48);
      for (const rot of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]] as const) {
        const r = new THREE.Mesh(ring, plastic);
        r.rotation.set(rot[0], rot[1], rot[2]);
        group.add(r);
      }
    }
    this.root.add(group);
    // Feet: each piece (but the fixed centres) reaches in to the core with a curved pad, part of the piece.
    const stemGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 8);
    stemGeo.translate(0, 0.5, 0);
    // A curved pad: a spherical cap, concave toward the core.
    const padGeo = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, 0.32);
    const feet: THREE.Object3D[] = [];
    for (let x = -m; x <= m; x += 2) for (let y = -m; y <= m; y += 2) for (let z = -m; z <= m; z += 2) {
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== m) continue;
      if (odd && [x, y, z].filter((v) => v !== 0).length === 1) continue;
      const home = new THREE.Vector3(x, y, z);
      const outward = home.clone().normalize();
      // The piece's inner face, toward the core, and the core surface below it.
      const innerD = home.length() - 1, padD = Math.max(coreR + 0.12, 0.5);
      const foot = new THREE.Group();
      foot.position.copy(outward.clone().multiplyScalar(padD));
      foot.quaternion.setFromUnitVectors(up, outward);
      const stem = new THREE.Mesh(stemGeo, plastic);
      stem.scale.y = Math.max(0.1, innerD - padD);
      const pad = new THREE.Mesh(padGeo, plastic);
      pad.scale.setScalar(padD);
      pad.position.y = -padD;
      foot.add(stem, pad);
      foot.visible = false;
      this.addPiece(foot, home);
      feet.push(foot);
    }
    this.mech = { group, caps: [], feet };
  }

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
    const gsize = Math.ceil(m * (1 + spreadFor(this.n)) * 4 + 10);
    const grid = new THREE.GridHelper(gsize, gsize / 2, accent, accent);
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true; gridMat.opacity = 0; gridMat.depthWrite = false;
    grid.position.y = -(m * (1 + spreadFor(this.n)) + 1) - 1.2;
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
    this.camera.zoom = this.baseZoom / this.explodeZoom(overall);
    this.camera.updateProjectionMatrix();
    const off = new THREE.Vector3();
    for (const p of this.pieces) {
      const a = this.explode.amount(p.delay);
      const [ox, oy, oz] = explodeOffset([p.grid.x, p.grid.y, p.grid.z], a, spreadFor(this.n));
      p.mesh.position.copy(p.homePos).add(off.set(ox, oy, oz));
    }
    if (this.mech) {
      const show = overall > 0.002;
      this.mech.group.visible = show;
      for (const f of this.mech.feet) f.visible = show;
      for (const c of this.mech.caps) {
        const a = this.explode.amount(c.delay ?? 0);
        if (c.dist) { const d = c.dist(a); c.obj.position.set(c.dir[0] * d, c.dir[1] * d, c.dir[2] * d); continue; }
        const [x, y, z] = capPosition(c.dir, a);
        c.obj.position.set(x, y, z);
      }
    }
    const fx = this.explodeFx;
    if (!fx) return;
    fx.group.visible = overall > 0.001;
    fx.mats.forEach((m, i) => { (m as THREE.Material & { opacity: number }).opacity = fx.base[i] * overall; });
    for (const l of fx.lines) {
      const a = this.explode.amount(l.delay);
      const [ox, oy, oz] = explodeOffset([l.home.x, l.home.y, l.home.z], a, spreadFor(this.n));
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
