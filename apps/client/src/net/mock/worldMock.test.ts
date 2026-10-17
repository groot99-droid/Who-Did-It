import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import bakeryJson from '@wdi/content/data/scenes/bakery.json';
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

describe('MockWorldFeed quick mode (?mode=onub)', () => {
  const bakery = {
    id: 'bakery',
    portals: [],
    spawns: [{ id: 'door', x: 8, y: 9, facing: 'n' }],
    props: bakeryJson.props,
  };
  const qcontent = { ...content, scenes: { ...content.scenes, bakery } };
  function quick(search = '') {
    (globalThis as { location?: unknown }).location = { search: `?mode=onub&bots=still${search}` };
    const feed = new MockWorldFeed(qcontent as never);
    const events: string[] = [];
    for (const type of ['nightWake', 'nightSleep', 'nightReveal', 'meetingRequest', 'error'] as const)
      feed.bus.on(type, () => events.push(type));
    const me = (feed as unknown as Internals).actors.get(feed.selfId)!;
    return { feed, events, me };
  }
  const spot = (id: string) => bakeryJson.props.find((p) => p.id === id)!;
  const stand = (me: { x: number; y: number }, id: string) => {
    me.x = (spot(id).x + 0.5) * TILE_PX;
    me.y = (spot(id).y + 0.5) * TILE_PX;
  };

  it('reports the mode, lists seven plates with their owners and the dead loaves', () => {
    const { feed } = quick();
    expect(feed.mode()).toBe('onub');
    const plates = feed.props().filter((p) => p.kind === 'plate');
    expect(plates).toHaveLength(7);
    expect(plates[0]).toMatchObject({ id: 'bk.plate_0', of: feed.selfId });
    expect(feed.props().filter((p) => p.kind === 'deadLoaf')).toHaveLength(onubBalance.deadLoaves);
    expect(make().feed.mode()).toBe('main');
  });

  it('plays dusk, sleep, one window with a reveal, sleep and then the dawn meeting request', () => {
    const { feed, events, me } = quick('&window=cutpurse');
    expect(feed.clock().phase).toBe(4);
    expect(feed.snapshot().filter((p) => p.presence !== null)).toHaveLength(7);
    tickN(feed, onubBalance.timers.duskS * TICK_RATE);
    expect(events).toEqual(['nightSleep']);
    expect(feed.snapshot().every((p) => p.presence === null)).toBe(true);
    expect(feed.wake()).toBeNull();
    tickN(feed, onubBalance.timers.windowJitterMaxS * TICK_RATE);
    expect(events).toEqual(['nightSleep', 'nightWake']);
    expect(feed.wake()?.windowRole).toBe('cutpurse');
    stand(me, 'bk.plate_2');
    feed.ability('onub.take', 'bk.plate_2');
    expect(events).toContain('nightReveal');
    expect(feed.nightReveal()).toHaveLength(1);
    expect(feed.nightReveal()[0]).toMatchObject({ slot: 'bk.plate_0', of: feed.selfId });
    feed.ability('onub.take', 'bk.plate_3');
    expect(events).toContain('error'); // a second act in one window is refused
    tickN(feed, 60 * TICK_RATE);
    expect(events.at(-1)).toBe('meetingRequest');
    expect(events.filter((e) => e === 'nightSleep')).toHaveLength(2);
  });

  it('refuses an act outside its window or out of reach, and a take of the own plate', () => {
    const { feed, events, me } = quick();
    feed.ability('onub.take', 'bk.plate_1');
    expect(events).toEqual(['error']); // not in a window (425)
    tickN(feed, (onubBalance.timers.duskS + onubBalance.timers.windowJitterMaxS) * TICK_RATE);
    me.x = 0;
    me.y = 0;
    feed.ability('onub.take', 'bk.plate_1');
    expect(events.filter((e) => e === 'error')).toHaveLength(2); // too far (427)
    stand(me, 'bk.plate_0');
    feed.ability('onub.take', 'bk.plate_0');
    expect(events.filter((e) => e === 'error')).toHaveLength(3); // the own plate is never a target (422)
    expect(feed.nightReveal()).toHaveLength(0);
  });

  it('sets the own plate at dusk only', () => {
    const { feed, events, me } = quick();
    stand(me, 'bk.plate_0');
    feed.ability('onub.setPlate', 'bk.plate_0');
    expect(events).toEqual([]);
    feed.ability('onub.setPlate', 'bk.plate_1');
    expect(events).toEqual(['error']);
  });
});
