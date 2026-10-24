import { abilities, balance, roles } from '@wdi/content';
import {
  type DeathCause,
  ErrorCode,
  NotebookEntry,
  NotebookStatus,
  NoteKind,
  type NoteKindId,
  Phase,
  type PlayerState,
  SPENT_TONIGHT,
  TILE_PX,
  Team,
  TICK_RATE,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { spawnBody } from './Bodies';
import { knockedOut } from './body/effects';
import { markDead } from './Death';
import { finishFinalNight } from './FinalNight';
import { factionOf, flowOf } from './Flow';
import { closeAims, handleLastShot, runNpcShots, startAim } from './LastShot';
import { runInherit } from './Inherit';
import { dropNightMemory, nightOf } from './nightMemory';
import { npcMemory } from './npc/memory';
import { type PlayerSim, simOf } from './RoomSim';
import { reject, sceneKey } from './World';

// Night powers, protections, Nightshade, the Last Shot and Inherit (GDD 3.2, round-5 `deck/wire.md` 5). Session
// 5G owns this file; the hooks below are called from their locked sites (wire.md 8.1). The memory is
// `sim/nightMemory.ts`; the Last Shot is `sim/LastShot.ts` and Inherit `sim/Inherit.ts`.

/** The phases a night power works in (`abilities.json` `phases`): from dusk to the end of the night, and the hunt. */
const POWER_PHASE: Readonly<Record<number, string>> = {
  [Phase.dusk]: 'dusk',
  [Phase.night]: 'night',
  [Phase.finalNight]: 'finalNight',
};
const inWindow = (phase: number): boolean => POWER_PHASE[phase] !== undefined;

/** Writes a private, Verified night-power entry (GDD 3.2): `of` is the seat it is about, `value` a Team index. */
export function addNote(room: PartyRoom, seat: string, note: NoteKindId, of: string, value = 0): void {
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  if (!player?.priv || !p) return;
  const entry = new NotebookEntry();
  entry.id = `entry_${++p.entrySeq}`;
  entry.clueKind = 0;
  entry.value = value;
  entry.sceneId = p.sceneIdx;
  entry.tick = room.state.tick;
  entry.status = NotebookStatus.verified;
  entry.note = note;
  entry.of = of;
  player.priv.notebook.push(entry);
}

/** Why `target` is no legal seat for `actor` (`deck/wire.md` 4.3), or null: a roster-living seat, not the actor. */
function badTarget(room: PartyRoom, actor: string, target: unknown, allowSelf: boolean): boolean {
  if (typeof target !== 'string' || target.length > 64) return true;
  const player = room.state.players.get(target);
  return !player || !player.alive || (target === actor && !allowSelf);
}

interface Refusal {
  code: ErrorCode;
  msg: string;
}

/**
 * The refusals of a night power, in the order of `deck/wire.md` 5, for a human or an NPC (`ability` is a power
 * other than the Last Shot). Null when the power may be used on `target`.
 */
function powerProblem(room: PartyRoom, seat: string, ability: string, target: unknown): Refusal | null {
  const def = abilities.abilities[ability];
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  if (!def || !player?.priv || !p) return { code: ErrorCode.cannot, msg: 'cannot do that' };
  if (!roles.roles[player.priv.role.roleId]?.abilities.includes(ability)) {
    return { code: ErrorCode.cannot, msg: 'cannot do that' };
  }
  if (p.dead || !p.placed) return { code: ErrorCode.cannot, msg: 'not now' };
  const phase = POWER_PHASE[room.state.phase];
  if (phase === undefined || !(def.phases as readonly string[] | undefined)?.includes(phase)) {
    return { code: ErrorCode.wrongPhase, msg: 'not now' };
  }
  const mem = nightOf(room);
  if ((mem.used.get(seat)?.size ?? 0) > 0 && mem.used.get(seat)?.has(ability)) {
    return { code: ErrorCode.cooldown, msg: 'used tonight' };
  }
  if (def.consumes !== undefined) {
    const left = player.priv.inventory.slots.some((s) => s.defId === def.consumes && s.qty > 0);
    if (!left) return { code: ErrorCode.cannot, msg: 'none left' };
  }
  if (badTarget(room, seat, target, def.allowSelf === true))
    return { code: ErrorCode.cannot, msg: 'no target' };
  if ((ability === 'keepWatch' || ability === 'remedy') && knockedOut(room, target as string))
    return { code: ErrorCode.cannot, msg: 'no target' }; // round 8, 8A: a downed seat (GDD 3.22, body.md 5)
  if (
    ability === 'keepWatch' &&
    !balance.nightPowers.watchRepeatAllowed &&
    mem.watched.get(seat)?.night === mem.night - 1 &&
    mem.watched.get(seat)?.seat === target
  ) {
    return { code: ErrorCode.cannot, msg: 'watched last night' };
  }
  return null;
}

/** Takes one of the kit item a power consumes (the Herbalist's bottles), as Bandage takes its own. */
function consume(player: PlayerState, item: string): void {
  const slots = player.priv.inventory.slots;
  const at = slots.findIndex((s) => s.defId === item && s.qty > 0);
  const stack = slots[at];
  if (!stack) return;
  if (stack.qty <= 1) slots.splice(at, 1);
  else stack.qty -= 1;
}

/** The accepted power: its Notebook entry, its protection or poison, and its spent mark (all private). */
function applyPower(room: PartyRoom, seat: string, ability: string, target: string): void {
  const player = room.state.players.get(seat) as PlayerState;
  const mem = nightOf(room);
  const consumes = abilities.abilities[ability]?.consumes;
  if (consumes !== undefined) consume(player, consumes);
  switch (ability) {
    case 'confession': {
      const seatPlayer = room.state.players.get(target) as PlayerState;
      addNote(room, seat, NoteKind.confession, target, Team[factionOf(seatPlayer)]);
      break;
    }
    case 'keepWatch':
      mem.watch.set(target, seat);
      mem.watched.set(seat, { night: mem.night, seat: target });
      addNote(room, seat, NoteKind.watching, target);
      break;
    case 'remedy':
      mem.remedy.set(target, seat);
      addNote(room, seat, NoteKind.remedyGiven, target);
      break;
    case 'poison':
      flowOf(room).poisoned.add(target);
      addNote(room, seat, NoteKind.poisonGiven, target);
      break;
    default:
  }
  const used = mem.used.get(seat) ?? new Set<string>();
  used.add(ability);
  mem.used.set(seat, used);
  player.priv.cooldownEndTick.set(ability, SPENT_TONIGHT);
}

/**
 * `act.ability` with `confession`, `keepWatch`, `remedy`, `poison` or `lastShot` (`handleAbility`, `Actions.ts`).
 * A power changes no `SceneState` field and answers nobody but its actor (P15); a refusal is the only message.
 */
export function handleNightPower(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const ability = payload.abilityId;
  if (ability === 'lastShot') return handleLastShot(room, seat, payload);
  if (typeof ability !== 'string') return reject(room, seat, ErrorCode.cannot, 'cannot do that');
  const problem = powerProblem(room, seat, ability, payload.targetId);
  if (problem) return reject(room, seat, problem.code, problem.msg);
  applyPower(room, seat, ability, payload.targetId as string);
}

/** Nightshade (GDD 3.2): every poisoned seat dies where it stands, with no clue; a secretly dead seat is skipped. */
function resolvePoison(room: PartyRoom): void {
  const flow = flowOf(room);
  const sim = simOf(room);
  const poisoned = [...flow.poisoned];
  flow.poisoned.clear();
  for (const seat of poisoned) {
    const p = sim.players.get(seat);
    if (!p || p.dead) continue;
    markDead(room, seat, 'poison');
    if (p.placed) {
      spawnBody(room, sceneKey(p.sceneIdx), seat, Math.floor(p.x / TILE_PX), Math.floor(p.y / TILE_PX));
    }
  }
}

/** A new night begins (a dusk or the Final Night): the spent marks clear and the nights count up. */
function beginNight(room: PartyRoom): void {
  const mem = nightOf(room);
  mem.night++;
  for (const [seat, ids] of mem.used) {
    const cooldowns = room.state.players.get(seat)?.priv?.cooldownEndTick;
    for (const id of ids) if (cooldowns?.get(id) === SPENT_TONIGHT) cooldowns.delete(id);
  }
  mem.used.clear();
  mem.npcUsed.clear();
}

/** The legal targets of an NPC's power in roster order (GDD 3.12), after the checks a human's pick would meet. */
function npcTargets(room: PartyRoom, seat: string, ability: string): string[] {
  const mem = nightOf(room);
  const player = room.state.players.get(seat) as PlayerState;
  const heard = new Set(
    [...player.priv.notebook].filter((e) => e.note === NoteKind.confession).map((e) => e.of),
  );
  if (ability === 'remedy') return mem.night === 1 ? [seat] : [];
  if (ability === 'poison') return [];
  return [...room.state.players.keys()].filter(
    (id) =>
      id !== seat &&
      (ability !== 'confession' || !heard.has(id)) &&
      powerProblem(room, seat, ability, id) === null,
  );
}

/** An NPC uses each power it holds once a night, at `brain.nightPowerAtTick`, on the target its pick selects. */
function runNpcPowers(room: PartyRoom): void {
  const mem = nightOf(room);
  const tick = room.state.tick;
  if (!inWindow(room.state.phase)) return;
  for (const seat of npcMemory(room).order) {
    const player = room.state.players.get(seat);
    const brain = npcMemory(room).brains.get(seat);
    if (!player?.priv || !brain || brain.nightPowerAtTick < 0 || tick < brain.nightPowerAtTick) continue;
    if (mem.npcUsed.get(seat) === mem.night) continue;
    for (const ability of roles.roles[player.priv.role.roleId]?.abilities ?? []) {
      if (abilities.abilities[ability]?.nightPower !== true) continue;
      const list = npcTargets(room, seat, ability);
      const target = list[Math.min(list.length - 1, Math.floor(brain.nightPowerPick * list.length))];
      if (target !== undefined && powerProblem(room, seat, ability, target) === null) {
        applyPower(room, seat, ability, target);
      }
    }
    mem.npcUsed.set(seat, mem.night);
  }
}

/**
 * A stage after `runImpersonation` (`Step.ts`): clears spent powers when a dusk or the Final Night begins, resolves
 * Nightshade at daybreak, expires the Watch when the night ends, runs the NPC night powers and Last Shots, closes
 * aims and checks Inherit each tick.
 */
export function runNightPowers(room: PartyRoom): void {
  if (room.state.phase < Phase.grace) return;
  const mem = nightOf(room);
  const phase = room.state.phase;
  if (phase !== mem.phase) {
    const was = mem.phase;
    mem.phase = phase;
    // A night begins at a dusk, at a Final Night, and at a night entered by the clock from outside the window.
    if (phase === Phase.dusk || phase === Phase.finalNight || (phase === Phase.night && !inWindow(was))) {
      beginNight(room);
    }
    if (!inWindow(phase)) mem.watch.clear(); // the Watch holds until the night ends
    if (was === Phase.night && phase === Phase.day) resolvePoison(room); // the night turned to day
  }
  runNpcPowers(room);
  runNpcShots(room);
  closeAims(room);
  runInherit(room);
}

/** From `openMeeting`, before `alive` flips: Nightshade resolves and the Remedy and the Watch end. */
export function onMeetingOpenNight(room: PartyRoom): void {
  resolvePoison(room);
  const mem = nightOf(room);
  mem.remedy.clear();
  mem.watch.clear();
}

/** First line of `endReveal`: true keeps the reveal waiting for an ejected Gamekeeper's shot, or ends the match. */
export function holdReveal(room: PartyRoom): boolean {
  if (nightOf(room).aims.size > 0) return true;
  // The reveal of the forced meeting is the last thing of a match: it ends the match here (FinalNight.ts).
  if (room.state.meeting.reason === 'final') {
    finishFinalNight(room);
    return true;
  }
  return false;
}

/**
 * From `markDead`: a dying Gamekeeper (cause knife, poison or ejected) starts its aim and gets `aim {endsTick}`;
 * true defers the `killed` message until the aim closes (`sim/LastShot.ts`).
 */
export function beginAim(room: PartyRoom, seat: string, cause: DeathCause): boolean {
  return startAim(room, seat, cause);
}

/**
 * From `handleKill`, for every strike `validateKill` accepts, after the Knife's cooldown is set and before the
 * Bandage check: the striker has struck this round (Hunger), the Final Night caps the Knife's rest, and a Watch or
 * a Remedy on the target voids the strike ("nothing happens", spending the protection). A Bandage comes first, so
 * with one on the target this returns false and Kill.ts's own Bandage check voids it (`deck/wire.md` 5).
 */
export function spendProtection(room: PartyRoom, target: string, actor: string): boolean {
  const mem = nightOf(room);
  const tick = room.state.tick;
  mem.lastStrikeRound.set(actor, room.state.round);
  if (room.state.phase === Phase.finalNight) {
    const cooldowns = room.state.players.get(actor)?.priv?.cooldownEndTick;
    const cap = tick + balance.finalNight.killCooldownS * TICK_RATE;
    if (cooldowns) cooldowns.set('kill', Math.min(cooldowns.get('kill') ?? cap, cap));
  }
  const sim = simOf(room).players.get(target) as PlayerSim | undefined;
  if (!sim || sim.bandagedUntilTick > tick) return false;
  const watchman = mem.watch.get(target);
  if (watchman !== undefined) {
    mem.watch.delete(target);
    addNote(room, watchman, NoteKind.watchHeld, target);
    return true;
  }
  const herbalist = mem.remedy.get(target);
  if (herbalist !== undefined) {
    mem.remedy.delete(target);
    addNote(room, herbalist, NoteKind.remedyHeld, target);
    return true;
  }
  return false;
}

/** Whether `seat` is aiming its Last Shot: no avatar in its view (`Visibility.ts`), the win check of its batch waits. */
export function isAiming(room: PartyRoom, seat: string): boolean {
  return nightOf(room).aims.has(seat);
}

/** `resetToLobby`: `flow.deck`, `flow.undealt`, `flow.poisoned` and the night-power memory. */
export function resetNightForLobby(room: PartyRoom): void {
  dropNightMemory(room);
  const flow = flowOf(room);
  flow.deck = [];
  flow.undealt = [];
  flow.poisoned.clear();
}
