import { type SceneId, roles, scenes } from '@wdi/content';
import type { InvariantFailure } from '@wdi/shared';
import type { PartyRoom } from '../../../rooms/PartyRoom';
import { registerInvariant } from '../../auto/invariants';
import { FACT_KEYS, FACT_KINDS, type Fact, hiveOf } from './board';

/**
 * `hiveNoSecrets` (round 8, 8R, A176; living.md 3): every entry of the hive's blackboard is something anyone standing
 * there could perceive. A fact carries only the keys of `FACT_KEYS`, in a known scene; no value names a seat except
 * a body's `of` (the public `Body.of`) and a sighting's `lookOf` (the seat whose look is drawn, never the walker
 * under an impersonation); a heard kind is never a role id; and the board itself holds only its facts, the phase and
 * the difficulty. Checked on every run of the registry, so on every tick of `pnpm auto`.
 */

const BOARD_KEYS: ReadonlySet<string> = new Set(['facts', 'phase', 'difficulty', 'serial']);
const KINDS: ReadonlySet<string> = new Set(FACT_KINDS);
const ROLE_IDS: ReadonlySet<string> = new Set(Object.keys(roles.roles));

/** What is wrong with one fact, or null. */
export function factProblem(room: PartyRoom, fact: Fact): string | null {
  if (!KINDS.has(fact.kind)) return `kind ${String(fact.kind)}`;
  for (const key of Object.keys(fact)) if (!FACT_KEYS.has(key)) return `key ${key}`;
  if (!(fact.sceneId in scenes)) return `scene ${fact.sceneId}`;
  const seats = room.state.players;
  for (const key of ['ref', 'what'] as const) {
    const v = fact[key];
    if (v !== undefined && seats.has(v)) return `${key} names a seat`;
  }
  if (fact.of !== undefined && fact.kind !== 'body') return 'of outside a body';
  if (fact.lookOf !== undefined && fact.kind !== 'sighting') return 'lookOf outside a sighting';
  const scene = room.state.scenes.get(fact.sceneId as SceneId);
  if (fact.kind === 'body') {
    const body = scene?.bodies.get(fact.ref);
    if (body && body.of !== fact.of) return 'of is not the body’s';
  }
  if (fact.kind === 'sighting') {
    const avatar = scene?.avatars.get(fact.ref);
    if (avatar && avatar.lookOf !== fact.lookOf) return 'lookOf is not the drawn look';
  }
  if (fact.what !== undefined && fact.kind !== 'creature' && ROLE_IDS.has(fact.what))
    return 'what names a card';
  return null;
}

registerInvariant('hiveNoSecrets', (room): InvariantFailure | null => {
  const board = hiveOf(room);
  for (const key of Object.keys(board)) {
    if (!BOARD_KEYS.has(key)) return { name: '', tick: room.state.tick, detail: `board holds ${key}` };
  }
  for (const [key, fact] of board.facts) {
    const problem = factProblem(room, fact);
    if (problem) return { name: '', tick: room.state.tick, detail: `${key}: ${problem}` };
  }
  return null;
});
