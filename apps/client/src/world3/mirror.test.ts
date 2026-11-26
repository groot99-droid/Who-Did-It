import { describe, expect, it } from 'vitest';
import { toScreen } from '@wdi/shared/iso';
import type Phaser from 'phaser';
import { type BufferGeometry, type Mesh, type MeshBasicMaterial, Scene } from 'three';
import { PX_PER_UNIT, billboardYaw, unitsOfRise, unitsOfWidth } from './frame';
import { DECAL_LIFT, type MirrorKind, ViewMirror } from './mirror';

/** Round 11, R5: the Phaser views drawn in the sprite world. */

const CAM = 1; // the Phaser main camera's id bit
const FRAME = { cutX: 0, cutY: 0, cutWidth: 32, cutHeight: 48, realWidth: 32, realHeight: 48, x: 0, y: 0 };
/** A Phaser game object as the mirror reads it. */
type Fake = { type: string; visible: boolean; alpha: number; cameraFilter: number; [k: string]: unknown };
const base = (type: string, over: object = {}): Fake => {
  return { type, visible: true, alpha: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, cameraFilter: 0, ...over };
};
const frame = {
  ...FRAME,
  name: 'die/s/3',
  texture: { key: 'char_villager' },
  source: { image: { width: 256, height: 256 } },
};
const sprite = (over: object = {}) =>
  base('Sprite', { originX: 0.5, originY: 1, flipX: false, tintTopLeft: 0xffffff, frame, ...over });
const container = (list: unknown[], over: object = {}) => base('Container', { list, ...over });
/** A body as `BodyView` builds it: a shadow ellipse and its art, at the screen point of (640, 320). */
const body = () => {
  const s = toScreen(640, 320);
  return container(
    [
      base('Ellipse', { width: 54, height: 27, fillColor: 0x12141c, fillAlpha: 0.45 }),
      container([sprite()], { scaleX: 2, scaleY: 2 }),
    ],
    { x: s.x, y: s.y },
  );
};
const src = (o: unknown, kind: MirrorKind = 'upright') => ({ obj: o as Phaser.GameObjects.GameObject, kind });
const meshes = (scene: Scene) =>
  scene.children.flatMap((g) => g.children) as Array<Mesh<BufferGeometry, MeshBasicMaterial>>;

describe('the view mirror (R5)', () => {
  it('stands a body on the ground point its root is drawn at, on its shadow, at every heading', () => {
    for (const h of [0, 1, 2, 3] as const) {
      const scene = new Scene();
      const b = body();
      new ViewMirror(scene).sync([src(b)], billboardYaw(h), CAM);
      const g = scene.children[0]!;
      expect([g.position.x, g.position.y, g.position.z].map((n) => Math.round(n))).toEqual([640, 0, 320]);
      const [shadow, art] = meshes(scene);
      // The shadow lies flat: the world circle its screen ellipse is, at the pitch.
      expect(shadow!.rotation.x).toBeCloseTo(-Math.PI / 2);
      expect(shadow!.position.y).toBeCloseTo(DECAL_LIFT);
      expect(shadow!.scale.x).toBeCloseTo(27 / PX_PER_UNIT);
      expect(shadow!.material.opacity).toBeCloseTo(0.45);
      // The art stands facing the camera, at the scale Phaser draws it, and the Phaser camera skips the root.
      expect(art!.rotation.y).toBeCloseTo(billboardYaw(h));
      const pos = art!.geometry.getAttribute('position').array;
      expect((pos[3]! - pos[0]!) * PX_PER_UNIT).toBeCloseTo(64);
      expect(b.cameraFilter & CAM).toBe(CAM);
    }
  });

  it('turns a part beside the root with the camera: its offset runs across the screen at every yaw', () => {
    const scene = new Scene();
    const o = container([sprite({ x: 20, y: -30 })], toScreen(64, 64));
    const yaw = billboardYaw(2) + 0.3; // mid-turn too
    new ViewMirror(scene).sync([src(o)], yaw, CAM);
    const m = meshes(scene)[0]!;
    const across = unitsOfWidth(20);
    expect(m.position.x).toBeCloseTo(across * Math.cos(yaw));
    expect(m.position.z).toBeCloseTo(-across * Math.sin(yaw));
    expect(m.position.y).toBeCloseTo(unitsOfRise(30));
  });

  it('leaves a root it cannot draw on the Phaser canvas, and drops a root that is gone', () => {
    const scene = new Scene();
    const mirror = new ViewMirror(scene);
    // A giver without its art: a capsule and a name, left as it is drawn today.
    const ring = container([base('Rectangle'), base('Text')], { cameraFilter: CAM });
    const b = body();
    mirror.sync([src(ring), src(b)], 0, CAM);
    expect(ring.cameraFilter & CAM).toBe(0);
    expect(scene.children).toHaveLength(1);
    mirror.sync([], 0, CAM);
    expect(scene.children).toHaveLength(0);
  });

  it('draws what the view shows: a hidden root or part draws nothing, alpha and tint carry over', () => {
    const scene = new Scene();
    const mirror = new ViewMirror(scene);
    const b = body();
    b.visible = false;
    mirror.sync([src(b)], 0, CAM);
    expect(meshes(scene).every((m) => !m.visible)).toBe(true);
    expect(b.cameraFilter & CAM).toBe(CAM); // still skipped: the view hid it
    b.visible = true;
    b.alpha = 0.55;
    const art = ((b.list as Fake[])[1]!.list as Fake[])[0]!;
    art.tintTopLeft = 0xff0000;
    mirror.sync([src(b)], 0, CAM);
    const m = meshes(scene)[1]!;
    expect(m.visible).toBe(true);
    expect(m.material.opacity).toBeCloseTo(0.55);
    expect(m.material.transparent).toBe(true);
    expect(m.material.color.getHex()).toBe(0xff0000);
  });
});
