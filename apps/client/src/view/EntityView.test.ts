import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { AvatarSnap, PlayerSnap } from '../net/world';
import { StatusBit } from './animIds';

// PlayerView draws with Phaser; here it is a recorder, so the view's choices (who is drawn as what, at which
// height, under which key) are what is tested.
interface Made {
  name: string;
  look: { height: number; scarf: number; hat: number; lookId?: string };
  isSelf: boolean;
  pos: [number, number][];
  poses: [string, number, number | boolean][];
  destroyed: boolean;
  alpha: boolean;
  blood: boolean;
}
const made = vi.hoisted(() => [] as Made[]);
vi.mock('./PlayerView', () => ({
  dirFromYaw: () => 's',
  PlayerView: class {
    readonly root = {};
    private readonly rec: Made;
    constructor(_scene: unknown, name: string, look: Made['look'], isSelf: boolean) {
      this.rec = { name, look, isSelf, pos: [], poses: [], destroyed: false, alpha: false, blood: false };
      made.push(this.rec);
    }
    setPosition(x: number, y: number) {
      this.rec.pos.push([x, y]);
    }
    pose(dir: string, animId: number, status: number | boolean) {
      this.rec.poses.push([dir, animId, status]);
    }
    setBlood(on: boolean) {
      this.rec.blood = on;
    }
    setGhost(on: boolean) {
      this.rec.alpha = on;
    }
    destroy() {
      this.rec.destroyed = true;
    }
  },
}));

import { EntityView, MASK_GLYPH } from './EntityView';
import { figureName } from '../ui/copy';

const SELF = 'me';
const row = (id: string, name: string, scarf: number, hat: number, presence = false): PlayerSnap => ({
  id,
  name,
  traits: { height: 1, scarf, hat },
  alive: true,
  look: '',
  presence: presence ? { x: 100, y: 100, yaw: 0, animId: 0, statusBits: 0, transitUntilTick: 0 } : null,
});
const avatar = (handle: string, lookOf: string, over: Partial<AvatarSnap> = {}): AvatarSnap => ({
  handle,
  lookOf,
  height: 1,
  x: 120,
  y: 100,
  yaw: 0,
  animId: 0,
  statusBits: 0,
  transitUntilTick: 0,
  ...over,
});
const roster = [row(SELF, 'Me', 0, 0, true), row('a', 'Ann', 1, 1), row('k', 'Kay', 2, 2)];
const scene = { registry: { get: () => undefined } } as unknown as Phaser.Scene;

function view() {
  return new EntityView(scene, SELF, () => undefined);
}
const live = () => made.filter((m) => !m.destroyed);

beforeEach(() => {
  made.length = 0;
});

describe('EntityView (GDD 3.17)', () => {
  it('draws the own sprite from the own presence and skips the own handle among the avatars', () => {
    const v = view();
    v.update(roster, 0, [avatar('h-me', SELF), avatar('h-a', 'a')], 'h-me');
    expect(v.has(SELF)).toBe(true);
    expect(v.has('h-me')).toBe(false);
    expect(v.has('h-a')).toBe(true);
    expect(live().filter((m) => m.isSelf)).toHaveLength(1);
    expect(v.count).toBe(2);
  });

  it('draws a borrowed avatar as the roster row of lookOf at the avatar height, never the walker row', () => {
    const v = view();
    // Kay walks as Ann: her figure wears Ann's name, scarf and hat glyph, at Kay's own (Tall) height.
    v.update(roster, 0, [avatar('h-me', SELF), avatar('h-k', 'a', { height: 2 })], 'h-me');
    const drawn = live().find((m) => !m.isSelf)!;
    expect(drawn.name).toBe('Ann');
    expect(drawn.look).toEqual({ height: 2, scarf: 1, hat: 1 });
  });

  it("shows the own avatar's face and height on the own sprite", () => {
    const v = view();
    v.update(roster, 0, [avatar('h-me', 'a', { height: 0 })], 'h-me');
    const mine = live().find((m) => m.isSelf)!;
    expect(mine.name).toBe('Ann');
    expect(mine.look).toEqual({ height: 0, scarf: 1, hat: 1 });
  });

  it('a new handle at the same point replaces the sprite with no slide', () => {
    const v = view();
    v.update(roster, 0, [avatar('h-me', SELF), avatar('h-a', 'a')], 'h-me');
    const first = live().find((m) => m.name === 'Ann')!;
    v.update(roster, 50, [avatar('h-me', SELF), avatar('h-b', 'a')], 'h-me');
    expect(first.destroyed).toBe(true);
    const second = live().find((m) => m.name === 'Ann')!;
    expect(second).not.toBe(first);
    expect(v.has('h-a')).toBe(false);
    expect(v.has('h-b')).toBe(true);
    // The new sprite's first placed position is the avatar's own point, not a point on a path from elsewhere.
    expect(second.pos[0]).toEqual([120, 100]);
  });

  it('rebuilds a sprite whose face changed under the same handle', () => {
    const v = view();
    v.update(roster, 0, [avatar('h-me', SELF), avatar('h-x', 'a')], 'h-me');
    v.update(roster, 50, [avatar('h-me', SELF), avatar('h-x', 'k')], 'h-me');
    expect(
      live()
        .map((m) => m.name)
        .sort(),
    ).toEqual(['Kay', 'Me']);
  });

  it('draws the label of the admin views over the roster name, and rebuilds when it changes', () => {
    const text = { v: 'Ann: killer (as baker)' };
    const v = new EntityView(
      scene,
      SELF,
      () => undefined,
      (handle) => (handle === 'h-a' ? text.v : undefined),
    );
    v.update(roster, 0, [avatar('h-a', 'a'), avatar('h-k', 'k')], '');
    expect(
      live()
        .map((m) => m.name)
        .sort(),
    ).toEqual(['Ann: killer (as baker)', 'Kay', 'Me']);
    text.v = 'Ann: killer';
    v.update(roster, 50, [avatar('h-a', 'a'), avatar('h-k', 'k')], '');
    expect(
      live()
        .map((m) => m.name)
        .sort(),
    ).toEqual(['Ann: killer', 'Kay', 'Me']);
  });

  it('removes a sprite when its avatar leaves the scene', () => {
    const v = view();
    v.update(roster, 0, [avatar('h-me', SELF), avatar('h-a', 'a')], 'h-me');
    v.update(roster, 50, [avatar('h-me', SELF)], 'h-me');
    expect(v.has('h-a')).toBe(false);
    expect(v.count).toBe(1);
  });

  it("a ghost viewer's nameplate shows the true name, with the mask when the face is borrowed", () => {
    const v = view();
    v.setGhost(true);
    v.update(
      roster,
      0,
      [
        avatar('h-me', SELF),
        avatar('h-k', 'a', { seat: 'k', statusBits: 0 }),
        avatar('h-a', 'a', { seat: 'a' }),
      ],
      'h-me',
    );
    const names = live()
      .filter((m) => !m.isSelf)
      .map((m) => m.name)
      .sort();
    expect(names).toEqual([`${MASK_GLYPH} Kay`, 'Ann'].sort());
  });

  it('a living viewer never learns the true seat: without a seat the nameplate is the shown row', () => {
    const v = view();
    v.update(roster, 0, [avatar('h-me', SELF), avatar('h-k', 'a')], 'h-me');
    expect(live().find((m) => !m.isSelf)!.name).toBe('Ann');
  });

  it('draws a ghost avatar translucent and Blood only within sight', () => {
    const v = view();
    v.update(
      roster,
      0,
      [
        avatar('h-me', SELF),
        avatar('h-a', 'a', { statusBits: StatusBit.ghost | StatusBit.bloody }),
        avatar('h-k', 'k', { statusBits: StatusBit.bloody, x: 5000, y: 5000 }),
      ],
      'h-me',
    );
    const ann = live().find((m) => m.name === 'Ann')!;
    const kay = live().find((m) => m.name === 'Kay')!;
    expect(ann.alpha).toBe(true);
    expect(ann.blood).toBe(true);
    expect(kay.blood).toBe(false);
  });

  it('poses every sprite with the whole status word, so the view picks the gaits, loops and signs (motion.md 1)', () => {
    const v = view();
    const bits = StatusBit.limp | StatusBit.bleeding | StatusBit.transit;
    v.update(roster, 0, [avatar('h-me', SELF), avatar('h-a', 'a', { animId: 1, statusBits: bits })], 'h-me');
    const ann = live().find((m) => m.name === 'Ann')!;
    expect(ann.poses.at(-1)).toEqual(['s', 1, bits]);
    // Never the transit flag alone: the limp and the bleeding would be lost on the way to the view.
    expect(ann.poses.every(([, , status]) => typeof status === 'number')).toBe(true);
  });

  it('draws a villager figure with its look and its figure name, reading nothing from the roster', () => {
    const v = view();
    v.update(roster, 0, [avatar('h-c', 'villagerclerk', { height: 1 }), avatar('h-v', 'villager')], 'h-me');
    expect(v.has('h-c')).toBe(true);
    const names = live().map((m) => [m.name, m.look.lookId]);
    expect(names).toContainEqual([figureName('villagerclerk'), 'villagerclerk']);
    expect(names).toContainEqual([figureName('villager'), 'villager']);
    // A ghost viewer's mask needs a seat; a figure has none.
    v.setGhost(true);
    v.update(roster, 1, [avatar('h-c', 'villagerclerk')], 'h-me');
    expect(live().some((m) => m.name === figureName('villagerclerk'))).toBe(true);
  });

  it('draws nothing for a look that is neither a seat nor a figure', () => {
    const v = view();
    v.update(roster, 0, [avatar('h-x', 'sorcerer')], 'h-me');
    expect(v.has('h-x')).toBe(false);
  });

  it('skips an avatar whose roster row is unknown', () => {
    const v = view();
    v.update(roster, 0, [avatar('h-me', SELF), avatar('h-z', 'nobody')], 'h-me');
    expect(v.has('h-z')).toBe(false);
  });

  it('reads the avatars from the source when none are passed, and plays the vfx the feed emits', () => {
    let handler: ((m: { sceneId: string; x: number; y: number }) => void) | undefined;
    const source = {
      avatars: () => [avatar('h-me', SELF), avatar('h-a', 'a')],
      selfHandle: () => 'h-me',
      bus: {
        on: (_t: string, h: typeof handler) => (handler = h),
        off: () => (handler = undefined),
      },
    };
    const v = new EntityView(scene, SELF, () => source as never);
    v.update(roster, 0);
    expect(v.has('h-a')).toBe(true);
    const spy = vi.spyOn(v, 'playVfx').mockImplementation(() => undefined);
    handler?.({ sceneId: 'overworld', x: 7, y: 9 });
    expect(spy).toHaveBeenCalledWith(7, 9);
    v.destroy();
    expect(handler).toBeUndefined();
  });

  // Round 10 (A294): a patch's samples are stamped by the feed's tick, not by the frame that first showed them.
  describe('the sample clock', () => {
    const clocked = (tick: { n: number }) => ({
      avatars: () => [],
      selfHandle: () => '',
      clock: () => ({ tick: tick.n, phase: 1, phaseEndsTick: 0, startTick: 0, round: 0 }),
    });
    const walker = (x: number) => [avatar('h-me', SELF), avatar('h-a', 'a', { x })];

    it('stamps by the tick, so a late frame does not stretch the slide before it', () => {
      const tick = { n: 0 };
      const v = new EntityView(scene, SELF, () => clocked(tick) as never);
      v.setDelayMs(100);
      v.update(roster, 0, walker(0), 'h-me');
      tick.n = 1;
      v.update(roster, 50, walker(10), 'h-me');
      tick.n = 2;
      v.update(roster, 130, walker(20), 'h-me'); // the frame came 30 ms late
      v.update(roster, 200, walker(20), 'h-me'); // the same tick again: no new sample
      // Tick 2 is stamped 103 (50 ms after tick 1, plus a tenth of the 30 ms), not 130: at 100 the walker
      // is 50/53 of the way from 10 to 20.
      const a = made.find((m) => m.name === 'Ann')!;
      expect(a.pos[a.pos.length - 1]![0]).toBeCloseTo(10 + 10 * (50 / 53), 3);
    });

    it('without a clock (the admin and Studio views) the frame time stamps the sample', () => {
      const v = view();
      v.setDelayMs(100);
      v.update(roster, 0, walker(0), 'h-me');
      v.update(roster, 50, walker(10), 'h-me');
      v.update(roster, 130, walker(20), 'h-me');
      v.update(roster, 200, walker(20), 'h-me');
      const a = made.find((m) => m.name === 'Ann')!;
      expect(a.pos[a.pos.length - 1]![0]).toBeCloseTo(10 + 10 * (50 / 80), 3);
    });
  });
});
