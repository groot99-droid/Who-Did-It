import { describe, expect, it } from 'vitest';
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
  for (const type of ['killed', 'clueFound', 'meetingRequest', 'sceneEnter', 'error', 'noise'] as const)
    feed.bus.on(type, () => events.push(type));
  return { feed, events };
}

describe('MockWorldFeed verbs', () => {
  it('refuses a kill in grace, as the server does (425)', () => {
    const { feed, events } = make();
    near(feed, 'mock-bot-1');
    feed.kill('mock-bot-1');
    expect(feed.bodies()).toHaveLength(0);
    expect(events).toContain('error');
  });

  it('a day-phase kill leaves a body, both trail clues and the Blood bit; the cooldown refuses a second', () => {
    const { feed } = make('?phase=day&bots=still');
    near(feed, 'mock-bot-1');
    feed.kill('mock-bot-1');
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
    feed.kill('mock-bot-2');
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
