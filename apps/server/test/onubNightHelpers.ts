import type { ColyseusTestServer } from '@colyseus/testing';
import { GameMode, Phase, tableAtNight } from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { setPhase } from '../src/sim/Flow';
import { type OnubState, createOnubState, onubOf, setOnub } from '../src/sim/onub/state';
import { type Bot, type Match, opts, sleep } from './simHelpers';

// Session 5B's helpers. Session 5A's deal and prep are not needed here: a quick-mode match is built white-box at
// the moment prep has ended (`createOnubState`, `tableAtNight`, `Phase.prepReveal`), then driven by the real
// step, the real command queue and the real Conductor.

export interface NightTable {
  /** Role card dealt to seat `i`; the party has this many seats. */
  roles: string[];
  /** Location card (a station id) each seat holds as the night starts. */
  locs: string[];
  pantryRoles: string[];
  pantryLocs: string[];
  /** Defaults to the dealt roles plus the Pantry's. */
  deck?: string[];
}

export interface NightMatch extends Match {
  o: OnubState;
}

/** The standard five-seat table most tests use: a Spore pair, an investigator, a swapper and the Critique. */
export const TABLE5: NightTable = {
  roles: ['champignon', 'chef', 'sousChef', 'croissant', 'critique'],
  locs: ['fridge', 'mixer', 'oven', 'proofing', 'fridge'],
  pantryRoles: ['aboyeur', 'plongeur', 'inspecteur'],
  pantryLocs: ['oven', 'oven', 'mixer'],
};

/** A party in quick mode at `Phase.prepReveal` with the table of `t` on the felt, nothing woken yet. */
export async function startNightMatch(colyseus: ColyseusTestServer, t: NightTable): Promise<NightMatch> {
  const leader = await colyseus.sdk.create('party', opts('Bot0'));
  const rooms = [leader];
  for (let i = 1; i < t.roles.length; i++)
    rooms.push(await colyseus.sdk.joinById(leader.roomId, opts(`Bot${i}`)));
  const bots: Bot[] = rooms.map((room) => {
    const events: Bot['events'] = [];
    room.onMessage('*', (type: string | number | object, payload: unknown) =>
      events.push({ type: String(type), payload }),
    );
    return { room, id: room.sessionId, events };
  });
  const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
  room.state.settings.mode = GameMode.onub;
  const seats = bots.map((b) => b.id);
  const deck = t.deck ?? [...t.roles, ...t.pantryRoles];
  const o = createOnubState(
    seats,
    deck,
    new Map(seats.map((id, i) => [id, t.roles[i] as string])),
    t.pantryRoles,
    t.pantryLocs,
  );
  o.cards = tableAtNight(t.roles, t.locs, t.pantryRoles, t.pantryLocs);
  setOnub(room, o);
  seats.forEach((id) => room.state.onub.seats.push(id));
  deck.forEach((id) => room.state.onub.deck.push(id));
  seats.forEach((id, i) => {
    const priv = room.state.players.get(id)?.priv;
    if (!priv) throw new Error('no private view');
    const player = room.state.players.get(id);
    if (player) player.alive = true;
    priv.role.roleId = t.roles[i] as string;
    priv.onubLoc = t.locs[i] as string;
    priv.onubCard = 'pureDairy';
  });
  room.state.startTick = room.state.tick;
  setPhase(room, Phase.prepReveal, 3600);
  await sleep(120);
  return { room, bots, o: onubOf(room) as OnubState };
}

export const msgs = (bot: Bot, type: string): Array<Record<string, unknown>> =>
  bot.events.filter((e) => e.type === type).map((e) => e.payload as Record<string, unknown>);

export const errorsOf = (bot: Bot): number[] => msgs(bot, 'error').map((e) => e.code as number);

/** Polls until `cond` holds or the timeout passes; returns whether it held. */
export async function until(cond: () => boolean, ms = 4000): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += 20) {
    if (cond()) return true;
    await sleep(20);
  }
  return cond();
}

/** Sends `debug.clock` from the leader and waits for the step to apply it. */
export async function clock(m: Match, args: Record<string, unknown>): Promise<void> {
  (m.bots[0] as Bot).room.send('debug.clock', args);
  await sleep(120);
}

/** Ends the open window on the next tick (white-box) and waits for the fade to start. */
export async function closeWindowNow(m: NightMatch): Promise<void> {
  m.o.stageEndsTick = m.room.state.tick;
  await until(() => m.o.stage !== 'window');
}

/** Ends the fade on the next tick (white-box) and waits for the next window or dawn. */
export async function endFadeNow(m: NightMatch): Promise<void> {
  const before = m.o.windowIdx;
  m.o.stageEndsTick = m.room.state.tick;
  await until(() => m.o.stage !== 'fade' || m.o.windowIdx !== before);
}

/** Sends an act as seat `i`. */
export function act(m: Match, i: number, abilityId: string, targets: string[] = []): void {
  (m.bots[i] as Bot).room.send('act.ability', { abilityId, targets });
}

export const waitMsgs = (bot: Bot, type: string, n: number): Promise<boolean> =>
  until(() => msgs(bot, type).length >= n);
