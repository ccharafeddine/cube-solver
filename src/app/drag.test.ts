import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { dragToTurn } from './drag';
import { layerMove, model, turnToMove, type Vec3 } from '../cube/facelets';
import { formatMove } from '../cube/notation';

/** The app's default view: white on top, green in front, seen from up-front-right. */
function projector(eye: [number, number, number]) {
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  cam.position.set(...eye);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return (p: Vec3): [number, number] => {
    const v = new THREE.Vector3(...p).project(cam);
    return [(v.x + 1) * 400, (1 - v.y) * 400];
  };
}
const name = (t: NonNullable<ReturnType<typeof dragToTurn>>, n: number) =>
  formatMove(turnToMove(t, n) ?? layerMove(t, n));

describe('drag to turn', () => {
  it('names the expected move for drags on each visible face, sizes 2 to 7', () => {
    const project = projector([10, 12, 16].map((x) => x * 1.6) as [number, number, number]);
    for (let n = 2; n <= 7; n++) {
      const m = n - 1;
      // Right column of U, dragged toward the viewer (down the screen): R'.
      expect(name(dragToTurn([m, m, m], [0, 1, 0], [0, 30], project)!, n)).toBe("R'");
      // Same column, dragged away: R.
      expect(name(dragToTurn([m, m, -m], [0, 1, 0], [0, -30], project)!, n)).toBe('R');
      // Top row of F dragged left: U. Bottom row dragged right: D.
      expect(name(dragToTurn([0 * m, m, m], [0, 0, 1], [-30, 0], project)!, n)).toBe('U');
      expect(name(dragToTurn([0 * m, -m, m], [0, 0, 1], [30, 0], project)!, n)).toBe('D');
      // Front column of R dragged up: F'.
      expect(name(dragToTurn([m, 0 * m, m], [1, 0, 0], [0, -30], project)!, n)).toBe("F'");
    }
    // Inner layers get their own SiGN names.
    expect(name(dragToTurn([4, 6, 0], [0, 1, 0], [0, 30], project)!, 7)).toBe("2R'");
    expect(name(dragToTurn([0, 2, 6], [0, 0, 1], [-30, 0], project)!, 7)).toBe('3U');
    expect(name(dragToTurn([-1, 5, 3], [0, 1, 0], [0, 30], project)!, 6)).toBe("3L");
  });

  it('always turns the grabbed layer the way the drag goes, from any view, on every face', () => {
    const eyes: [number, number, number][] = [[16, 19, 26], [-20, 14, -22], [8, -24, 18], [-25, -10, 6], [3, 30, -4]];
    for (const eye of eyes) {
      const project = projector(eye);
      const cam = new THREE.Vector3(...eye);
      for (let n = 2; n <= 7; n++) {
        for (const st of model(n).stickers) {
          const p = new THREE.Vector3(...st.pos), nrm = new THREE.Vector3(...st.normal);
          if (cam.clone().sub(p).dot(nrm) <= 0) continue; // facing away: cannot be grabbed
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2 + 0.2;
            const drag: [number, number] = [Math.cos(a) * 30, Math.sin(a) * 30];
            const t = dragToTurn(st.pos, st.normal, drag, project);
            if (!t) continue;
            // The layer holds the grabbed sticker, and never the face it sits on.
            expect(t.layers).toEqual([st.pos[t.axis]]);
            expect(st.normal[t.axis]).toBe(0);
            // Rotate the sticker a little the way the turn goes (three.js: positive angle = counter-clockwise
            // from +axis, q = 3). Its slide along the face, seen on screen, follows the drag.
            const axis = new THREE.Vector3(0, 0, 0).setComponent(t.axis, 1);
            const sp = p.clone().add(nrm); // the sticker's spot on the surface
            const moved = sp.clone().applyAxisAngle(axis, (t.q === 1 ? -1 : 1) * 0.05);
            const slide = moved.sub(sp);
            const q = sp.clone().add(slide.sub(nrm.clone().multiplyScalar(slide.dot(nrm))));
            const s0 = project([sp.x, sp.y, sp.z]), s1 = project([q.x, q.y, q.z]);
            const dx = s1[0] - s0[0], dy = s1[1] - s0[1];
            expect((dx * drag[0] + dy * drag[1]) / (Math.hypot(dx, dy) * 30)).toBeGreaterThan(0.3);
          }
        }
      }
    }
  });
});
