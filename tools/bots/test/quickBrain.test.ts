import type { Room } from '@colyseus/sdk';
import { GameMode, Phase, TILE_PX } from '@wdi/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { propPx } from '../quick';
import { mulberry, startWalker } from '../walk';

type Handler = (payload: never) => void;

/** A Room stand-in: the bot reads `state`, listens with `onMessage` and answers with `send`. */
function fakeRoom(selfId: string) {
  const handlers = new Map<string, Handler>();
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const players = new Map<string, Record<string, unknown>>();
  const bakery = { bodies: new Map(), props: new Map<string, unknown>() };
  const state = {
    phase: Phase.lobby,
    tick: 0,
    leaderId: selfId,
    settings: { mode: GameMode.onub },
    players: {
      forEach: (cb: (p: never, id: string) => void) => players.forEach((p, id) => cb(p as never, id)),
      get: (id: string) => players.get(id) as never,
    },
    scenes: { size: 1, get: (k: string) => (k === 'bakery' ? bakery : undefined) },
  };
  const room = {
    sessionId: selfId,
    state,
    onMessage: (type: string, h: Handler) => handlers.set(type, h),
    send: (type: string, payload: Record<string, unknown>) => sent.push({ type, payload }),
  } as unknown as Room;
  const player = (id: string, extra: Record<string, unknown> = {}) => {
    const p = { id, name: id, alive: true, hasVoted: false, sceneId: 0, ...extra };
    players.set(id, p);
    return p;
  };
  return {
    room,
    state,
    sent,
    player,
    bakery,
    emit: (type: string, payload: unknown = {}) => handlers.get(type)?.(payload as never),
    sentOf: (type: string) => sent.filter((m) => m.type === type),
  };
}

const card = (roleId: string, teammates: unknown[] = []) => ({
  roleId,
  team: 0,
  goal: '',
  abilities: [],
  inventory: [],
  cardText: '',
  beware: '',
  teammates,
  traits: {},
});

function seedBakery(f: ReturnType<typeof fakeRoom>, ids: string[]) {
  ids.forEach((id, n) => f.bakery.props.set(`bk.plate_${n}`, { id: `bk.plate_${n}`, kind: 'plate', of: id }));
  [0, 1, 2].forEach((n) =>
    f.bakery.props.set(`bk.deadloaf_${n}`, { id: `bk.deadloaf_${n}`, kind: 'deadLoaf', of: '' }),
  );
  f.bakery.props.set('bk.ledger', { id: 'bk.ledger', kind: 'ledger', of: '' });
  for (const m of [f.bakery.props]) (m as unknown as { forEach: unknown }).forEach = m.forEach.bind(m);
}

beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
afterEach(() => vi.useRealTimers());

describe('quick-mode bot brain', () => {
  it('walks to its own plate at dusk, holds, and sets it once; never enters a portal', () => {
    const f = fakeRoom('me');
    const ids = ['x', 'y', 'me', 'z'];
    seedBakery(f, ids);
    const at = propPx('bk.plate_2')!;
    const me = f.player('me', { presence: { x: 8.5 * TILE_PX, y: 9.5 * TILE_PX, statusBits: 0 } });
    const bot = startWalker(f.room, mulberry(1), { walk: true });
    f.emit('roleReveal', card('mourner'));
    f.state.phase = Phase.dusk;
    vi.advanceTimersByTime(200);
    const moves = f.sentOf('input.move');
    expect(moves.length).toBeGreaterThan(0);
    expect(f.sentOf('act.enterPortal')).toHaveLength(0);
    expect(f.sentOf('act.ability')).toHaveLength(0);
    // Standing at the plate: after the hold the plate is set exactly once.
    me.presence = { x: at.x, y: at.y, statusBits: 0 };
    vi.advanceTimersByTime(3000);
    const acts = f.sentOf('act.ability');
    expect(acts).toHaveLength(1);
    expect(acts[0]!.payload).toEqual({ abilityId: 'onub.setPlate', targetId: 'bk.plate_2' });
    expect(bot.stats.acts).toBe(1);
    bot.stop();
  });

  it('sends no input while asleep, and counts presences and scenes that reach a sleeper', () => {
    const f = fakeRoom('me');
    f.player('me');
    f.player('other');
    f.state.scenes.size = 0;
    const bot = startWalker(f.room, mulberry(1), { walk: true });
    f.emit('roleReveal', card('cutpurse'));
    f.state.phase = Phase.night;
    f.emit('nightSleep');
    vi.advanceTimersByTime(3000);
    expect(f.sentOf('input.move')).toHaveLength(0);
    expect(bot.stats.nightLeaks).toBe(0);
    f.player('other', { presence: { x: 1, y: 1, statusBits: 0 } });
    vi.advanceTimersByTime(500);
    expect(bot.stats.nightLeaks).toBe(1);
    f.state.scenes.size = 1;
    vi.advanceTimersByTime(500);
    expect(bot.stats.nightLeaks).toBe(2);
    bot.stop();
  });

  it('counts a sceneEnter that never comes with a nightWake, and a wake for the wrong role', () => {
    const f = fakeRoom('me');
    f.player('me');
    f.state.scenes.size = 0;
    const bot = startWalker(f.room, mulberry(1), { walk: true });
    f.emit('roleReveal', card('cutpurse'));
    f.state.phase = Phase.night;
    f.emit('nightSleep');
    vi.advanceTimersByTime(100);
    f.emit('sceneEnter', { sceneId: 'bakery', spawn: 'door', facing: 'n' });
    vi.advanceTimersByTime(2500);
    expect(bot.stats.nightLeaks).toBe(1);
    f.emit('nightWake', { windowRole: 'busybody', endsTick: 1, spawn: 'door' });
    expect(bot.stats.nightLeaks).toBe(2);
    bot.stop();
  });

  it('wakes, walks to its targets and sends one act in its window, then sleeps again', () => {
    const f = fakeRoom('me');
    const ids = ['a', 'b', 'me', 'c'];
    seedBakery(f, ids);
    f.state.scenes.size = 1;
    const me = f.player('me', { presence: { x: 8.5 * TILE_PX, y: 9.5 * TILE_PX, statusBits: 0 } });
    const bot = startWalker(f.room, mulberry(3), { walk: true });
    f.emit('roleReveal', card('cutpurse'));
    f.state.phase = Phase.night;
    f.emit('nightWake', { windowRole: 'cutpurse', endsTick: 999, spawn: 'door' });
    expect(bot.stats.wakes).toBe(1);
    vi.advanceTimersByTime(200);
    expect(f.sentOf('input.move').length).toBeGreaterThan(0);
    // Teleport it beside its pick and let the hold pass.
    const move = f.sentOf('input.move');
    expect(move.some((m) => m.payload.dx !== 0 || m.payload.dy !== 0)).toBe(true);
    const plate = (f.sentOf('act.ability')[0]?.payload.targetId as string | undefined) ?? 'bk.plate_0';
    const near = propPx(['bk.plate_0', 'bk.plate_1', 'bk.plate_3'].includes(plate) ? plate : 'bk.plate_0')!;
    me.presence = { x: near.x, y: near.y, statusBits: 0 };
    // Its target is one of the other plates; stand on each in turn until it acts.
    for (const t of ['bk.plate_0', 'bk.plate_1', 'bk.plate_3']) {
      const p = propPx(t)!;
      me.presence = { x: p.x, y: p.y, statusBits: 0 };
      vi.advanceTimersByTime(3000);
      if (f.sentOf('act.ability').length) break;
    }
    const acts = f.sentOf('act.ability');
    expect(acts).toHaveLength(1);
    expect(acts[0]!.payload.abilityId).toBe('onub.take');
    expect(acts[0]!.payload.targetId).not.toBe('bk.plate_2');
    // One act per window.
    vi.advanceTimersByTime(5000);
    expect(f.sentOf('act.ability')).toHaveLength(1);
    f.emit('nightSleep');
    me.presence = undefined as never;
    vi.advanceTimersByTime(200);
    const after = f.sentOf('input.move').length;
    vi.advanceTimersByTime(2000);
    expect(f.sentOf('input.move')).toHaveLength(after);
    bot.stop();
  });

  it('votes for another living seat (never Skip, never itself) and claims once per meeting', () => {
    const f = fakeRoom('me');
    f.player('me');
    f.player('a');
    f.player('b');
    const bot = startWalker(f.room, mulberry(4), { walk: true, claims: true, vote: 'skip' });
    f.emit('roleReveal', card('lamplighter'));
    f.state.phase = Phase.meetingDiscussion;
    f.emit('meetingStart', {});
    vi.advanceTimersByTime(300);
    const votes = f.sentOf('meeting.vote');
    expect(votes).toHaveLength(1);
    expect(['a', 'b']).toContain(votes[0]!.payload.targetId);
    expect(f.sentOf('meeting.claim')).toEqual([
      { type: 'meeting.claim', payload: { roleId: 'lamplighter' } },
    ]);
    vi.advanceTimersByTime(3000);
    expect(f.sentOf('meeting.claim')).toHaveLength(1);
    expect(bot.stats.claims).toBe(1);
    bot.stop();
  });

  it('gives a vote up after repeated refusals and keeps a main-mode vote on Skip', () => {
    const f = fakeRoom('me');
    f.player('me');
    f.player('a');
    const bot = startWalker(f.room, mulberry(4), { walk: true });
    f.emit('roleReveal', card('mourner'));
    f.state.phase = Phase.meetingVote;
    f.emit('meetingStart', {});
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(800);
      f.emit('error', { code: 422 });
    }
    expect(f.sentOf('meeting.vote').length).toBeLessThanOrEqual(7);
    bot.stop();

    const g = fakeRoom('me');
    g.state.settings.mode = GameMode.main;
    g.player('me');
    g.player('a');
    const main = startWalker(g.room, mulberry(4), { walk: false, vote: 'skip' });
    g.state.phase = Phase.meetingVote;
    vi.advanceTimersByTime(300);
    expect(g.sentOf('meeting.vote')[0]!.payload).toEqual({ targetId: 'skip' });
    expect(g.sentOf('meeting.claim')).toHaveLength(0);
    main.stop();
  });
});
