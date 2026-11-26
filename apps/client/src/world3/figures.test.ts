import { describe, expect, it } from 'vitest';
import { type BufferGeometry, Mesh, type MeshBasicMaterial, Scene } from 'three';
import { PX_PER_UNIT, RISE_PX_PER_UNIT, billboardYaw } from './frame';
import { FigureMirror, type FigureSource, LAYER_STEP, quadOf } from './figures';

/** Round 11, R3: the figures in the sprite world, mirrored from the Phaser figure views. */

const FRAME = {
  cutX: 32,
  cutY: 64,
  cutWidth: 40,
  cutHeight: 80,
  realWidth: 40,
  realHeight: 80,
  x: 0,
  y: 0,
  imageWidth: 256,
  imageHeight: 512,
};

describe('a layer’s quad (R3)', () => {
  it('stands on the sprite’s origin at the size Phaser draws it', () => {
    const q = quadOf(FRAME, 0.5, 1, 2, false);
    const [l, t, , r, , , , b] = q.pos;
    expect((r! - l!) * PX_PER_UNIT).toBeCloseTo(80); // 40 px at scale 2
    expect((t! - b!) * RISE_PX_PER_UNIT).toBeCloseTo(160);
    expect(l).toBeCloseTo(-r!); // centred on the feet
    expect(b).toBeCloseTo(0); // feet on the ground
    expect(q.uv).toEqual([
      32 / 256,
      1 - 64 / 512,
      72 / 256,
      1 - 64 / 512,
      32 / 256,
      1 - 144 / 512,
      72 / 256,
      1 - 144 / 512,
    ]);
  });

  it('moves a trimmed crop by its offset, and flipX mirrors it about the origin', () => {
    const trimmed = { ...FRAME, realWidth: 60, realHeight: 100, x: 4, y: 20 };
    const q = quadOf(trimmed, 0.5, 1, 1, false);
    const s = PX_PER_UNIT;
    expect(q.pos[0]! * s).toBeCloseTo(-(30 - 4)); // the crop starts 4 px into a 60 px frame
    expect(q.pos[7]! * RISE_PX_PER_UNIT).toBeCloseTo(-0); // the crop's bottom is the frame's
    const f = quadOf(trimmed, 0.5, 1, 1, true);
    expect(f.pos[0]).toBeCloseTo(-q.pos[0]!);
    expect(f.pos[3]).toBeCloseTo(-q.pos[3]!);
    expect(f.uv).toEqual(q.uv);
  });
});

/** A Phaser sprite as the mirror reads it. */
function sprite(name: string, image: { width: number; height: number }, over: Record<string, unknown> = {}) {
  return {
    type: 'Sprite',
    visible: true,
    alpha: 1,
    scaleX: 1,
    originX: 0.5,
    originY: 1,
    flipX: false,
    tintTopLeft: 0xffffff,
    frame: { ...FRAME, name, texture: { key: name.split('/')[0] }, source: { image } },
    ...over,
  };
}
function figure(layers: unknown[], over: Partial<Record<string, unknown>> = {}) {
  const hidden = { art: true, shadow: true };
  return {
    hidden,
    src: {
      feet: { x: 640, y: 320 },
      hasArt: true,
      art: { list: layers, scaleX: 2, alpha: 1, setVisible: (v: boolean) => void (hidden.art = v) },
      shadow: { setVisible: (v: boolean) => void (hidden.shadow = v) },
      root: { visible: true, alpha: 1 },
      ...over,
    } as unknown as FigureSource,
  };
}
const meshes = (scene: Scene) =>
  scene.children.flatMap((g) => g.children) as Array<Mesh<BufferGeometry, MeshBasicMaterial>>;

describe('the figure mirror (R3)', () => {
  it('draws each layer of the Phaser figure at its feet, facing the camera, and hides the Phaser art', () => {
    const scene = new Scene();
    const mirror = new FigureMirror(scene);
    const atlas = { width: 256, height: 512 };
    const f = figure([sprite('char_baker/idle/se/0', atlas), sprite('ovl_baker/idle/se/0', atlas)]);
    mirror.sync([f.src], billboardYaw(1));
    const g = scene.children[0]!;
    expect([g.position.x, g.position.y, g.position.z]).toEqual([640, 0, 320]);
    expect(g.rotation.y).toBeCloseTo(billboardYaw(1));
    const [body, over] = meshes(scene);
    expect(over!.position.z - body!.position.z).toBe(LAYER_STEP); // each layer a step in front of the last
    // The mirror draws the frame the Phaser sprite shows and chooses no look of its own.
    expect(body!.material.map!.image).toBe(atlas);
    const want = quadOf({ ...FRAME }, 0.5, 1, 2, false).pos;
    expect([...body!.geometry.getAttribute('position').array]).toEqual(want.map((n) => Math.fround(n)));
    expect(f.hidden).toEqual({ art: false, shadow: false });
  });

  it('a ghost is translucent, a hidden layer is not drawn, a figure without art stays on the Phaser canvas', () => {
    const scene = new Scene();
    const mirror = new FigureMirror(scene);
    const atlas = { width: 256, height: 512 };
    const ghost = figure(
      [sprite('char_a/idle/s/0', atlas), sprite('ovl_a/hat/s/0', atlas, { visible: false })],
      {
        root: { visible: true, alpha: 0.45 },
      },
    );
    const bare = figure([], { hasArt: false });
    mirror.sync([ghost.src, bare.src], 0);
    expect(scene.children).toHaveLength(1);
    expect(bare.hidden).toEqual({ art: true, shadow: true });
    const [body, hat] = meshes(scene);
    expect(body!.material.transparent).toBe(true);
    expect(body!.material.opacity).toBeCloseTo(0.45);
    expect(hat!.visible).toBe(false);
  });

  it('stands a figure on a blob shadow the size of the Phaser shadow it hides (R4)', () => {
    const scene = new Scene();
    const made: number[] = [];
    const mirror = new FigureMirror(scene, (r) => {
      made.push(r);
      const m = new Mesh();
      m.name = 'blob';
      return m;
    });
    const f = figure([sprite('char_a/idle/s/0', { width: 256, height: 512 })], {
      shadow: { displayWidth: 40, setVisible: () => undefined },
    });
    mirror.sync([f.src], 0);
    mirror.sync([f.src], 0);
    expect(made).toEqual([40 / 2 / PX_PER_UNIT]); // once per figure, not per frame
    expect(scene.children[0]!.children.filter((c) => c.name === 'blob')).toHaveLength(1);
  });

  it('drops a figure that is gone, and follows a frame change', () => {
    const scene = new Scene();
    const mirror = new FigureMirror(scene);
    const atlas = { width: 256, height: 512 };
    const s = sprite('char_a/walk/s/0', atlas);
    const f = figure([s]);
    mirror.sync([f.src], 0);
    s.frame = { ...s.frame, name: 'char_a/walk/s/1', cutX: 72 };
    mirror.sync([f.src], 0);
    expect(meshes(scene)[0]!.geometry.getAttribute('uv').array[0]).toBeCloseTo(72 / 256);
    mirror.sync([], 0);
    expect(scene.children).toHaveLength(0);
  });
});
