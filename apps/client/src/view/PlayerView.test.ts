import type Phaser from 'phaser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimId, StatusBit } from './animIds';
import { PlayerView } from './PlayerView';
import { RUN_SPEED_PX } from './poses';

// The loader module pulls in Phaser, which does not load under node; PlayerView reaches it through a dynamic import.
const loadLazyLook = vi.fn();
vi.mock('./assets', () => ({ loadLazyLook }));

// PlayerView on a fake scene (motion.md 1, 4): which animation keys each clip plays, the four-direction rounding,
// the fallbacks of a look without the round-8 clips, the speed-picked gait and the sign marks per status bit.

/** A game object that records what the view asks of it; every setter chains. */
class Fake {
  calls: string[] = [];
  visible = true;
  alpha = 1;
  x = 0;
  y = 0;
  anims = { currentFrame: { index: 1 } };
  children: Fake[] = [];
  constructor(readonly kind: string) {}
  setVisible(v: boolean) {
    this.visible = v;
    return this;
  }
  setTint(t: number) {
    this.calls.push(`tint ${t.toString(16)}`);
    return this;
  }
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  play(a: { key: string; startFrame: number }) {
    this.calls.push(`play ${a.key}@${a.startFrame}`);
    return this;
  }
  add(o: Fake | Fake[]) {
    this.children.push(...(Array.isArray(o) ? o : [o]));
    return this;
  }
  destroy() {
    this.calls.push('destroy');
  }
  setScale() {
    return this;
  }
  setOrigin() {
    return this;
  }
  setAngle() {
    return this;
  }
  setDepth() {
    return this;
  }
  setAlpha(a: number) {
    this.alpha = a;
    return this;
  }
  setColor() {
    return this;
  }
  setStroke() {
    return this;
  }
  setStrokeStyle() {
    return this;
  }
}

interface Scene {
  made: Fake[];
  tweens: string[];
  anims: Set<string>;
  now: number;
  /** How many objects the constructor made; the rest are sign marks. */
  base: number;
  scene: Phaser.Scene;
}

function scene(animKeys: string[], textures = ['char_detective', 'ovl_detective']): Scene {
  const made: Fake[] = [];
  const tweens: string[] = [];
  const anims = new Set(animKeys);
  const make = (kind: string) => () => {
    const f = new Fake(kind);
    made.push(f);
    return f;
  };
  const s = {
    made,
    tweens,
    anims,
    now: 0,
    base: 0,
    scene: {
      add: {
        ellipse: make('ellipse'),
        sprite: make('sprite'),
        text: make('text'),
        rectangle: make('rectangle'),
        container: (_x: number, _y: number, kids: Fake[]) => make('container')().add(kids),
      },
      textures: { exists: (k: string) => textures.includes(k) },
      anims: { exists: (k: string) => anims.has(k) },
      time: {
        get now() {
          return s.now;
        },
      },
      tweens: {
        add: (cfg: { targets: unknown }) => tweens.push(`add ${(cfg.targets as Fake).kind ?? 'object'}`),
        killTweensOf: () => tweens.push('kill'),
      },
    } as unknown as Phaser.Scene,
  };
  return s;
}

const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
const FOUR = ['ne', 'se', 'sw', 'nw'] as const;
const V1 = ['idle', 'walk', 'swing', 'interact', 'die'];
const R8_EIGHT = ['run', 'strike', 'hurt'];
const R8_FOUR = [
  'limp',
  'stagger',
  'knockdown',
  'down',
  'getup',
  'stunned',
  'inspect',
  'threaten',
  'cower',
  'fidget',
  'stomp',
  'eat',
  'rob',
];
/** Every key a round-8 look has: the V1 five and the gaits in 8 directions, the one-shots in 4, three passes. */
const keysOf = (clips: string[]) =>
  ['char', 'scarf', 'blood'].flatMap((pass) =>
    clips.flatMap((c) => (R8_FOUR.includes(c) ? FOUR : DIRS).map((d) => `${pass}/detective/${c}/${d}`)),
  );
const look = { lookId: 'detective', height: 1, scarf: 0, hat: 2 };
const body = (s: Scene) => s.made.find((f) => f.kind === 'sprite')!;
const played = (s: Scene) =>
  body(s)
    .calls.filter((c) => c.startsWith('play'))
    .map((c) => c.slice(5));
const marks = (s: Scene, kind?: string) => s.made.slice(s.base).filter((f) => !kind || f.kind === kind);
const build = (s: Scene) => {
  const v = new PlayerView(s.scene, 'Ada', look, false);
  s.base = s.made.length;
  return v;
};

describe('PlayerView (motion.md 1)', () => {
  let s: Scene;
  let view: PlayerView;
  beforeEach(() => {
    s = scene(keysOf([...V1, ...R8_EIGHT, ...R8_FOUR]));
    view = build(s);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    loadLazyLook.mockClear();
  });

  for (const clip of [...R8_EIGHT, ...R8_FOUR]) {
    const id = AnimId[clip as keyof typeof AnimId];
    it(`plays ${clip} in step on the body and the scarf`, () => {
      const bits =
        clip === 'down'
          ? StatusBit.down
          : clip === 'stunned'
            ? StatusBit.stunned
            : clip === 'limp'
              ? StatusBit.limp
              : clip === 'stagger'
                ? StatusBit.fatigued
                : 0;
      const sent =
        clip === 'run' || clip === 'limp' || clip === 'stagger'
          ? AnimId.walk
          : clip === 'down' || clip === 'stunned'
            ? AnimId.idle
            : id;
      if (clip === 'run') {
        s.now = 0;
        view.setPosition(0, 0);
        s.now = 100;
        view.setPosition(0, RUN_SPEED_PX * 0.2);
        s.now = 200;
        view.setPosition(0, RUN_SPEED_PX * 0.4);
      }
      view.pose('se', sent, bits);
      expect(played(s)).toEqual([`char/detective/${clip}/se@0`]);
      const scarf = s.made.filter((f) => f.kind === 'sprite')[1]!;
      expect(scarf.calls).toContain(`play scarf/detective/${clip}/se@0`);
    });
  }

  it('rounds a straight facing to the diagonal for a four-direction clip and keeps it for an eight', () => {
    view.pose('n', AnimId.inspect, 0);
    view.pose('w', AnimId.strike, 0);
    expect(played(s)).toEqual(['char/detective/inspect/ne@0', 'char/detective/strike/w@0']);
  });

  it('falls back on a look rendered before round 8', () => {
    s = scene(keysOf(V1));
    view = build(s);
    view.pose('se', AnimId.strike, 0);
    view.pose('se', AnimId.walk, StatusBit.limp);
    view.pose('se', AnimId.idle, StatusBit.down);
    view.pose('se', AnimId.rob, 0);
    expect(played(s)).toEqual([
      'char/detective/swing/se@0',
      'char/detective/walk/se@0',
      'char/detective/die/se@0',
      'char/detective/interact/se@0',
    ]);
  });

  it('asks for the lazy pair once when a look lacks a rare clip, and never without a loader', async () => {
    // A V1 look wants `rob`: the fallback plays now, assets.ts fetches char_<look>_2 (SPRITES 3, A161).
    s = scene(keysOf(V1));
    view = build(s);
    view.pose('se', AnimId.rob, 0);
    view.pose('se', AnimId.idle, StatusBit.down);
    expect(loadLazyLook).not.toHaveBeenCalled();
    const load = { start: vi.fn(), once: vi.fn() };
    s = scene(keysOf(V1));
    (s.scene as unknown as { load: unknown }).load = load;
    view = build(s);
    view.pose('se', AnimId.walk, StatusBit.limp);
    expect(loadLazyLook).not.toHaveBeenCalled();
    view.pose('se', AnimId.rob, 0);
    view.pose('se', AnimId.eat, 0);
    await vi.waitFor(() => expect(loadLazyLook).toHaveBeenCalledTimes(1));
    expect(loadLazyLook).toHaveBeenCalledWith(s.scene, 'detective');
    expect(played(s)).toEqual([
      'char/detective/walk/se@0',
      'char/detective/interact/se@0',
      'char/detective/idle/se@0',
    ]);
  });

  it('keeps the frame when only the direction changes and restarts on a new clip', () => {
    view.pose('se', AnimId.walk, 0);
    body(s).anims.currentFrame.index = 5;
    view.pose('sw', AnimId.walk, 0);
    view.pose('sw', AnimId.hurt, 0);
    expect(played(s)).toEqual([
      'char/detective/walk/se@0',
      'char/detective/walk/sw@4',
      'char/detective/hurt/sw@0',
    ]);
  });

  it('takes a plain boolean as the transit flag alone', () => {
    view.pose('se', AnimId.walk, true);
    const plate = s.made.find((f) => f.kind === 'text')!;
    expect(plate.visible).toBe(false);
    view.pose('se', AnimId.walk, false);
    expect(plate.visible).toBe(true);
    expect(played(s)).toEqual(['char/detective/walk/se@0']);
  });

  it('counts a teleport as standing still', () => {
    s.now = 0;
    view.setPosition(0, 0);
    s.now = 100;
    view.setPosition(500, 0);
    view.pose('se', AnimId.walk, 0);
    expect(played(s)).toEqual(['char/detective/walk/se@0']);
  });

  describe('the signs', () => {
    it('draws the blood pass with a drip trail and a red tick while bleeding, and clears them', () => {
      view.pose('se', AnimId.idle, StatusBit.bleeding);
      const blood = s.made.filter((f) => f.kind === 'sprite')[3]!;
      expect(blood.visible).toBe(true);
      expect(blood.calls).toContain('play blood/detective/idle/se@0');
      expect(marks(s, 'rectangle')).toHaveLength(1);
      expect(marks(s, 'ellipse')).toHaveLength(3);
      expect(s.tweens.filter((t) => t === 'add ellipse')).toHaveLength(3);
      view.pose('se', AnimId.idle, 0);
      expect(blood.visible).toBe(false);
      expect(marks(s).every((m) => m.calls.includes('destroy'))).toBe(true);
    });

    it('keeps the blood pass up for a Bloody figure after the bleeding stops', () => {
      view.setBlood(true);
      view.pose('se', AnimId.idle, StatusBit.bleeding);
      view.pose('se', AnimId.idle, 0);
      expect(s.made.filter((f) => f.kind === 'sprite')[3]!.visible).toBe(true);
    });

    it('casts the body green while poisoned', () => {
      view.pose('se', AnimId.idle, StatusBit.poisoned);
      expect(body(s).calls).toContain('tint 5fc266');
      view.pose('se', AnimId.idle, 0);
      expect(body(s).calls.at(-1)).toBe('tint ffffff');
    });

    it('orbits three stars while dazed and flickers four sparks while stunned', () => {
      view.pose('se', AnimId.idle, StatusBit.dazed);
      expect(marks(s, 'text')).toHaveLength(3);
      expect(s.tweens).toContain('add object');
      view.pose('se', AnimId.idle, StatusBit.stunned);
      expect(s.tweens).toContain('kill');
      expect(marks(s, 'rectangle').filter((m) => !m.calls.includes('destroy'))).toHaveLength(4);
      expect(s.tweens.filter((t) => t === 'add rectangle')).toHaveLength(4);
    });

    it('draws each sign as a static mark under reduced motion', () => {
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      view.pose('se', AnimId.idle, StatusBit.bleeding | StatusBit.dazed | StatusBit.stunned);
      expect(s.tweens).toEqual([]);
      expect(marks(s, 'ellipse')).toHaveLength(1);
      expect(marks(s, 'text')).toHaveLength(3);
    });
  });
});
