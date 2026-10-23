import { balance } from '@wdi/content';
import { Phase, S2C, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { emitSim } from './events/bus';
import { secondsToTicks } from './Flow';
import { mapIdOfRoom, stationOf } from './MapSites';
import { emitNoise } from './Noise';
import { isOnub } from './onub/state';
import { isWorldPhase } from './World';

/**
 * The Daily Train (round 7, GDD 3.3, docs/round7/vendettas.md 3): the master clock of a map with a `station`. It
 * stops `train.arriveAtS` into each day (`train.arrive`, the `train_arrive` sound to the seats of the hub within
 * `train.hearTiles` of the platform, a system line for everyone) and delivers `train.deliveryAfterS` later
 * (`train.delivery`, the `train_brake` sound). The events name no seat; 7H's vendettas subscribe to them. Never in
 * the quick mode. Room memory only; the Step stage runs after `runEvents`, so the events reach the bus next tick.
 */
interface TrainMemory {
  /** The round whose day the Train last served. */
  round: number;
  arriveTick: number;
  deliveryTick: number;
  arrived: boolean;
  delivered: boolean;
}

const trains = new WeakMap<PartyRoom, TrainMemory>();

/** The system line every seat's log receives at the arrival (UI.md 14.30). */
export const TRAIN_ARRIVE_LINE = 'The train pulls into the station.';

export function runTrain(room: PartyRoom): void {
  const state = room.state;
  if (state.phase < Phase.grace || state.phase === Phase.gameOver) {
    trains.delete(room);
    return;
  }
  if (isOnub(room)) return;
  const station = stationOf(room);
  if (!station) return;
  let train = trains.get(room);
  if (state.phase === Phase.day && train?.round !== state.round) {
    const dayStart = state.phaseEndsTick - secondsToTicks(balance.phases.dayS);
    const arriveTick = dayStart + secondsToTicks(balance.train.arriveAtS);
    const deliveryTick = arriveTick + secondsToTicks(balance.train.deliveryAfterS);
    train = { round: state.round, arriveTick, deliveryTick, arrived: false, delivered: false };
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
