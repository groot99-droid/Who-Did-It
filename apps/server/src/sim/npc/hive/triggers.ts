import { balance } from '@wdi/content';
import { TICK_RATE, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../../rooms/PartyRoom';
import { type PlayerSim, simOf } from '../../RoomSim';
import { isWorldPhase } from '../../World';
import type { Brain, NpcMemory } from '../memory';
import { type Blackboard, type Fact, hiveOf } from './board';

/**
 * The hive's trigger registry (round 8, 8R, A176; living.md 3). A trigger reads the blackboard through one NPC's
 * senses and proposes a reaction: **potential** (an opportunity: an unlit lamp, an open shop), **state** (the phase,
 * a mood or need, the difficulty) or **proximity** (a body, a creature, a noise, the bell). The best proposal is
 * written into the seat's slot and becomes due after a stagger drawn from the seat and the reaction, so a town that
 * hears one scream never moves in lockstep (npcTells T10 to T12); the brain runs a due reaction as `mode = 'react'`.
 * The stagger is a hash, not a draw: no seat's streams move for it.
 */

export type TriggerKind = 'potential' | 'state' | 'proximity';

export interface TriggerContext {
  room: PartyRoom;
  board: Blackboard;
  seat: string;
  player: PlayerState;
  brain: Brain;
  p: PlayerSim;
  tick: number;
}

/** What a trigger proposes: `key` names the reaction, so the same one proposed again keeps its due tick. */
export interface Proposal {
  key: string;
  fact?: Fact;
  goal?: { scene: number; x: number; y: number };
}

export interface Reaction extends Proposal {
  trigger: string;
  kind: TriggerKind;
  /** The trigger's priority: each tick the highest trigger that proposes anything fills the slot. */
  priority: number;
  /** The tick it was first proposed, and the tick it becomes due. */
  sinceTick: number;
  dueTick: number;
}

export interface Trigger {
  id: string;
  kind: TriggerKind;
  priority: number;
  fire(ctx: TriggerContext): Proposal | null;
}

const registry: Trigger[] = [];

/** Registers a trigger, kept in priority order (highest first); the same id replaces the old one. */
export function registerTrigger(trigger: Trigger): void {
  const at = registry.findIndex((t) => t.id === trigger.id);
  if (at >= 0) registry.splice(at, 1);
  registry.push(trigger);
  registry.sort((a, b) => b.priority - a.priority);
}

export function registeredTriggers(): readonly Trigger[] {
  return registry;
}

const slots = new WeakMap<PartyRoom, Map<string, Reaction>>();
function slotsOf(room: PartyRoom): Map<string, Reaction> {
  let map = slots.get(room);
  if (!map) slots.set(room, (map = new Map()));
  return map;
}

/** FNV-1a over the seat and the reaction key, as a fraction in [0, 1). */
function hashFrac(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 0x100000000;
}

/** The stagger of one seat's reaction: inside `npc.hive.staggerS`, the same for the same seat and key. */
export function staggerTicks(seat: string, key: string): number {
  const { min, max } = balance.npc.hive.staggerS;
  return Math.round((min + hashFrac(`${seat}|${key}`) * (max - min)) * TICK_RATE);
}

/**
 * Runs every trigger for every living, placed NPC seat in a world phase and keeps each seat's slot: the best
 * proposal this tick, with its due tick kept while the same reaction is proposed again; a slot nothing proposes
 * is emptied. Outside a world phase every slot is emptied.
 */
export function runTriggers(room: PartyRoom, mem: NpcMemory): void {
  const all = slotsOf(room);
  if (!isWorldPhase(room.state.phase)) {
    all.clear();
    return;
  }
  const board = hiveOf(room);
  const sim = simOf(room);
  const tick = room.state.tick;
  for (const seat of mem.order) {
    const player = room.state.players.get(seat);
    const p = sim.players.get(seat);
    if (!player || !p || p.dead || !p.placed) {
      all.delete(seat);
      continue;
    }
    const ctx: TriggerContext = { room, board, seat, player, brain: mem.brain(seat), p, tick };
    const held = all.get(seat);
    let next: Reaction | null = null;
    for (const trigger of registry) {
      const proposal = trigger.fire(ctx);
      if (!proposal) continue;
      const same = held && held.trigger === trigger.id && held.key === proposal.key;
      next = same
        ? { ...held, ...proposal }
        : {
            ...proposal,
            trigger: trigger.id,
            kind: trigger.kind,
            priority: trigger.priority,
            sinceTick: tick,
            dueTick: tick + staggerTicks(seat, `${trigger.id}:${proposal.key}`),
          };
      break;
    }
    if (next) all.set(seat, next);
    else all.delete(seat);
  }
}

/** The seat's reaction once it is due, else null; the brain runs it as `mode = 'react'`. */
export function dueReaction(room: PartyRoom, seat: string): Reaction | null {
  const reaction = slotsOf(room).get(seat);
  return reaction && room.state.tick >= reaction.dueTick ? reaction : null;
}

/** The seat's reaction, due or not (tests and the admin view read it). */
export function heldReaction(room: PartyRoom, seat: string): Reaction | null {
  return slotsOf(room).get(seat) ?? null;
}
