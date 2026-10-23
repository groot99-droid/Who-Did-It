import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import type { NodeSnap } from '../net/world';
import { nodeBreakKey, nodeChange } from './m5bFrames';
import { NodeView } from './NodeView';

/** A sprite that records what the view asks of it and finishes its animation when told to. */
class FakeSprite {
  calls: string[] = [];
  private done: Array<() => void> = [];
  setScale() {
    return this;
  }
  setDepth() {
    return this;
  }
  setFrame(f: string) {
    this.calls.push(`frame ${f}`);
    return this;
  }
  play(k: string) {
    this.calls.push(`play ${k}`);
    return this;
  }
  playReverse(k: string) {
    this.calls.push(`reverse ${k}`);
    return this;
  }
  stop() {
    return this;
  }
  once(_e: string, fn: () => void) {
    this.done.push(fn);
    return this;
  }
  finish() {
    const fns = this.done;
    this.done = [];
    for (const fn of fns) fn();
  }
  destroy() {}
}

function fakeScene(withBreak: boolean) {
  const sprites: FakeSprite[] = [];
  const scene = {
    textures: { exists: () => true, get: () => ({ has: () => true }) },
    anims: { exists: (k: string) => withBreak && k.endsWith('/break') },
    add: {
      sprite: () => {
        const s = new FakeSprite();
        sprites.push(s);
        return s;
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, sprites };
}

const node = (active: boolean): NodeSnap => ({ id: 'n1', resource: 'tinOre', x: 64, y: 64, active });

describe('NodeView breaks (motion.md 2, round 8 8G)', () => {
  it('chooses break, regrow or a cut', () => {
    expect(nodeChange(false, true, false)).toBe('break');
    expect(nodeChange(true, true, false)).toBe('regrow');
    expect(nodeChange(false, true, true)).toBe('cut');
    expect(nodeChange(false, false, false)).toBe('cut');
    expect(nodeBreakKey('tinOre')).toBe('node_tin_ore/break');
  });

  it('plays the break as the active flag falls and rests on spent; regrows in reverse to ready', () => {
    const { scene, sprites } = fakeScene(true);
    const view = new NodeView(scene, () => false);
    view.update([node(true)], 0);
    const s = sprites[0]!;
    view.update([node(false)], 0);
    expect(s.calls).toEqual(['play node_tin_ore/break']);
    s.finish();
    expect(s.calls.at(-1)).toBe('frame node_tin_ore/spent');
    view.update([node(true)], 0);
    expect(s.calls.at(-1)).toBe('reverse node_tin_ore/break');
    s.finish();
    expect(s.calls.at(-1)).toBe('frame node_tin_ore/ready');
  });

  it('does not rest on a stale frame when the flag flips back mid-break', () => {
    const { scene, sprites } = fakeScene(true);
    const view = new NodeView(scene, () => false);
    view.update([node(true)], 0);
    view.update([node(false)], 0);
    view.update([node(true)], 0);
    sprites[0]!.finish();
    expect(sprites[0]!.calls.filter((c) => c.startsWith('frame'))).toEqual(['frame node_tin_ore/ready']);
  });

  it('cuts to the frame under reduced motion or without the break art', () => {
    for (const [withBreak, reduced] of [
      [true, true],
      [false, false],
    ] as const) {
      const { scene, sprites } = fakeScene(withBreak);
      const view = new NodeView(scene, () => reduced);
      view.update([node(true)], 0);
      view.update([node(false)], 0);
      expect(sprites[0]!.calls).toEqual(['frame node_tin_ore/spent']);
    }
  });
});
