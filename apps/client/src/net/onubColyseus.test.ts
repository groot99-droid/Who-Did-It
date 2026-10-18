import { describe, expect, it } from 'vitest';
import { ColyseusOnubFeed } from './onubColyseus';
import { ONUB_PHASE } from './onubRouter';

function fakeRoom() {
  const handlers = new Map<string, (m: never) => void>();
  const sent: Array<[string, unknown]> = [];
  const stateCbs: Array<() => void> = [];
  const state = {
    tick: 10,
    phase: ONUB_PHASE.night,
    phaseEndsTick: 99,
    players: new Map([
      [
        'me',
        {
          id: 'me',
          name: 'Hana',
          priv: {
            role: { roleId: 'chef' },
            onubLoc: 'oven',
            onubCard: 'oakFirewood',
            nightReveal: [{ slot: 'seat.1.role', kind: 'role', value: 'levain', of: 'bo' }],
          },
        },
      ],
      ['bo', { id: 'bo', name: 'Bo' }],
    ]),
    meeting: { claims: [{ from: 'bo', roleId: 'chef', stationId: '', cardId: '', saw: [] }] },
    onub: {
      seats: ['me', 'bo'],
      deck: ['chef', 'levain'],
      piles: new Map([['oven', { cards: ['oakFirewood'], lost: 0, net: 0, underMixed: false }]]),
      ruinWeight: 0,
      ruined: false,
      perk: false,
      cloche: '',
      window: 'chef',
    },
  };
  const onStateChange = Object.assign((cb: () => void) => stateCbs.push(cb), {
    remove: () => (stateCbs.length = 0),
  });
  const room = {
    sessionId: 'me',
    state,
    onStateChange,
    onMessage: (type: string, cb: (m: never) => void) => (
      handlers.set(type, cb),
      () => handlers.delete(type)
    ),
    send: (type: string, payload: unknown) => sent.push([type, payload]),
  };
  return { room, handlers, sent, stateCbs, state };
}

describe('ColyseusOnubFeed', () => {
  it("reads the public board, this seat's own private view and the claims", () => {
    const { room } = fakeRoom();
    const feed = new ColyseusOnubFeed(room as never);
    expect(feed.seats()).toEqual([
      { id: 'me', name: 'Hana' },
      { id: 'bo', name: 'Bo' },
    ]);
    expect(feed.board()).toMatchObject({
      window: 'chef',
      deck: ['chef', 'levain'],
      piles: { oven: { cards: ['oakFirewood'] } },
    });
    expect(feed.dealtRole()).toBe('chef');
    expect(feed.myPrep()).toEqual({ station: 'oven', card: 'oakFirewood' });
    expect(feed.reveals()).toHaveLength(1);
    expect(feed.claims()[0]).toMatchObject({ from: 'bo', roleId: 'chef' });
  });

  it('keeps the latest wake until nightSleep or the end of the night', () => {
    const { room, handlers } = fakeRoom();
    const feed = new ColyseusOnubFeed(room as never);
    const wake = {
      windowRole: 'chef',
      endsTick: 50,
      view: { mates: [], seen: [], alone: false, cloche: '', legal: [], must: false },
    };
    handlers.get('nightWake')?.(wake as never);
    expect(feed.wake()).toEqual(wake);
    handlers.get('nightSleep')?.({} as never);
    expect(feed.wake()).toBeNull();
    handlers.get('nightWake')?.(wake as never);
    handlers.get('phaseChange')?.({ phase: ONUB_PHASE.dawn, endsTick: 1 } as never);
    expect(feed.wake()).toBeNull();
  });

  it('emits board and claims only when a state patch changed them', () => {
    const { room, stateCbs, state } = fakeRoom();
    const feed = new ColyseusOnubFeed(room as never);
    const seen: string[] = [];
    feed.bus.on('board', () => seen.push('board'));
    feed.bus.on('claims', () => seen.push('claims'));
    stateCbs[0]?.();
    stateCbs[0]?.();
    expect(seen).toEqual(['board', 'claims']);
    state.onub.cloche = 'seat.0.role';
    stateCbs[0]?.();
    expect(seen).toEqual(['board', 'claims', 'board']);
  });

  it('sends prep and acts as act.ability with targets, and claims as meeting.claim', () => {
    const { room, sent } = fakeRoom();
    const feed = new ColyseusOnubFeed(room as never);
    feed.prep('oven', 'oakFirewood');
    feed.act('onub.peekRole', ['seat.1.role']);
    feed.claim({ roleId: 'chef' });
    expect(sent).toEqual([
      ['act.ability', { abilityId: 'onub.prep', targets: ['oven', 'oakFirewood'] }],
      ['act.ability', { abilityId: 'onub.peekRole', targets: ['seat.1.role'] }],
      ['meeting.claim', { roleId: 'chef' }],
    ]);
  });

  it('stops listening on dispose', () => {
    const { room, stateCbs } = fakeRoom();
    const feed = new ColyseusOnubFeed(room as never);
    feed.dispose();
    expect(stateCbs).toHaveLength(0);
  });
});
