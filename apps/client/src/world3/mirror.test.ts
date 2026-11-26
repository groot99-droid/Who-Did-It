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
/** A clue as `ClueView` builds it in a `decalHolder`: a glow and a print at world offsets. */
const clue = (theta: number) => {
  const glow = base('Arc', { radius: 44, fillColor: 0x40a0a0, fillAlpha: 0.25 });
  const print = sprite({ x: 10, y: -5, rotation: theta, scaleX: 0.5 });
  const inner = container([glow, print], { rotation: Math.PI / 4, scaleX: Math.SQRT2, scaleY: Math.SQRT2 });
  return container([inner], { ...toScreen(256, 512), scaleY: 0.5 });
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
    // A hold ring: a `Graphics` the mirror cannot draw, left as it is drawn today.
    const ring = container([base('Rectangle'), base('Graphics')], { cameraFilter: CAM });
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

  it('lays a clue flat at its world offsets and rotation, the same at every heading', () => {
    const theta = Math.PI / 2;
    for (const h of [0, 3] as const) {
      const scene = new Scene();
      new ViewMirror(scene).sync([src(clue(theta), 'decal')], billboardYaw(h), CAM);
      const g = scene.children[0]!;
      expect([Math.round(g.position.x), Math.round(g.position.z)]).toEqual([256, 512]);
      const [glow, print] = meshes(scene);
      expect([glow!.scale.x, glow!.scale.y]).toEqual([44, 44]); // world px
      expect(glow!.position.y).toBeCloseTo(DECAL_LIFT);
      expect([print!.position.x, print!.position.z]).toEqual([10, -5]);
      expect(print!.position.y).toBeGreaterThan(glow!.position.y); // each part over the last
      expect(print!.rotation.z).toBeCloseTo(-theta);
      const pos = print!.geometry.getAttribute('position').array;
      expect(pos[3]! - pos[0]!).toBeCloseTo(16); // 32 px at scale 0.5, in world px
    }
  });

  it('stands a greybox disc or block where the Phaser one stood, at its size on screen', () => {
    const scene = new Scene();
    // A creature without art (MobView): a 30 x 22 disc 10 px up; a capsule (a body without art): a 14 x 40 block.
    const mob = base('Ellipse', {
      ...toScreen(128, 128),
      width: 30,
      height: 22,
      fillColor: 0x8a5a3a,
      fillAlpha: 0.95,
    });
    const block = container([
      base('Rectangle', { y: -20, width: 14, height: 40, fillColor: 0x6f7a8c, fillAlpha: 1 }),
    ]);
    new ViewMirror(scene).sync([src(mob), src(block)], billboardYaw(1), CAM);
    const [disc, rect] = meshes(scene);
    expect(disc!.rotation.y).toBeCloseTo(billboardYaw(1)); // standing, not lying
    expect([disc!.scale.x, disc!.scale.y]).toEqual([unitsOfWidth(15), unitsOfRise(11)]);
    expect(disc!.material.color.getHex()).toBe(0x8a5a3a);
    expect([rect!.scale.x, rect!.scale.y]).toEqual([unitsOfWidth(14), unitsOfRise(40)]);
    expect(rect!.position.y).toBeCloseTo(unitsOfRise(20));
    expect(mob.cameraFilter & CAM).toBe(CAM);
  });

  it('draws a figure’s nameplate and marks over everything, and uploads a text again when it changes', () => {
    const scene = new Scene();
    const canvas = { width: 80, height: 20 };
    const plateFrame = { ...FRAME, cutWidth: 80, cutHeight: 20, realWidth: 80, realHeight: 20 };
    const textFrame = { ...plateFrame, name: '__BASE', texture: { key: 'text1' }, source: { image: canvas } };
    const plate = base('Text', {
      y: -60,
      originX: 0.5,
      originY: 1,
      text: '◆ Hana',
      style: { color: '#fff' },
    });
    plate.frame = textFrame;
    const tick = base('Rectangle', {
      y: -50,
      width: 10,
      height: 10,
      rotation: Math.PI / 4,
      fillColor: 1,
      fillAlpha: 1,
    });
    // The sprite world draws the art and the shadow itself (R3) and hides them here.
    const art = container([sprite()], { visible: false });
    const fig = container([base('Ellipse', { visible: false }), art, tick, plate], toScreen(64, 64));
    const mirror = new ViewMirror(scene);
    mirror.sync([src(fig, 'label')], billboardYaw(2), CAM);
    const [t, p] = meshes(scene);
    expect(meshes(scene)).toHaveLength(2);
    expect(t!.rotation.z).toBeCloseTo(-Math.PI / 4); // the tick's diamond
    expect(p!.material.depthTest).toBe(false);
    expect(p!.renderOrder).toBeGreaterThanOrEqual(1000);
    expect(p!.position.y).toBeCloseTo(unitsOfRise(60));
    expect(fig.cameraFilter & CAM).toBe(CAM);
    const tex = p!.material.map!;
    const v = tex.version;
    mirror.sync([src(fig, 'label')], billboardYaw(2), CAM);
    expect(tex.version).toBe(v); // unchanged: not uploaded again
    plate.text = '◆ Hana (bloodied)';
    mirror.sync([src(fig, 'label')], billboardYaw(2), CAM);
    expect(p!.material.map).toBe(tex);
    expect(tex.version).toBeGreaterThan(v);
  });
});
