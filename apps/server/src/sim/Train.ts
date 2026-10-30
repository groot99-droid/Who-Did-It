import { type SceneId, balance } from '@wdi/content';
import { type DeathCause, Phase, S2C, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { ensureBody, removeBody } from './body/state';
import { dropCoins } from './economy/coins';
import { addFare } from './economy/fare';
import { balanceOf } from './economy/purse';
import { emitSim } from './events/bus';
import { strip } from './Inventory';
import { secondsToTicks } from './Flow';
import { mapIdOfRoom, stationOf } from './MapSites';
import { emitNoise } from './Noise';
import { isNpcSeat } from './Npc';
import { isPaintTown, returnGuards } from './paintTown';
import { enterScene } from './Portals';
import { simOf } from './RoomSim';
import { isWorldPhase } from './World';

/**
 * The Daily Train (round 7, GDD 3.3, docs/round7/vendettas.md 3): the master clock of a map with a `station`. It
 * stops `train.arriveAtS` into each day (`train.arrive`, the `train_arrive` sound to the seats of the hub within
 * `train.hearTiles` of the platform, a system line for everyone) and delivers `train.deliveryAfterS` later
 * (`train.delivery`, the `train_brake` sound). The events name no seat; 7H's vendettas subscribe to them. Never in
 * the quick mode. Room memory only; the Step stage runs after `runEvents`, so the events reach the bus next tick.
 *
 * Round 10 (C1, GDD 3.3, 3.22; docs/round9/world-mode.md 6): the morning Train also brings back the day's dead. A seat
 * that dies in a daylight phase (grace, day, immunity) to a bite or a shot is **on the line** until the next arrival:
 * unplaced, with no ghost view, its pack gone and its purse dropped where it fell. At the arrival it steps onto the platform with
 * `respawn.hp`, full stamina and no effects, its card, notebook and quests kept and its cooldowns resumed where they
 * stood. The Final Night brings back everyone still on the line. The Dusk Train leaves `train.dusk.leaveAtS` into each
 * dusk (`train.dusk`) and brings nobody back (followup-4 2.6).
 */
interface TrainMemory {
  /** The round whose day the Train last served. */
  round: number;
  arriveTick: number;
  deliveryTick: number;
  arrived: boolean;
  delivered: boolean;
  /** The round whose dusk the Dusk Train last left in. */
  duskRound: number;
}

const trains = new WeakMap<PartyRoom, TrainMemory>();

/** A seat on the line: the tick it died on, so its cooldowns resume where they stood, and the round. */
interface LineSeat {
  deathTick: number;
  round: number;
}

const lines = new WeakMap<PartyRoom, Map<string, LineSeat>>();

function lineOf(room: PartyRoom): Map<string, LineSeat> {
  let line = lines.get(room);
  if (!line) lines.set(room, (line = new Map()));
  return line;
}

/** Whether `seat` died by day and waits for the morning Train (A7a's sleep count and the ghost gates read it). */
export const isOnLine = (room: PartyRoom, seat: string): boolean => lines.get(room)?.has(seat) === true;

/** The phases whose deaths the Train brings back: daylight only, so a Knife or a night's death stays for good. */
const DAYLIGHT: readonly number[] = [Phase.grace, Phase.day, Phase.immunity];
/** The causes that can return: a bite or a shot. The vote, a vanished seat, the Knife and Nightshade never do. */
const RETURNING: readonly DeathCause[] = ['wolf', 'creature', 'shot'];

/**
 * Whether a death of `cause` now goes on the line: a map with a Train, a daylight phase, a returning cause. In Paint
 * The Town Red every NPC seat's death returns, after dark and to the Knife too (round 10, C5; world-mode.md 12 R4).
 */
export function returnsOnTrain(room: PartyRoom, cause: DeathCause, seat?: string): boolean {
  if (stationOf(room) === undefined) return false;
  if (seat !== undefined && isPaintTown(room) && isNpcSeat(room, seat) && cause !== 'vanished') return true;
  return DAYLIGHT.includes(room.state.phase) && RETURNING.includes(cause);
}

/**
 * Puts a seat that just died by day on the line (`markDead` only): its purse drops where it fell (a find for whoever
 * reaches the body) and its pack empties (`strip`: bound kit and the equipment stay), then it leaves the world, so no verb, view or ghost channel reaches it until the Train.
 */
export function boardLine(room: PartyRoom, seat: string): void {
  const p = simOf(room).players.get(seat);
  const player = room.state.players.get(seat);
  if (!p || !player) return;
  const purse = balanceOf(room, seat);
  if (purse > 0) dropCoins(room, seat, purse);
  strip(player); // the pack goes with the body; it lies nowhere until C6's town chest holds lost property
  lineOf(room).set(seat, { deathTick: room.state.tick, round: room.state.round });
  p.placed = false;
  p.input = null;
  p.hold = null;
  player.priv.onLine = true;
  simOf(room).viewsDirty = true;
}

/**
 * The Train's returns: every seat that went on the line before `round` (the morning after its death; the Final Night
 * passes no round and brings back everyone) steps onto the platform, and its body leaves the scene.
 */
function returnLine(room: PartyRoom, round = Infinity): void {
  const line = lines.get(room);
  const station = stationOf(room);
  if (!line || line.size === 0 || !station) return;
  const sim = simOf(room);
  const tick = room.state.tick;
  for (const [seat, { deathTick, round: died }] of [...line]) {
    if (died >= round) continue;
    const p = sim.players.get(seat);
    const player = room.state.players.get(seat);
    line.delete(seat);
    if (!p || !player) continue;
    player.priv.onLine = false;
    if (!enterScene(room, player, p, station.sceneId as SceneId, station.spawn, false)) continue;
    p.dead = false;
    p.placed = true;
    player.alive = true;
    for (const scene of room.state.scenes.values()) scene.bodies.delete(`body_${seat}`); // the Undertaker's cart
    removeBody(room, seat);
    ensureBody(room, seat).hp = balance.respawn.hp;
    const cooldowns = player.priv.cooldownEndTick;
    for (const [key, end] of cooldowns) if (end > deathTick) cooldowns.set(key, end + (tick - deathTick));
    emitSim(room, { tick, kind: 'train.return', seat, sceneId: station.sceneId });
    addFare(room, seat); // C2: the return is owed to the line
    for (const client of room.clients) {
      client.send(S2C.chatMsg, { from: '', text: trainReturnLine(player.name), channel: 'system' });
    }
  }
  sim.viewsDirty = true;
}

/** The system line every seat's log receives at the arrival (UI.md 14.30). */
export const TRAIN_ARRIVE_LINE = 'The train pulls into the station.';
/** The system line at the Dusk Train's leaving (UI.md 14.47). */
export const TRAIN_DUSK_LINE = 'The dusk train pulls out of the station.';
/** The manifest's line for each seat that steps off the morning train (UI.md 14.47). */
export const trainReturnLine = (name: string): string => `${name} steps off the train.`;

export function runTrain(room: PartyRoom): void {
  const state = room.state;
  if (state.phase < Phase.grace || state.phase === Phase.gameOver) {
    trains.delete(room);
    clearLine(room);
    return;
  }
  const station = stationOf(room);
  if (!station) return;
  // The Final Night's bells bring back every seat still on the line (docs/round9/phases.md 6).
  if (state.phase === Phase.finalNight) returnLine(room);
  let train = trains.get(room);
  if (state.phase === Phase.dusk && train && train.duskRound !== state.round) {
    const duskStart = state.phaseEndsTick - secondsToTicks(balance.phases.duskS);
    if (state.tick >= duskStart + secondsToTicks(balance.train.dusk.leaveAtS)) {
      train.duskRound = state.round;
      announce(room, 'train.dusk', 'train_arrive', state.round);
      for (const client of room.clients) {
        client.send(S2C.chatMsg, { from: '', text: TRAIN_DUSK_LINE, channel: 'system' });
      }
    }
  }
  if (state.phase === Phase.day && train?.round !== state.round) {
    const dayStart = state.phaseEndsTick - secondsToTicks(balance.phases.dayS);
    const arriveTick = dayStart + secondsToTicks(balance.train.arriveAtS);
    const deliveryTick = arriveTick + secondsToTicks(balance.train.deliveryAfterS);
    train = { round: state.round, arriveTick, deliveryTick, arrived: false, delivered: false, duskRound: -1 };
    trains.set(room, train);
  }
  if (!train) return;
  // A meeting that opens before the arrival takes this day's Train with it; the next day brings the next one.
  if (!train.arrived && state.phase === Phase.day && state.tick >= train.arriveTick) {
    train.arrived = true;
    announce(room, 'train.arrive', 'train_arrive', train.round);
    for (const client of room.clients) {
      client.send(S2C.chatMsg, { from: '', text: TRAIN_ARRIVE_LINE, channel: 'system' });
    }
    returnLine(room, train.round);
    returnGuards(room, train.round); // Paint The Town Red: the guards come back too (round 10, C5c)
  }
  // The delivery follows an arrival whatever the phase, so a meeting never swallows the strongbox.
  if (train.arrived && !train.delivered && state.tick >= train.deliveryTick) {
    train.delivered = true;
    announce(room, 'train.delivery', 'train_brake', train.round);
  }
}

function announce(room: PartyRoom, kind: string, sound: string, round: number): void {
  const station = stationOf(room)!;
  const { sceneId } = station;
  emitSim(room, {
    tick: room.state.tick,
    kind,
    sceneId,
    data: { map: mapIdOfRoom(room), station: `${sceneId}.${station.spawn}`, round },
  });
  if (!isWorldPhase(room.state.phase)) return;
  const x = (station.x + 0.5) * TILE_PX;
  const y = (station.y + 0.5) * TILE_PX;
  emitNoise(room, sceneId, x, y, balance.train.hearTiles, sound, '');
}

/** Game over and the lobby: nobody waits on the line any more. */
function clearLine(room: PartyRoom): void {
  const line = lines.get(room);
  if (!line) return;
  for (const seat of line.keys()) {
    const priv = room.state.players.get(seat)?.priv;
    if (priv) priv.onLine = false;
  }
  lines.delete(room);
}
