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
  x = 0;
  y = 0;
  destroyed = false;
  destroy() {
    this.destroyed = true;
  }
}

function fakeScene(withBreak: boolean) {
  const sprites: FakeSprite[] = [];
  const scene = {
    textures: { exists: () => true, get: () => ({ has: () => true }) },
    anims: { exists: (k: string) => withBreak && k.endsWith('/break') },
    /** The viewer sees x below 500. */
    cameras: { main: { worldView: { contains: (x: number) => x < 500 } } },
    add: {
      sprite: (x: number, y: number) => {
        const s = new FakeSprite();
        s.x = x;
        s.y = y;
        sprites.push(s);
        return s;
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, sprites };
}

const node = (active: boolean): NodeSnap => ({ id: 'n1', resource: 'tinOre', x: 64, y: 64, active });
const coins: NodeSnap = { id: 'coins.0', resource: 'coins', x: 64, y: 64, active: true };
const tree: NodeSnap = { id: 'n2', resource: 'timber', x: 96, y: 64, active: true };

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

  it('sweeps up a coins heap the server removed: the break plays once where it lay, then the sprite goes', () => {
    expect(nodeBreakKey('coins')).toBe('node_coins/break');
    const { scene, sprites } = fakeScene(true);
    const view = new NodeView(scene, () => false);
    view.update([coins, tree], 0);
    view.update([tree], 0);
    expect(view.has('coins.0')).toBe(false);
    expect(sprites[0]!.calls).toEqual(['play node_coins/break']);
    expect(sprites[0]!.destroyed).toBe(false);
    sprites[0]!.finish();
    expect(sprites[0]!.destroyed).toBe(true);
  });

  it('removes a node at once under reduced motion, and a sweep still playing goes with the view', () => {
    const reduced = fakeScene(true);
    const quiet = new NodeView(reduced.scene, () => true);
    quiet.update([coins, tree], 0);
    quiet.update([tree], 0);
    expect(reduced.sprites[0]!.calls).toEqual([]);
    expect(reduced.sprites[0]!.destroyed).toBe(true);
    const moving = fakeScene(true);
    const view = new NodeView(moving.scene, () => false);
    view.update([coins, tree], 0);
    view.update([tree], 0);
    view.destroy();
    expect(moving.sprites[0]!.destroyed).toBe(true);
  });

  it('plays no break when the heap leaves with a scene change, a feed reset, or off screen', () => {
    const cases: Array<[string, NodeSnap[], NodeSnap[]]> = [
      // The portal fade: the feed already carries the next scene's nodes, none of the old ones.
      ['scene change', [coins, tree], [{ ...tree, id: 'n9' }]],
      // A reconnect: the feed empties, then refills.
      ['feed reset', [coins, tree], []],
      // A heap the viewer could not see.
      ['off screen', [{ ...coins, x: 900 }, tree], [tree]],
    ];
    for (const [name, before, after] of cases) {
      const { scene, sprites } = fakeScene(true);
      const view = new NodeView(scene, () => false);
      view.update(before, 0);
      view.update(after, 0);
      expect(sprites[0]!.calls, name).toEqual([]);
      expect(sprites[0]!.destroyed, name).toBe(true);
    }
  });
});
