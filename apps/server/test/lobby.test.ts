import { ColyseusTestServer, boot } from '@colyseus/testing';
import { balance, roles } from '@wdi/content';
import {
  BUILD_VERSION,
  C2S,
  ErrorCode,
  JOIN_ERROR_MESSAGE,
  Phase,
  S2C,
  TRAIT_IDS,
  assignRoles,
  dealTraits,
  mulberry32,
  type GameStateType,
  type PlayerState,
  type RoleRevealPayload,
} from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildRoleReveal, rosterFor, startRefusal } from '../src/rooms/handlers/lobby';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';

const opts = (name: string) => ({ name, build: BUILD_VERSION, deviceId: `dev-${name}` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await boot(createServer({ ipBurst: 100_000, ipPerMin: 100_000_000, globalPerMin: 100_000_000 }));
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

type Room = Awaited<ReturnType<ColyseusTestServer['sdk']['create']>>;

interface Bot {
  room: Room;
  /** Every message this bot received, in order. */
  log: { type: string; payload: unknown }[];
}

async function party(count: number): Promise<{ bots: Bot[]; room: PartyRoom }> {
  const connect = async (join: () => Promise<Room>): Promise<Bot> => {
    const room = await join();
    const bot: Bot = { room, log: [] };
    room.onMessage('*', (type: string | number, payload: unknown) =>
      bot.log.push({ type: String(type), payload }),
    );
    return bot;
  };
  const leader = await connect(() => colyseus.sdk.create('party', opts('Bot0')));
  const bots = [leader];
  for (let i = 1; i < count; i++)
    bots.push(await connect(() => colyseus.sdk.joinById(leader.room.roomId, opts(`Bot${i}`))));
  await sleep(150);
  return { bots, room: colyseus.getRoomById(leader.room.roomId) as unknown as PartyRoom };
}

const received = <T>(bot: Bot, type: string) =>
  bot.log.filter((m) => m.type === type).map((m) => m.payload as T);
const stateOf = (bot: Bot) => bot.room.state as unknown as GameStateType;
const publicOf = (p: PlayerState) => ({
  alive: p.alive,
  connected: p.connected,
  ready: p.ready,
  hasVoted: p.hasVoted,
  sceneId: p.sceneId,
});

describe('Start (leader only, consumed inside the step)', () => {
  it('deals every seat, moves lobby -> roleReveal and sends each client its own card', async () => {
    const { bots, room } = await party(6);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(400);

    expect(room.state.phase).toBe(Phase.roleReveal);
    const dealt: string[] = [];
    for (const bot of bots) {
      const cards = received<RoleRevealPayload>(bot, S2C.roleReveal);
      expect(cards).toHaveLength(1);
      const card = cards[0] as RoleRevealPayload;
      const own = stateOf(bot).players.get(bot.room.sessionId) as PlayerState;
      expect(own.priv?.role.roleId).toBe(card.roleId);
      expect(own.alive).toBe(true);
      expect(card.inventory.length).toBeGreaterThan(0);
      expect(card.traits.height).toBe(TRAIT_IDS.height[own.traits.height]);
      expect(card.traits.scarf).toBe(TRAIT_IDS.scarf[own.traits.scarf]);
      expect(card.traits.hat).toBe(TRAIT_IDS.hat[own.traits.hat]);
      dealt.push(card.roleId);
    }
    expect([...dealt].sort()).toEqual([...rosterFor(6)['6']!.deal].sort());
    expect(received(bots[1] as Bot, S2C.phaseChange)).toContainEqual({
      phase: Phase.roleReveal,
      endsTick: room.state.phaseEndsTick,
    });
  });

  it('locks the party: a late join gets the generic error', async () => {
    const { bots } = await party(4);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(300);
    const code = bots[0]?.room.roomId as string;
    await expect(colyseus.sdk.joinById(code, opts('Late'))).rejects.toMatchObject({
      message: JOIN_ERROR_MESSAGE,
    });
  });

  it('refuses a non-leader with the generic 422 and changes nothing', async () => {
    const { bots, room } = await party(4);
    bots[2]?.room.send(C2S.lobbyStart, {});
    await sleep(300);
    expect(room.state.phase).toBe(Phase.lobby);
    expect(received(bots[2] as Bot, S2C.error)).toEqual([{ code: ErrorCode.cannot, msg: 'cannot start' }]);
    for (const bot of bots) expect(received(bot, S2C.roleReveal)).toHaveLength(0);
  });

  it('starts with a single human using the first roles of the 4-player row', async () => {
    const { bots, room } = await party(1);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(300);
    expect(room.state.phase).toBe(Phase.roleReveal);
    expect(received<RoleRevealPayload>(bots[0] as Bot, S2C.roleReveal)[0]?.roleId).toBe('killer');
  });

  it('is impossible with no human connected', async () => {
    const { bots, room } = await party(2);
    const leaderId = bots[0]?.room.sessionId as string;
    expect(startRefusal(room, leaderId)).toBeNull();
    room.state.players.forEach((p: PlayerState) => (p.connected = false));
    expect(startRefusal(room, leaderId)).toBe(ErrorCode.cannot);
  });

  it('is refused outside the lobby phase', async () => {
    const { bots, room } = await party(4);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(300);
    expect(startRefusal(room, bots[0]?.room.sessionId as string)).toBe(ErrorCode.wrongPhase);
  });

  it('only changes state inside a step', async () => {
    const { bots, room } = await party(4);
    const queue = room.lobbyCommands;
    const drain = queue.drain.bind(queue);
    let held = true;
    queue.drain = () => (held ? [] : drain());
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(200);
    expect(room.state.phase).toBe(Phase.lobby);
    held = false;
    await sleep(200);
    expect(room.state.phase).toBe(Phase.roleReveal);
  });
});

describe('role card to play', () => {
  it('enters the overworld when every player is Ready', async () => {
    const { bots, room } = await party(4);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(300);
    for (const bot of bots.slice(0, 3)) bot.room.send(C2S.lobbyReady, { ready: true });
    await sleep(200);
    expect(room.state.phase).toBe(Phase.roleReveal);
    bots[3]?.room.send(C2S.lobbyReady, { ready: true });
    await sleep(300);
    expect(room.state.phase).toBe(Phase.grace);
    const spawns = new Set<string>();
    for (const bot of bots) {
      const entered = received<{ sceneId: string; spawn: string; facing: string }>(bot, S2C.sceneEnter);
      expect(entered).toHaveLength(1);
      expect(entered[0]?.sceneId).toBe('overworld');
      spawns.add(entered[0]?.spawn as string);
    }
    expect(spawns.size).toBe(4);
  });

  it('enters the overworld when the card time elapses without Ready', async () => {
    const { bots, room } = await party(4);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(300);
    expect(room.state.phase).toBe(Phase.roleReveal);
    room.state.phaseEndsTick = room.state.tick + 1; // fast-forward the 12 s
    await sleep(300);
    expect(room.state.phase).toBe(Phase.grace);
    expect(received(bots[2] as Bot, S2C.sceneEnter)).toHaveLength(1);
  });

  it('refuses a seat whose join completes after Start', async () => {
    const { bots, room } = await party(4);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(300);
    expect(room.state.phase).toBe(Phase.roleReveal);
    expect(() => room.onJoin({ sessionId: 'late-seat' } as never, opts('Late'))).toThrow();
    expect(room.state.players.has('late-seat')).toBe(false);
  });
});

describe('privacy after Start', () => {
  it('each of 6 bots sees only its own priv and the wire carries no other role', async () => {
    const { bots, room } = await party(6);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(400);
    const roleIds = new Set(Object.keys(roles.roles));
    for (const bot of bots) {
      let own = 0;
      stateOf(bot).players.forEach((p: PlayerState, id: string) => {
        if (id === bot.room.sessionId) {
          own++;
          expect(p.priv?.role.roleId).toBe(room.state.players.get(id)?.priv?.role.roleId);
        } else {
          expect(p.priv).toBeUndefined();
          expect(p.presence).toBeUndefined();
        }
      });
      expect(own).toBe(1);
      // Exactly one role id exists anywhere in the state this client decoded: its own.
      expect(JSON.stringify(stateOf(bot).toJSON()).match(/"roleId"/g)).toHaveLength(1);
      // The only message that carries a role is the owner's roleReveal.
      for (const m of bot.log) {
        if (m.type === S2C.roleReveal) continue;
        const text = JSON.stringify(m.payload ?? {});
        for (const id of roleIds) expect(text, `${m.type} leaked ${id}`).not.toContain(`"${id}"`);
      }
    }
  });

  it('shows cabalMates only to Cabal members', async () => {
    const { bots, room } = await party(10);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(500);
    let cabal = 0;
    for (const bot of bots) {
      const card = received<RoleRevealPayload>(bot, S2C.roleReveal)[0] as RoleRevealPayload;
      const own = stateOf(bot).players.get(bot.room.sessionId) as PlayerState;
      const mates = [...(own.priv?.cabalMates ?? [])];
      if (card.team === 'cabal') {
        cabal++;
        expect(mates).toHaveLength(2); // two Killers and an Accomplice deal at 10
        expect(card.teammates.map((t) => t.id).sort()).toEqual([...mates].sort());
        for (const t of card.teammates) {
          expect(t.name).toBe(room.state.players.get(t.id)?.name);
          expect(roles.roles[room.state.players.get(t.id)?.priv?.role.roleId ?? '']?.faction).toBe('cabal');
        }
      } else {
        expect(mates).toHaveLength(0);
        expect(card.teammates).toHaveLength(0);
      }
    }
    expect(cabal).toBe(3);
  });

  it('fuzz: no public field change at Start correlates with the Killer', async () => {
    const signatures = new Set<string>();
    for (let game = 0; game < 12; game++) {
      const { bots, room } = await party(6);
      const observer = bots[1] as Bot;
      const snapshot = () =>
        new Map<string, ReturnType<typeof publicOf>>(
          [...stateOf(observer).players.entries()].map(([id, p]) => [id, publicOf(p)]),
        );
      const before = snapshot();
      bots[0]?.room.send(C2S.lobbyStart, {});
      await sleep(350);
      const after = snapshot();
      const killer = [...room.state.players.entries()].find(([, p]) => p.priv?.role.roleId === 'killer');
      expect(killer).toBeDefined();
      for (const [id, now] of after) {
        const was = before.get(id) as ReturnType<typeof publicOf>;
        const changed = (Object.keys(now) as (keyof typeof now)[]).filter((k) => now[k] !== was[k]);
        signatures.add(changed.join(','));
        expect(changed.join(','), id === killer?.[0] ? 'killer' : 'other').toBe('alive');
      }
      await colyseus.cleanup();
    }
    expect(signatures.size).toBe(1);
  }, 30_000);

  it('trait deals are independent of the role (2000 seeded deals)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const sums = { killer: [0, 0, 0, 0], other: [0, 0, 0, 0] };
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = mulberry32(seed);
      const dealt = assignRoles(ids, { mode: 0 }, rng, rosterFor(6));
      const looks = dealTraits(ids, rng);
      for (const id of ids) {
        const look = looks.get(id)!;
        const bucket = dealt.get(id) === 'killer' ? sums.killer : sums.other;
        bucket[0]! += look.height;
        bucket[1]! += look.scarf;
        bucket[2]! += look.hat;
        bucket[3]!++;
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      const k = sums.killer[axis]! / sums.killer[3]!;
      const o = sums.other[axis]! / sums.other[3]!;
      expect(Math.abs(k - o)).toBeLessThan(0.1);
    }
  });
});

describe('role card content', () => {
  it('only shows abilities enabled at the party size and uses the kill cooldown of that size', () => {
    const at4 = buildRoleReveal('killer', { height: 0, scarf: 0, hat: 0 }, 4, []);
    const at6 = buildRoleReveal('killer', { height: 0, scarf: 0, hat: 0 }, 6, []);
    expect(at4.abilities.map((a) => a.id)).toEqual(['kill', 'dragBody']); // Lock door needs 6+
    expect(at6.abilities.map((a) => a.id)).toEqual(['kill', 'killerLock', 'dragBody']);
    expect(at4.abilities[0]?.cooldown).toBeGreaterThan(at6.abilities[0]?.cooldown ?? 99);
    expect(at6.abilities.every((a) => a.uses === null)).toBe(true);
  });

  it('keeps TRAIT_IDS in step with traits.json', async () => {
    const { traits } = await import('@wdi/content');
    for (const axis of ['height', 'scarf', 'hat'] as const)
      expect(traits.axes[axis].values.map((v) => v.id)).toEqual([...TRAIT_IDS[axis]]);
  });
});

describe('reconnection in the lobby (GDD 3.10)', () => {
  const drop = async (bot: Bot): Promise<string> => {
    bot.room.reconnection.enabled = false; // the test reconnects by hand
    const token = bot.room.reconnectionToken;
    await bot.room.leave(false);
    return token;
  };

  it('keeps the seat and name of a dropped bot through the window and hands it back on reconnect', async () => {
    const { bots, room } = await party(3);
    const id = bots[1]!.room.sessionId;
    const token = await drop(bots[1]!);
    await sleep(250);
    const seat = room.state.players.get(id);
    expect(seat).toBeDefined();
    expect([seat?.name, seat?.connected]).toEqual(['Bot1', false]);
    expect(room.state.players.size).toBe(3);

    const back = await colyseus.sdk.reconnect(token);
    await sleep(250);
    expect(back.sessionId).toBe(id);
    expect([room.state.players.get(id)?.name, room.state.players.get(id)?.connected]).toEqual(['Bot1', true]);
    expect(room.state.leaderId).toBe(bots[0]!.room.sessionId);
    // The reconnected client still sees its own private state.
    expect((back.state as unknown as GameStateType).players.get(id)?.priv).toBeDefined();
  });

  it('passes the lead to a connected seat while the leader is away', async () => {
    const { bots, room } = await party(3);
    const [leader, second] = [bots[0]!.room.sessionId, bots[1]!.room.sessionId];
    await drop(bots[0]!);
    await sleep(250);
    expect(room.state.leaderId).toBe(second);
    expect(room.state.players.get(leader)?.connected).toBe(false);
  });

  it('frees the seat when the window lapses', async () => {
    const window = balance.disconnect as { deathAfterS: number };
    const saved = window.deathAfterS;
    window.deathAfterS = 0.4;
    try {
      const { bots, room } = await party(3);
      const id = bots[2]!.room.sessionId;
      await drop(bots[2]!);
      await sleep(250);
      expect(room.state.players.has(id)).toBe(true);
      await sleep(600);
      expect(room.state.players.has(id)).toBe(false);
      expect(room.state.players.size).toBe(2);
    } finally {
      window.deathAfterS = saved;
    }
  });

  it('a consented leave frees the seat at once', async () => {
    const { bots, room } = await party(3);
    const id = bots[1]!.room.sessionId;
    await bots[1]!.room.leave();
    await sleep(250);
    expect(room.state.players.has(id)).toBe(false);
  });
});
