import { balance, scenes } from '@wdi/content';
import { ClueKind, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { spawnClue } from '../Clues';
import { emitSim } from '../events/bus';
import { addStack, canAdd } from '../Inventory';
import { mapScenesOf } from '../MapSites';
import { simOf } from '../RoomSim';
import { profileOpen, sceneIndex, tileCentre } from '../World';
import { activeBody, emitStep, progressOf } from './progress';

/**
 * Heist, the Bandit against the strongbox (GDD 3.20): the manor hall's strongbox (the safe `mh.safe` of
 * `scenes/manor_hall.json`, whose frozen id and art it keeps) is loaded by the match's first Train delivery, Bandit or not; the Bandit cracks it with
 * still seconds within verb reach, after dark, alone in the hall, and walks off with the Strongbox item, a footprint
 * of its height at the box and a ready Knife. Session 7H.
 */

const HALL = 'manor_hall';
const STRONGBOX_PROP = 'mh.safe';
export const STRONGBOX_ITEM = 'strongbox';

/** The match's strongbox: loaded by the Train, taken by a crack. Room memory keyed by the match's `MatchSeeds`. */
const boxes = new WeakMap<object, { loaded: boolean; taken: boolean }>();

export function strongboxOf(room: PartyRoom): { loaded: boolean; taken: boolean } {
  let b = boxes.get(room.seeds);
  if (!b) boxes.set(room.seeds, (b = { loaded: false, taken: false }));
  return b;
}

/** The strongbox prop when the match's map holds the manor hall and the hall is open at the party's profile. */
export function strongboxProp(room: PartyRoom): { id: string; x: number; y: number } | null {
  const hall = scenes[HALL];
  if (!hall || !mapScenesOf(room).includes(HALL) || !profileOpen(hall.profile, simOf(room).profile))
    return null;
  return hall.props.find((p) => p.id === STRONGBOX_PROP) ?? null;
}

/** The bus's `train.delivery`: the first of the match loads the strongbox (public: the Train brings it to all). */
export function onDeliveryHeist(room: PartyRoom): void {
  const box = strongboxOf(room);
  if (box.loaded || !strongboxProp(room)) return;
  box.loaded = true;
  emitSim(room, { tick: room.state.tick, kind: 'vendetta.heist.loaded', sceneId: HALL });
}

const afterDark = (phase: number): boolean => phase === Phase.night || phase === Phase.finalNight;

/** Whether a living, placed seat other than `seat` stands in the hall. */
function hallShared(room: PartyRoom, seat: string, hallIdx: number): boolean {
  for (const [id, p] of simOf(room).players)
    if (id !== seat && !p.dead && p.placed && p.sceneIdx === hallIdx) return true;
  return false;
}

/** Step stage (`runVendettas`): the hold at the loaded strongbox and the crack. */
export function runHeist(room: PartyRoom, seat: string): void {
  const prog = progressOf(room, seat);
  const box = strongboxOf(room);
  const prop = strongboxProp(room);
  if (prog.over || !box.loaded || box.taken || !prop) return;
  const me = activeBody(room, seat);
  const last = prog.last;
  prog.last = me ? { scene: me.sceneIdx, x: me.x, y: me.y } : null;
  const hallIdx = sceneIndex(HALL);
  const reach = balance.doors.reachTiles * TILE_PX;
  const holding =
    me !== null &&
    last !== null &&
    last.scene === me.sceneIdx &&
    last.x === me.x &&
    last.y === me.y &&
    me.sceneIdx === hallIdx &&
    afterDark(room.state.phase) &&
    Math.hypot(me.x - tileCentre(prop.x, TILE_PX), me.y - tileCentre(prop.y, TILE_PX)) <= reach &&
    !hallShared(room, seat, hallIdx);
  if (!holding || !me) {
    prog.holding = null;
    return;
  }
  prog.holding = { prop: prop.id, ticks: (prog.holding?.ticks ?? 0) + 1 };
  if (prog.holding.ticks < balance.vendettas.heist.crackS * TICK_RATE) return;
  const player = room.state.players.get(seat);
  // The box goes nowhere without a free slot: the hold waits at its last second until one opens.
  if (!player || !canAdd(player, STRONGBOX_ITEM, 1)) return;
  addStack(player, STRONGBOX_ITEM, 1);
  box.taken = true;
  prog.holding = null;
  spawnClue(room, HALL, {
    kind: ClueKind.footprints,
    value: player.traits.height,
    dir: 4,
    tx: Math.floor(me.x / TILE_PX),
    ty: Math.floor(me.y / TILE_PX),
  });
  player.priv?.cooldownEndTick.set('kill', room.state.tick);
  emitStep(room, seat, 'vendetta.heist.cracked', HALL);
}
