import type { ColyseusTestServer } from '@colyseus/testing';
import { onubRoles, scenes } from '@wdi/content';
import { GameMode, Phase, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { onubOf } from '../src/sim/Onub';
import { simOf } from '../src/sim/RoomSim';
import { until } from './flowHelpers';
import { type Bot, type Match, opts, sleep, stateOf } from './simHelpers';

export { until };

/**
 * Creates a party of `n` bots in quick mode, deals it (`dealtByName` fixes seats by bot name, the rest of the
 * deck goes to the others and the centre), starts it from the leader, readies every seat and waits for dusk.
 * The mode is written white-box: the lobby settings message belongs to the NPC session.
 */
export async function startOnub(
  colyseus: ColyseusTestServer,
  n: number,
  dealtByName: Record<string, string> = {},
  { stopAt = Phase.dusk }: { stopAt?: number } = {},
): Promise<Match> {
  const m = await joinParty(colyseus, n);
  m.room.state.settings.mode = GameMode.onub;
  if (Object.keys(dealtByName).length > 0) {
    const roles = Object.fromEntries(
      Object.entries(dealtByName).map(([name, role]) => [idByName(m, name), role]),
    );
    leader(m).room.send('debug.deal', { roles });
    await sleep(200);
  }
  await beginParty(m, stopAt);
  return m;
}

/** A lobby of `n` bots with every message recorded; nobody has started. */
export async function joinParty(colyseus: ColyseusTestServer, n: number): Promise<Match> {
  const first = await colyseus.sdk.create('party', opts('Bot0'));
  const rooms = [first];
  for (let i = 1; i < n; i++) rooms.push(await colyseus.sdk.joinById(first.roomId, opts(`Bot${i}`)));
  const bots: Bot[] = rooms.map((room) => {
    const events: Bot['events'] = [];
    room.onMessage('*', (type: string | number | object, payload: unknown) =>
      events.push({ type: String(type), payload }),
    );
    return { room, id: room.sessionId, events };
  });
  const room = colyseus.getRoomById(first.roomId) as unknown as PartyRoom;
  await sleep(100);
  return { room, bots };
}

/** Start from the leader, ready every seat on the card, wait until the match reaches `stopAt` (dusk by default). */
export async function beginParty(m: Match, stopAt: number = Phase.dusk): Promise<void> {
  leader(m).room.send('lobby.start', {});
  if (!(await until(() => m.room.state.phase === Phase.roleReveal)))
    throw new Error('the match did not start');
  if (stopAt === Phase.roleReveal) return;
  for (const b of m.bots) b.room.send('role.ready', {});
  if (!(await until(() => m.room.state.phase === stopAt))) throw new Error('dusk never came');
  await sleep(250);
}

export const leader = (m: Match): Bot => m.bots[0] as Bot;
export const idByName = (m: Match, name: string): string => {
  const bot = m.bots[Number(name.replace('Bot', ''))];
  if (!bot) throw new Error(`no bot ${name}`);
  return bot.id;
};
export const onub = (m: Match) => {
  const o = onubOf(m.room);
  if (!o) throw new Error('no quick-mode state');
  return o;
};

/** The bot holding the dealt role (the first when the deck deals it twice). */
export const botDealt = (m: Match, roleId: string): Bot => {
  const id = [...onub(m).dealt].find(([, r]) => r === roleId)?.[0];
  const bot = m.bots.find((b) => b.id === id);
  if (!bot) throw new Error(`nobody was dealt ${roleId}`);
  return bot;
};
export const botsDealt = (m: Match, roleId: string): Bot[] =>
  m.bots.filter((b) => onub(m).dealt.get(b.id) === roleId);

export const events = (bot: Bot, type: string) =>
  bot.events.filter((e) => e.type === type).map((e) => e.payload as Record<string, unknown>);

/** Error codes a bot received, in order. */
export const codes = (bot: Bot): number[] =>
  bot.events.filter((e) => e.type === 'error').map((e) => (e.payload as { code: number }).code);

const propDef = (id: string) => {
  const def = scenes.bakery.props.find((q) => q.id === id);
  if (!def) throw new Error(`no bakery prop ${id}`);
  return def;
};

/** White-box: stands a bot on a bakery prop's tile. */
export function standAtProp(m: Match, bot: Bot, propId: string): void {
  const def = propDef(propId);
  const p = simOf(m.room).players.get(bot.id);
  if (!p) throw new Error('no sim');
  p.x = (def.x + 0.5) * TILE_PX;
  p.y = (def.y + 0.5) * TILE_PX;
  p.resetRing();
}

/** The plate prop of a bot. */
export const plate = (m: Match, bot: Bot): string => {
  const slot = onub(m).slotOf.get(bot.id);
  if (slot === undefined) throw new Error('no plate');
  return `bk.plate_${slot}`;
};

/** Starts the night now (`debug.clock`), the first window opens on the next tick. */
export async function toNight(m: Match): Promise<void> {
  leader(m).room.send('debug.clock', { phase: 'night' });
  if (!(await until(() => m.room.state.phase === Phase.night))) throw new Error('night never came');
  await sleep(100);
}

/** Jumps the Conductor to a window and waits until it is open. */
export async function openWindow(m: Match, roleId: string): Promise<void> {
  leader(m).room.send('debug.clock', { window: roleId });
  const open = () => {
    const o = onub(m);
    return o.stage === 'window' && o.script[o.windowIdx]?.role === roleId;
  };
  if (!(await until(open))) throw new Error(`window ${roleId} never opened`);
  await sleep(250);
}

/** Ends the open window on the next tick and waits for its fade. */
export async function endWindow(m: Match): Promise<void> {
  const o = onub(m);
  o.stageEndsTick = m.room.state.tick;
  if (!(await until(() => o.stage === 'fade'))) throw new Error('window never closed');
  await sleep(250);
}

/** Sends one onub act and waits two or three steps. */
export async function doAct(
  bot: Bot,
  abilityId: string,
  targetId?: string,
  targetId2?: string,
): Promise<void> {
  bot.room.send('act.ability', {
    abilityId,
    ...(targetId !== undefined && { targetId }),
    ...(targetId2 !== undefined && { targetId2 }),
  });
  await sleep(200);
}

/** Ids whose presence this bot's client currently holds. */
export const presencesSeen = (m: Match, bot: Bot): string[] => {
  const out: string[] = [];
  stateOf(bot).players.forEach((p, id) => {
    if (id !== bot.id && p.presence !== undefined) out.push(id);
  });
  return out.sort();
};

/** What a client has decoded about scenes, as sorted keys. */
export const scenesSeen = (bot: Bot): string[] => {
  const out: string[] = [];
  stateOf(bot).scenes.forEach((_s, key) => out.push(key));
  return out.sort();
};

export const roleName = (roleId: string): string => onubRoles.roles[roleId]?.name ?? roleId;

/** Casts a vote from each listed bot; `pick(i)` is the target id (or undefined to abstain). */
export async function castVotes(m: Match, pick: (i: number) => string | undefined): Promise<void> {
  m.bots.forEach((b, i) => {
    const target = pick(i);
    if (target !== undefined) b.room.send('meeting.vote', { targetId: target });
  });
  await sleep(250);
}

/** Runs the match from dusk to the dawn meeting at once: night skipped, dawn timer expired. */
export async function toMeeting(m: Match): Promise<void> {
  leader(m).room.send('debug.clock', { phase: 'dawn' });
  if (!(await until(() => m.room.state.phase === Phase.dawn))) throw new Error('dawn never came');
  m.room.state.phaseEndsTick = m.room.state.tick;
  if (!(await until(() => m.room.state.phase === Phase.meetingDiscussion))) throw new Error('no meeting');
  await sleep(250);
}
