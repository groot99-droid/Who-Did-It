// Round 8, 8G (granted): StaticView.setFrame, the frame swap of one static drawn from art (an HQ station's tier).
import { describe, expect, it, vi } from 'vitest';
import type { StaticDef } from './statics';

/** A sprite that keeps its frame and reports a height by frame (px above its pivot). */
class FakeSprite {
  visible = true;
  originY = 1;
  displayHeight = 0;
  frame = { name: '' };
  constructor(
    readonly texture: { has: (f: string) => boolean; get: (f: string) => { customPivot: boolean } },
    frame: string,
  ) {
    this.setFrame(frame);
  }
  setFrame(name: string) {
    this.frame = { name };
    this.displayHeight = name === 'tall' ? 200 : 40;
    return this;
  }
  setScale = () => this;
  setDepth = () => this;
  setOrigin = () => this;
  setAlpha = () => this;
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  /** Wide enough to cover any viewer, so only `occluder` decides the fade. */
  getBounds = () => ({ x: -5000, y: -5000, width: 10000, height: 10000 });
}
vi.mock('phaser', () => ({ default: { GameObjects: { Sprite: FakeSprite } } }));

const { StaticView } = await import('./StaticView');

const FRAMES = new Set(['short', 'tall']);
const texture = { has: (f: string) => FRAMES.has(f), get: () => ({ customPivot: true }) };
const sprites: FakeSprite[] = [];
const scene = {
  textures: { exists: (k: string) => k === 'props', get: () => texture },
  add: {
    sprite: (_x: number, _y: number, _atlas: string, frame: string) => {
      const s = new FakeSprite(texture, frame);
      sprites.push(s);
      return s;
    },
  },
};

const def = (id: string, atlas = 'props'): StaticDef => ({
  id,
  atlas,
  frame: 'short',
  x: 96,
  y: 160,
  depthX: 96,
  depthY: 160,
  bias: 0,
  tilesW: 1,
  tilesH: 1,
  heightPx: 40,
  occluder: false,
  autoOccluder: true,
});

describe('StaticView.setFrame', () => {
  it('swaps the frame, says where the static stands, and lets the new art decide whether it hides you', () => {
    const view = new StaticView(scene as never);
    view.set([def('bk.hq_ovens')]);
    const sprite = sprites.at(-1)!;
    const alpha = vi.spyOn(sprite, 'setAlpha');
    const near = { x: 64, y: 128 };
    const all = { x: -1000, y: -1000, width: 2000, height: 2000 };
    view.update(near, 0.1, all);
    expect(alpha).not.toHaveBeenCalled();
    expect(view.setFrame('bk.hq_ovens', 'tall')).toEqual({ x: 96, y: 160 });
    expect(sprite.frame.name).toBe('tall');
    // Standing just behind it, the short site never hid you; the tall tier now does.
    view.update(near, 0.1, all);
    expect(alpha).toHaveBeenCalled();
  });

  it('leaves an unknown id and a frame the atlas lacks alone', () => {
    const view = new StaticView(scene as never);
    view.set([def('bk.hq_ovens')]);
    expect(view.setFrame('nope', 'tall')).toBeNull();
    expect(view.setFrame('bk.hq_ovens', 'prop_missing')).toBeNull();
    expect(sprites.at(-1)!.frame.name).toBe('short');
  });
});
