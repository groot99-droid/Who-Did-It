import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TICK_RATE, TILE_PX } from '@wdi/shared/constants';
import { MockWorldFeed } from './worldMock';

// The mock world's verbs against a one-scene stand-in: no nav grids, so nobody collides.
const content = {
  navs: {},
  sceneIds: ['overworld'],
  scenes: {
    overworld: {
      id: 'overworld',
      portals: [{ id: 'ov.door', x: 10, y: 3, to: null, toSpawn: null, minProfile: 'small' }],
      spawns: Array.from({ length: 10 }, (_, i) => ({ id: `square_${i}`, x: 3 + i * 2, y: 5, facing: 's' })),
      props: [
        { id: 'ov.bell', kind: 'bell', x: 15, y: 15 },
        { id: 'ov.teaching_clue', kind: 'teachingClue', x: 20, y: 20 },
      ],
    },
  },
};

type Internals = { step(): void; actors: Map<string, { x: number; y: number }> };
const tickN = (feed: MockWorldFeed, n: number) => {
  for (let i = 0; i < n; i++) (feed as unknown as Internals).step();
};
/** The avatar handle a seat walks under now: Kill names a handle, never a seat id (GDD 3.17). */
const handleOf = (feed: MockWorldFeed, seat: string) => feed.avatars().find((a) => a.lookOf === seat)!.handle;
const near = (feed: MockWorldFeed, id: string) => {
  const a = (feed as unknown as Internals).actors;
  const target = a.get(id)!;
  const me = a.get(feed.selfId)!;
  me.x = target.x - TILE_PX;
  me.y = target.y;
};
function make(search = '') {
  (globalThis as { location?: unknown }).location = { search };
  const feed = new MockWorldFeed(content as never);
  const events: string[] = [];
  for (const type of [
    'killed',
    'clueFound',
    'meetingRequest',
    'sceneEnter',
    'error',
    'noise',
    'cutscene',
  ] as const)
    feed.bus.on(type, () => events.push(type));
  return { feed, events };
}

describe('MockWorldFeed verbs', () => {
  it('refuses a kill in grace, as the server does (425)', () => {
    const { feed, events } = make();
    near(feed, 'mock-bot-1');
    feed.kill(handleOf(feed, 'mock-bot-1'));
    expect(feed.bodies()).toHaveLength(0);
    expect(events).toContain('error');
  });

  it('a day-phase kill leaves a body, both trail clues and the Blood bit; the cooldown refuses a second', () => {
    const { feed } = make('?phase=day&bots=still');
    near(feed, 'mock-bot-1');
    feed.kill(handleOf(feed, 'mock-bot-1'));
    expect(feed.bodies()).toHaveLength(1);
    expect(feed.bodies()[0]).toMatchObject({ of: 'mock-bot-1', hidden: false });
    expect(
      feed
        .clues()
        .map((c) => c.kind)
        .sort(),
    ).toEqual([0, 0, 1]); // teaching + footprints + thread
    expect(feed.snapshot().find((p) => p.id === 'mock-bot-1')?.presence).toBeNull();
    expect(feed.snapshot().find((p) => p.id === feed.selfId)?.presence?.statusBits).toBe(2);
    near(feed, 'mock-bot-2');
    feed.kill(handleOf(feed, 'mock-bot-2'));
    expect(feed.bodies()).toHaveLength(1);
  });

  it('a 2 s hold on a clue writes one Notebook entry; releasing early writes none', () => {
    const { feed, events } = make('?bots=still');
    const teach = feed.clues().find((c) => c.id === 'clue_teaching')!;
    const me = (feed as unknown as Internals).actors.get(feed.selfId)!;
    me.x = teach.x;
    me.y = teach.y;
    feed.hold('collect', teach.id, true);
    tickN(feed, TICK_RATE);
    feed.hold('collect', teach.id, false);
    tickN(feed, TICK_RATE * 2);
    expect(feed.notebook()).toHaveLength(0);
    feed.hold('collect', teach.id, true);
    tickN(feed, TICK_RATE * 2 + 1);
    expect(feed.notebook()).toHaveLength(1);
    expect(feed.notebook()[0]).toMatchObject({ clueKind: 0, value: 2, status: 4 });
    expect(events).toContain('clueFound');
    feed.hold('collect', teach.id, true);
    expect(feed.notebook()).toHaveLength(1);
  });

  it('report and bell ask for a meeting only within reach; nothing else is emitted', () => {
    const { feed, events } = make('?phase=day&bots=still');
    feed.bell();
    expect(events).not.toContain('meetingRequest');
    const me = (feed as unknown as Internals).actors.get(feed.selfId)!;
    me.x = (15 + 0.5) * TILE_PX;
    me.y = (15 + 0.5) * TILE_PX;
    feed.bell();
    expect(events.filter((e) => e === 'meetingRequest')).toHaveLength(1);
    feed.reportBody('body_missing');
    expect(events.filter((e) => e === 'meetingRequest')).toHaveLength(1);
  });

  it('resume re-emits sceneEnter for the current scene', () => {
    const { feed, events } = make();
    feed.resume?.();
    expect(events).toContain('sceneEnter');
  });

  it('ghost mode is held in the feed', () => {
    expect(make('?ghost=1').feed.dead()).toBe(true);
    expect(make().feed.dead()).toBe(false);
  });
});

describe('MockWorldFeed cutscenes (?cutscene=1, GDD 3.18)', () => {
  // `start` runs the 20 Hz loop on `window.setInterval`; the node test environment has the timers on `globalThis`.
  beforeAll(() => void vi.stubGlobal('window', globalThis));
  afterAll(() => void vi.unstubAllGlobals());

  it('sends no opening by default', () => {
    const { feed, events } = make();
    feed.start();
    feed.dispose();
    expect(events).not.toContain('cutscene');
  });

  it('sends the HollowMere opening before the first sceneEnter', () => {
    const { feed, events } = make('?cutscene=1');
    feed.start();
    feed.dispose();
    expect(events.indexOf('cutscene')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('cutscene')).toBeLessThan(events.indexOf('sceneEnter'));
  });

  it('kills a ghost with its cutscene id once the World first reads the feed', () => {
    const { feed, events } = make('?cutscene=1&ghost=1');
    const killed: unknown[] = [];
    feed.bus.on('killed', (k) => killed.push(k));
    feed.start();
    expect(feed.dead()).toBe(false);
    feed.snapshot();
    feed.dispose();
    expect(feed.dead()).toBe(true);
    expect(events).toContain('killed');
    expect(killed[0]).toMatchObject({ cause: 'knife', cutsceneId: 'deathKnife' });
  });
});

describe('MockWorldFeed and quick mode', () => {
  it('stays the main-mode world whatever ?mode says: quick mode plays MockOnubFeed', () => {
    const { feed } = make('?mode=onub');
    expect(feed.mode()).toBe('main');
    expect(feed.clock().phase).toBe(2);
  });
});

describe('MockWorldFeed avatars and Impersonate (GDD 3.17)', () => {
  it('serves the own presence only, avatars for everyone in view, a look per seat and the own handle', () => {
    const { feed } = make('?bots=still');
    const snaps = feed.snapshot();
    expect(snaps.filter((p) => p.presence !== null).map((p) => p.id)).toEqual([feed.selfId]);
    expect(snaps.every((p) => p.look !== '')).toBe(true);
    const avatars = feed.avatars();
    expect(avatars).toHaveLength(7);
    expect(avatars.map((a) => a.handle)).toContain(feed.selfHandle());
    expect(new Set(avatars.map((a) => a.handle)).size).toBe(7);
    for (const a of avatars) expect(snaps.some((p) => p.id === a.handle)).toBe(false);
    expect(feed.coverState()).toEqual({ look: '', mates: {} });
  });

  it('refuses a seat id as a Kill target', () => {
    const { feed, events } = make('?phase=day&bots=still');
    near(feed, 'mock-bot-1');
    feed.kill('mock-bot-1');
    expect(feed.bodies()).toHaveLength(0);
    expect(events).toContain('error');
  });

  it('re-rolls the handles of a seat that crosses a door', () => {
    const { feed } = make('?bots=still');
    const before = feed.selfHandle();
    (feed as unknown as { place(b: unknown, scene: string, spawn: unknown): void }).place(
      (feed as unknown as Internals).actors.get(feed.selfId),
      'overworld',
      { x: 4, y: 4, facing: 's' },
    );
    expect(feed.selfHandle()).not.toBe(before);
  });

  it('an impersonation shows the borrowed face on the own avatar and re-rolls the handle', () => {
    const { feed } = make('?phase=day&bots=still');
    const before = feed.selfHandle();
    feed.ability('impersonate', 'mock-bot-2');
    expect(feed.selfHandle()).not.toBe(before);
    const mine = feed.avatars().find((a) => a.handle === feed.selfHandle())!;
    expect(mine.lookOf).toBe('mock-bot-2');
    expect(mine.height).toBe(feed.snapshot().find((p) => p.id === feed.selfId)!.traits.height);
    feed.ability('impersonate');
    expect(feed.avatars().find((a) => a.handle === feed.selfHandle())!.lookOf).toBe(feed.selfId);
  });

  it('a strike made in disguise drops it with one vfx that names nobody', () => {
    const { feed } = make('?phase=day&bots=still');
    const puffs: unknown[] = [];
    feed.bus.on('vfx', (m) => puffs.push(m));
    feed.ability('impersonate', 'mock-bot-2');
    near(feed, 'mock-bot-1');
    feed.kill(handleOf(feed, 'mock-bot-1'));
    expect(puffs).toHaveLength(1);
    expect(Object.keys(puffs[0] as object).sort()).toEqual(['kind', 'sceneId', 'x', 'y']);
    expect(feed.avatars().find((a) => a.handle === feed.selfHandle())!.lookOf).toBe(feed.selfId);
    near(feed, 'mock-bot-3');
    feed.kill(handleOf(feed, 'mock-bot-3')); // the knife rests: refused, and no second puff
    expect(puffs).toHaveLength(1);
  });

  it('a Last Shot aim opens one shot on a seat id and closes with its window', () => {
    const { feed } = make('?phase=day&bots=still');
    const aims: Array<{ endsTick: number }> = [];
    const errors: unknown[] = [];
    feed.bus.on('aim', (m) => aims.push(m));
    feed.bus.on('error', (e) => errors.push(e));
    feed.ability('lastShot', 'mock-bot-1'); // no aim open: refused
    expect(errors).toHaveLength(1);
    feed.openAim(1);
    expect(aims).toHaveLength(1);
    feed.ability('lastShot', feed.selfId); // not yourself
    expect(errors).toHaveLength(2);
    feed.ability('lastShot', 'mock-bot-1');
    feed.ability('lastShot', 'mock-bot-2'); // one shot only
    expect(errors).toHaveLength(3);
    feed.openAim(1);
    feed.ability('lastShot', 'mock-bot-1'); // already shot
    expect(errors).toHaveLength(4);
    tickN(feed, TICK_RATE + 1);
    feed.ability('lastShot', 'mock-bot-2'); // the window ran out
    expect(errors).toHaveLength(5);
  });
});
