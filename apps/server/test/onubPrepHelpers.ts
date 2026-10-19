import type { ColyseusTestServer } from '@colyseus/testing';
import { C2S, GameMode, Phase, type GameStateType } from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { flowOf } from '../src/sim/Flow';
import { onubOf, type OnubState } from '../src/sim/onub/state';
import { type Bot, opts, sleep } from './simHelpers';

// Session 5A's helpers for the quick-mode deal and prep tests (`onubDeal`, `onubPrep`, `onubContract`). They go
// through the wire (`lobby.settings`, `lobby.start`, `lobby.ready`, `act.ability`) wherever a player could, and
// read room memory (`onubOf`) only to check what the server dealt.

export interface OnubParty {
  room: PartyRoom;
  bots: Bot[];
}

/** `n` humans in a lobby whose leader (Bot0) has chosen the quick mode and, optionally, a custom deck. */
export async function onubLobby(
  colyseus: ColyseusTestServer,
  n: number,
  onubDeck?: string[],
): Promise<OnubParty> {
  const leader = await colyseus.sdk.create('party', opts('Bot0'));
  const rooms = [leader];
  for (let i = 1; i < n; i++) rooms.push(await colyseus.sdk.joinById(leader.roomId, opts(`Bot${i}`)));
  const bots: Bot[] = rooms.map((r) => {
    const events: Bot['events'] = [];
    r.onMessage('*', (type: string | number | object, payload: unknown) =>
      events.push({ type: String(type), payload }),
    );
    return { room: r, id: r.sessionId, events };
  });
  leader.send(C2S.lobbySettings, { mode: GameMode.onub, ...(onubDeck && { onubDeck }) });
  await sleep(150);
  return { room: colyseus.getRoomById(leader.roomId) as unknown as PartyRoom, bots };
}

export const phaseOf = (m: OnubParty): number => m.room.state.phase;
export const clientState = (bot: Bot): GameStateType => bot.room.state as unknown as GameStateType;

/** Polls until `cond` holds or the timeout passes. */
export async function until(cond: () => boolean, ms = 4000): Promise<boolean> {
  for (let waited = 0; waited < ms; waited += 25) {
    if (cond()) return true;
    await sleep(25);
  }
  return cond();
}

/** Start from the leader; resolves once the role cards are out (or the wait ends). */
export async function startOnub(m: OnubParty): Promise<void> {
  (m.bots[0] as Bot).room.send(C2S.lobbyStart, {});
  await until(() => phaseOf(m) === Phase.roleReveal);
}

/** What a test fixes about the deal: roles by bot index (`debug.deal`, white-box) and a custom deck. */
export interface DealOpts {
  roles?: Record<number, string>;
  deck?: string[];
}

/** A party in the role card phase. */
export async function onubRoleCard(
  colyseus: ColyseusTestServer,
  n: number,
  opt: DealOpts | string[] = {},
): Promise<OnubParty> {
  const { roles, deck } = Array.isArray(opt) ? { roles: undefined, deck: opt } : opt;
  const m = await onubLobby(colyseus, n, deck);
  if (roles) {
    flowOf(m.room).fixedDeal = Object.fromEntries(
      Object.entries(roles).map(([i, r]) => [(m.bots[Number(i)] as Bot).id, r]),
    );
  }
  await startOnub(m);
  return m;
}

/** Every human dismisses the role card; resolves once Evening Prep (`dusk`) has begun. */
export async function toPrep(m: OnubParty): Promise<void> {
  for (const bot of m.bots) bot.room.send(C2S.lobbyReady, { ready: true });
  await until(() => phaseOf(m) === Phase.dusk);
}

/** A party in Evening Prep (every NPC seat, if any, is left to its brain: none acts in these tests). */
export async function onubPrep(
  colyseus: ColyseusTestServer,
  n: number,
  opt: DealOpts | string[] = {},
): Promise<OnubParty> {
  const m = await onubRoleCard(colyseus, n, opt);
  await toPrep(m);
  return m;
}

export const memory = (m: OnubParty): OnubState => {
  const o = onubOf(m.room);
  if (!o) throw new Error('no quick-mode match memory');
  return o;
};

/** `act.ability onub.prep` from a bot. */
export function commit(bot: Bot, station: string, card: string): void {
  bot.room.send(C2S.ability, { abilityId: 'onub.prep', targets: [station, card] });
}

export const errorsOf = (bot: Bot): { code: number; msg: string }[] =>
  bot.events.filter((e) => e.type === 'error').map((e) => e.payload as { code: number; msg: string });

/** Ends prep on the next tick, as the timer would. */
export function runOutPrep(m: OnubParty): void {
  m.room.state.phaseEndsTick = m.room.state.tick + 1;
}
