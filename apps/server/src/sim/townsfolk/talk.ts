import { balance, looks, scenes, talk } from '@wdi/content';
import { Phase, S2C, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { ledgerOf } from '../economy/rumours';
import { briefingsOf } from '../law/Briefing';
import { simOf } from '../RoomSim';
import { isWorldPhase, reject, sceneKey } from '../World';
import { type Figure, figureOfHandle, figuresOf } from './figures';
import { clientOf } from '../seatIds';

/**
 * Talk to a figure (round 10, D9c; GDD 3.24 "Talk to a figure"; seams.md 3 row 16). `talk.ask {targetId, ask}` is
 * queued by `runCommands` and answered `figureTalk.delayS` later by `runTalk` in the townsfolk stage: one system chat
 * line to the asker alone. `town` is a tip off the rumour ledger naming a drawn look and a scene, never a seat, a
 * handle or a card, and `time` a template remark; a Constable reads the latest briefing line instead (B2). The line is
 * drawn from the figure and the tick the answer is due (`pick`), so every asker of that figure at that tick hears the
 * same words, and nothing here draws a random number. Nothing public marks a talk: no bubble, no turn, no event.
 */

type Ask = 'town' | 'time';

interface Pending {
  seat: string;
  figureId: string;
  ask: Ask;
  dueTick: number;
}

interface TalkMemory {
  pending: Pending[];
  /** `<seat>|<figure>` -> the first tick that seat may ask that figure again. */
  cool: Map<string, number>;
}

const memories = new WeakMap<PartyRoom, TalkMemory>();
const memoryOf = (room: PartyRoom): TalkMemory => {
  let m = memories.get(room);
  if (!m) memories.set(room, (m = { pending: [], cool: new Map() }));
  return m;
};

const PART_KEY: Record<number, string> = {
  [Phase.grace]: 'grace',
  [Phase.day]: 'day',
  [Phase.dusk]: 'dusk',
  [Phase.night]: 'night',
  [Phase.finalNight]: 'finalNight',
};

/** A stable pick from a list by a figure and a tick (FNV-1a); the same inputs give the same line. */
function pick<T>(list: readonly T[], figureId: string, tick: number): T {
  let h = 0x811c9dc5;
  for (const c of `${figureId}:${tick}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return list[h % list.length]!;
}

const fill = (text: string, values: Record<string, string>): string =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

/** The queue step of `talk.ask`: validates, refuses with the shared reasons, or queues the answer. */
export function handleTalk(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const actor = simOf(room).players.get(sessionId);
  const handle = payload.targetId;
  const ask = payload.ask;
  if (typeof handle !== 'string' || (ask !== 'town' && ask !== 'time'))
    return reject(room, sessionId, 'BAD_REQUEST');
  if (!actor || actor.dead || !actor.placed) return reject(room, sessionId, 'NOT_IN_PLAY');
  if (!isWorldPhase(room.state.phase)) return reject(room, sessionId, 'PHASE_CLOSED');
  if (room.state.tick < actor.busyUntilTick) return reject(room, sessionId, 'BUSY');
  const figure = figureOfHandle(room, handle);
  if (!figure || figure.dead || figure.sceneIdx !== actor.sceneIdx)
    return reject(room, sessionId, 'NO_TARGET');
  if (Math.hypot(figure.x - actor.x, figure.y - actor.y) > balance.figureTalk.reachTiles * TILE_PX)
    return reject(room, sessionId, 'TOO_FAR', { of: 'person' });
  const memory = memoryOf(room);
  const key = `${sessionId}|${figure.id}`;
  const tick = room.state.tick;
  if (tick < (memory.cool.get(key) ?? 0)) return reject(room, sessionId, 'COOLDOWN');
  memory.cool.set(key, tick + Math.round(balance.figureTalk.cooldownS * TICK_RATE));
  memory.pending.push({
    seat: sessionId,
    figureId: figure.id,
    ask,
    dueTick: tick + Math.round(balance.figureTalk.delayS * TICK_RATE),
  });
}

/** What the figure says now to `ask`. */
function lineFor(room: PartyRoom, figure: Figure, ask: Ask, tick: number): string {
  const f = talk.figures;
  const quiet = pick(f.quiet, figure.id, tick);
  if (figure.kind === 'constable') {
    const briefs = briefingsOf(room);
    return briefs.length > 0 ? briefs[briefs.length - 1]!.line : quiet;
  }
  if (ask === 'time')
    return fill(pick(f.time, figure.id, tick), { part: f.parts[PART_KEY[room.state.phase] ?? 'day'] ?? '' });
  const seen = ledgerOf(room).sightings;
  if (seen.length === 0) return quiet;
  const s = pick(seen, figure.id, tick);
  return fill(pick(f.town, figure.id, tick), {
    look: looks.looks[s.look]?.name ?? 'a stranger',
    scene: scenes[sceneKey(s.sceneIdx)]?.name ?? 'somewhere',
  });
}

/** Townsfolk stage: sends the answers that fall due this tick. */
export function runTalk(room: PartyRoom): void {
  const memory = memoryOf(room);
  if (room.state.phase === Phase.lobby) {
    memory.pending.length = 0;
    memory.cool.clear();
    return;
  }
  const tick = room.state.tick;
  const due = memory.pending.filter((a) => a.dueTick <= tick);
  if (due.length === 0) return;
  memory.pending = memory.pending.filter((a) => a.dueTick > tick);
  for (const a of due) {
    const figure = figuresOf(room).get(a.figureId);
    const asker = simOf(room).players.get(a.seat);
    const client = clientOf(room, a.seat);
    if (!figure || figure.dead || !asker || asker.dead || !client) continue;
    const name = talk.figures.names[figure.kind] ?? talk.figures.names.villager ?? '';
    const text = `${name}: ${lineFor(room, figure, a.ask, tick)}`;
    client.send(S2C.chatMsg, { from: name, text, channel: 'system' });
  }
}
