import { balance } from '@wdi/content';
import { TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { AnimId } from '../constants';
import { emitSim } from '../events/bus';
import { type MobBody, mobBodies } from '../Mobs';
import { guardTarget, strikeGuard } from '../law/Guards';
import { strengthOf } from '../JailGames';
import { MobState } from '../mobs/ai';
import { figureOfHandle } from '../townsfolk/figures';
import { reject } from '../World';
import { CLIP_TICKS, hurt, showClip } from './damage';
import { factorOf, hasEffect } from './effects';
import { bodyOf } from './state';
import { inReach, openVerb, seatInReach, startCooldown } from './verbs';

/**
 * The fists and the slingshot (GDD 3.22; docs/round8/body.md 4). A strike is every card's, in every world phase,
 * at `body.strikeStamina` of stamina; it lands `body.damage.strike` on a seat (a knockout at zero health, never a
 * death) or on a creature, which dies at zero of its `mobs.json` health (A142). The swing is public: the actor's
 * `strike` clip rides its presence. The Knife is untouched (A89).
 */

/** What the fists remember of a creature, by its body in room memory; a despawned creature takes it along. */
interface CreatureHurt {
  hp: number;
  /** The tick it died, -1 while it lives. */
  diedTick: number;
  /** Its flinch (`AnimId.hurt`) shows on the wire until this tick. */
  hurtUntilTick: number;
}

const hurts = new WeakMap<MobBody, CreatureHurt>();
function hurtOf(mob: MobBody): CreatureHurt {
  let h = hurts.get(mob);
  if (!h) hurts.set(mob, (h = { hp: mob.def.hp, diedTick: -1, hurtUntilTick: 0 }));
  return h;
}

/** A creature's health now: its row's `hp` until a fist lands. */
export const creatureHpOf = (mob: MobBody): number => hurts.get(mob)?.hp ?? mob.def.hp;

/** `act.ability {abilityId: 'strike', targetId}`: `targetId` is an avatar handle or a creature id. */
export function handleStrike(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const v = openVerb(room, sessionId, 'strike');
  if (!v) return;
  const b = balance.body;
  const mob = typeof payload.targetId === 'string' ? mobBodies(room).get(payload.targetId) : undefined;
  const guard = mob
    ? undefined
    : guardTarget(room, sessionId, v, payload.targetId, (h) => figureOfHandle(room, h));
  if (guard === null) return; // round 10, B1: a guard's handle, refused
  let targetId: string | null = null;
  if (mob) {
    if (mob.site.sceneIdx !== v.actor.sceneIdx || mob.mind.state === MobState.dead) {
      reject(room, sessionId, 'NO_TARGET');
      return;
    }
    if (!inReach(v, mob.x, mob.y)) {
      reject(room, sessionId, 'TOO_FAR', { of: 'person' });
      return;
    }
  } else if (!guard) {
    targetId = seatInReach(room, sessionId, v, payload.targetId);
    if (targetId === null) return;
    if (hasEffect(bodyOf(room, targetId)!, 'knockedOut')) {
      reject(room, sessionId, 'TARGET_DOWN');
      return;
    }
  }
  const factor = factorOf(v.body, (d) => d.strikeFactor);
  // Round 10, D8: the jail's gym adds its Strength to a fist (GDD 3.27).
  const spec = { ...b.damage.strike, dmg: b.damage.strike.dmg + strengthOf(room, sessionId) };
  v.body.stamina = Math.max(0, v.body.stamina - b.strikeStamina);
  startCooldown(
    v,
    factorOf(v.body, (d) => d.strikeCooldownFactor),
  );
  showClip(v.body, AnimId.strike, v.tick);
  if (mob) hurtCreature(room, mob, Math.max(0, Math.round(spec.dmg * factor)), sessionId);
  else if (guard) strikeGuard(room, guard, spec, sessionId, 'strike', factor);
  else if (targetId !== null) hurt(room, targetId, spec, { source: 'strike', by: sessionId, factor });
}

/**
 * A fist lands on a creature: `body.hit` with the creature's id as the target, the flinch on its row, and at zero
 * health its death (A142): the chase ends, it lies where it stands with `state` `dead` on the wire, and
 * `runCreatures` takes its row away after `body.creatureCorpseS`. Its body stays in `Mobs.ts`' memory, dead, until
 * its part of the day ends, so the spawner stands empty until the creature's next waking part.
 */
export function hurtCreature(room: PartyRoom, mob: MobBody, dmg: number, by: string): 'hurt' | 'killed' {
  const tick = room.state.tick;
  const h = hurtOf(mob);
  h.hp = Math.max(0, h.hp - dmg);
  h.hurtUntilTick = tick + CLIP_TICKS;
  emitSim(room, {
    tick,
    kind: 'body.hit',
    sceneId: mob.site.scene,
    data: { target: mob.id, by, source: 'strike', dmg, effects: [] },
  });
  if (h.hp > 0) return 'hurt';
  h.diedTick = tick;
  const mind = mob.mind;
  mind.state = MobState.dead;
  mind.prey = null;
  mind.homing = false;
  mob.goal = null;
  mob.path = null;
  mob.moving = false;
  mob.reachSinceTick = -1;
  mob.swingUntilTick = 0;
  return 'killed';
}

/**
 * The creatures' part of the body stage (`runBody`, after `runMobs` has published): a hurt creature's row shows
 * `AnimId.hurt` for its flinch over the clip `Mobs.ts` published, and a dead creature's row leaves the scene
 * `body.creatureCorpseS` after it fell (GDD 3.15, 3.22). `Mobs.ts` is untouched (A142).
 */
export function runCreatures(room: PartyRoom): void {
  const tick = room.state.tick;
  const corpseTicks = Math.round(balance.body.creatureCorpseS * TICK_RATE);
  for (const mob of mobBodies(room).values()) {
    const h = hurts.get(mob);
    if (!h) continue;
    const rows = room.state.scenes.get(mob.site.scene)?.mobs;
    const row = rows?.get(mob.id);
    if (!row) continue;
    if (h.diedTick >= 0) {
      if (tick - h.diedTick >= corpseTicks) rows!.delete(mob.id);
    } else if (tick < h.hurtUntilTick && row.animId !== AnimId.hurt) row.animId = AnimId.hurt;
  }
}

/** `act.ability {abilityId: 'slingshot', targetId}`: the Child's, with the Slingshot in the kit, a handle in reach. */
export function handleSlingshot(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const v = openVerb(room, sessionId, 'slingshot');
  if (!v) return;
  const guard = guardTarget(room, sessionId, v, payload.targetId, (h) => figureOfHandle(room, h));
  if (guard === null) return;
  if (guard) {
    startCooldown(v);
    showClip(v.body, AnimId.strike, v.tick);
    strikeGuard(room, guard, balance.body.damage.slingshot, sessionId, 'slingshot');
    return;
  }
  const targetId = seatInReach(room, sessionId, v, payload.targetId);
  if (targetId === null) return;
  if (hasEffect(bodyOf(room, targetId)!, 'knockedOut')) {
    reject(room, sessionId, 'TARGET_DOWN');
    return;
  }
  startCooldown(v);
  showClip(v.body, AnimId.strike, v.tick);
  hurt(room, targetId, balance.body.damage.slingshot, { source: 'slingshot', by: sessionId });
}
