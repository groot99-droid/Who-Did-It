import { ColyseusTestServer, boot } from '@colyseus/testing';
import { balance, maps, scenes } from '@wdi/content';
import { Phase, S2C, TICK_RATE, TILE_PX } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';
import { bodyOf } from '../src/sim/body/state';
import { TOWN, movePurse } from '../src/sim/economy/purse';
import { type SimEvent, onSim } from '../src/sim/events/bus';
import { addStack, count } from '../src/sim/Inventory';
import { creatureKill } from '../src/sim/Kill';
import { simOf } from '../src/sim/RoomSim';
import { TRAIN_DUSK_LINE, isOnLine, trainReturnLine } from '../src/sim/Train';
import { sceneKey } from '../src/sim/World';
import { act, eventsOf, sleep, teleport } from './killHelpers';
import { type Match, startMatch, stateOf } from './simHelpers';

/** Round 10, C1 (GDD 3.3, 3.22; docs/round9/world-mode.md 6): the morning Train brings back the day's dead. */

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

const ARRIVE = balance.train.arriveAtS * TICK_RATE;
const DAY = balance.phases.dayS * TICK_RATE;

/** White-box: a day of round `round` whose clock reads `elapsed` ticks. */
function dayAt(m: Match, round: number, elapsed: number): void {
  const state = m.room.state;
  state.round = round;
  state.phase = Phase.day;
  state.phaseEndsTick = state.tick + DAY - elapsed;
}

const platform = () => scenes.overworld.spawns.find((q) => `overworld.${q.id}` === maps.hollowmere.station)!;

function events(room: PartyRoom, kinds: string[]): SimEvent[] {
  const out: SimEvent[] = [];
  for (const kind of kinds) onSim(room, kind, (e) => out.push(e));
  return out;
}

/** Village cards and one Killer, so one death decides no match. */
const village = { Bot0: 'baker', Bot1: 'doctor', Bot2: 'vicar', Bot3: 'killer' };

describe('the train returns the day’s dead (GDD 3.22)', () => {
  it('puts a day death on the line: no ghost view, no ghost chat, the purse dropped where it fell', async () => {
    const m = await startMatch(colyseus, 4, village);
    const [victim, ghost] = m.bots;
    const sim = simOf(m.room);
    dayAt(m, 1, ARRIVE + 10);
    for (const bot of m.bots.slice(0, 3)) teleport(m, bot, 'overworld', 25, 17);
    movePurse(m.room, TOWN, victim!.id, 9, 'wage');
    const seat = m.room.state.players.get(victim!.id)!;
    expect(addStack(seat, 'bloodyRag', 1) && addStack(seat, 'masterKeyring', 1)).toBe(true);
    // A night's dead seat walks as a ghost, as before.
    sim.players.get(ghost!.id)!.dead = true;
    creatureKill(m.room, victim!.id, 'wolf');
    await sleep(400);

    const p = sim.players.get(victim!.id)!;
    const priv = m.room.state.players.get(victim!.id)!.priv;
    expect(isOnLine(m.room, victim!.id)).toBe(true);
    expect(priv.onLine).toBe(true);
    expect(p.dead).toBe(true);
    expect(p.placed).toBe(false);
    expect(priv.purse).toBe(0);
    // The pack goes with the body; bound kit (`onDeath: kept`) stays.
    expect(count(seat, 'bloodyRag')).toBe(0);
    expect(count(seat, 'masterKeyring')).toBe(1);
    const coins = [...m.room.state.scenes.get('overworld')!.nodes.values()].filter(
      (n) => n.resource === 'coins',
    );
    expect(coins).toHaveLength(1);
    // Its `killed` names no role, and its view holds no scene.
    expect(eventsOf(victim!, S2C.killed)).toEqual([expect.objectContaining({ cause: 'wolf', roles: {} })]);
    expect(stateOf(victim!).scenes.size).toBe(0);
    // The ghost channel neither reaches it nor takes its lines.
    await act(ghost!, 'chat.say', { text: 'boo' });
    await act(victim!, 'chat.say', { text: 'hello' });
    const ghostLines = (bot: typeof victim) =>
      eventsOf(bot!, S2C.chatMsg).filter((c) => (c as { channel: string }).channel === 'ghost');
    expect(ghostLines(victim)).toEqual([]);
    expect(ghostLines(ghost)).toEqual([{ from: ghost!.id, text: 'boo', channel: 'ghost' }]);
    expect(eventsOf(victim!, 'error')).toEqual([expect.objectContaining({ reason: 'NOT_IN_PLAY' })]);
    // Nobody else learns of the line (A170): no private view, no figure, no `onLine` in any message.
    const handle = priv.avatar;
    for (const bot of [m.bots[2]!, ghost!]) {
      expect(stateOf(bot).players.get(victim!.id)?.priv).toBeUndefined();
      for (const scene of stateOf(bot).scenes.values()) expect(scene.avatars.has(handle)).toBe(false);
      expect(JSON.stringify(bot.events)).not.toContain('onLine');
    }
  });

  it('brings it back at the next arrival with respawn.hp, its card kept and its cooldowns resumed', async () => {
    const m = await startMatch(colyseus, 4, village);
    const [victim, other] = m.bots;
    const sim = simOf(m.room);
    const seen = events(m.room, ['death', 'train.return']);
    dayAt(m, 1, ARRIVE + 10);
    const player = m.room.state.players.get(victim!.id)!;
    player.priv.cooldownEndTick.set('strike', m.room.state.tick + 100);
    const died = m.room.state.tick;
    creatureKill(m.room, victim!.id, 'creature');
    await sleep(300);
    expect(m.room.state.scenes.get(sceneKey(sim.players.get(victim!.id)!.sceneIdx))!.bodies.size).toBe(1);

    // The next day's Train: the seat steps off at the platform.
    dayAt(m, 2, ARRIVE);
    await sleep(400);
    const p = sim.players.get(victim!.id)!;
    expect(isOnLine(m.room, victim!.id)).toBe(false);
    expect(player.priv.onLine).toBe(false);
    expect(p.dead).toBe(false);
    expect(p.placed).toBe(true);
    expect(player.alive).toBe(true);
    expect(player.priv.role.roleId).toBe('baker');
    expect(sceneKey(p.sceneIdx)).toBe('overworld');
    expect(Math.floor(p.x / TILE_PX)).toBe(platform().x);
    const body = bodyOf(m.room, victim!.id)!;
    expect(body.hp).toBe(balance.respawn.hp);
    expect(body.stamina).toBe(balance.body.maxStamina);
    expect(body.effects.size).toBe(0);
    // The Undertaker's cart took the body; the cooldown kept the 100 ticks it had left.
    for (const scene of m.room.state.scenes.values())
      expect(scene.bodies.has(`body_${victim!.id}`)).toBe(false);
    const elapsed = player.priv.cooldownEndTick.get('strike')! - (died + 100);
    expect(elapsed).toBeGreaterThan(0);
    expect(seen.map((e) => e.kind)).toEqual(['death', 'train.return']);
    expect(seen[0]!.data).toMatchObject({ cause: 'creature', onLine: true });
    expect(eventsOf(other!, S2C.chatMsg)).toContainEqual({
      from: '',
      text: trainReturnLine(player.name),
      channel: 'system',
    });
  });

  it('keeps a death after dark, and a day death on a map with no Train, for good', async () => {
    const m = await startMatch(colyseus, 5, { ...village, Bot4: 'herbalist' });
    const [night, noTrain] = m.bots;
    const sim = simOf(m.room);
    m.room.state.phase = Phase.night;
    creatureKill(m.room, night!.id, 'wolf');
    await sleep(300);
    expect(isOnLine(m.room, night!.id)).toBe(false);
    expect(Object.keys((eventsOf(night!, S2C.killed)[0] as { roles: object }).roles)).toHaveLength(5);
    m.room.state.settings.map = 'blackpine';
    dayAt(m, 1, ARRIVE + 10);
    creatureKill(m.room, noTrain!.id, 'wolf');
    m.room.state.settings.map = 'hollowmere';
    await sleep(300);
    expect(isOnLine(m.room, noTrain!.id)).toBe(false);
    dayAt(m, 2, ARRIVE);
    await sleep(300);
    expect(sim.players.get(night!.id)!.dead).toBe(true);
    expect(sim.players.get(noTrain!.id)!.dead).toBe(true);
  });

  it('a Killer on the line ends no match and passes no Knife; the Final Night brings it back', async () => {
    const m = await startMatch(colyseus, 4, {
      Bot0: 'killer',
      Bot1: 'accomplice',
      Bot2: 'vicar',
      Bot3: 'baker',
    });
    const [killer, accomplice] = m.bots;
    dayAt(m, 1, ARRIVE + 10);
    creatureKill(m.room, killer!.id, 'wolf');
    await sleep(400);
    expect(m.room.state.phase).toBe(Phase.day);
    expect(m.room.state.players.get(accomplice!.id)!.priv.role.roleId).toBe('accomplice');
    m.room.state.phase = Phase.finalNight;
    m.room.state.phaseEndsTick = m.room.state.tick + 20 * 3600;
    await sleep(300);
    expect(isOnLine(m.room, killer!.id)).toBe(false);
    expect(simOf(m.room).players.get(killer!.id)!.dead).toBe(false);
  });
});

describe('the Dusk Train (followup-4 2.6)', () => {
  it('leaves train.dusk.leaveAtS into each dusk, once, and brings nobody back', async () => {
    const m = await startMatch(colyseus, 2);
    const seen = events(m.room, ['train.dusk', 'train.return']);
    dayAt(m, 1, 0);
    await sleep(200);
    const state = m.room.state;
    state.phase = Phase.dusk;
    state.phaseEndsTick = state.tick + (balance.phases.duskS - balance.train.dusk.leaveAtS) * TICK_RATE + 60;
    await sleep(300);
    expect(seen).toEqual([]);
    state.tick += 60;
    await sleep(300);
    expect(seen.map((e) => e.kind)).toEqual(['train.dusk']);
    expect(seen[0]!.data).toMatchObject({ station: 'overworld.platform', round: 1 });
    state.tick += 4;
    await sleep(200);
    expect(seen).toHaveLength(1);
    for (const bot of m.bots)
      expect(eventsOf(bot, S2C.chatMsg)).toContainEqual({
        from: '',
        text: TRAIN_DUSK_LINE,
        channel: 'system',
      });
  });
});
