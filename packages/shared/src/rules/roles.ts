import { shuffle, type Rng } from './prng';

/**
 * One roster row of `roles.json`, read by player count with no transformation:
 * role id -> how many players get it. Interface with the content session (docs/SESSIONS.md);
 * Townsfolk are an ordinary entry, so the counts must sum to the player count.
 */
export type RosterRow = Record<string, number>;
/** Keyed by player count as a string ("4" .. "10"). */
export type Roster = Record<string, RosterRow>;

export interface RulesSettings {
  /** 0 main, 1 onub. */
  mode: number;
}

export function assignRoles(
  ids: readonly string[],
  _settings: RulesSettings,
  rng: Rng,
  roster: Roster,
): Map<string, string> {
  const row = roster[String(ids.length)];
  if (!row) throw new Error(`no roster row for ${ids.length} players`);
  const deck: string[] = [];
  for (const [roleId, count] of Object.entries(row)) for (let i = 0; i < count; i++) deck.push(roleId);
  if (deck.length !== ids.length) {
    throw new Error(`roster row for ${ids.length} players deals ${deck.length} roles`);
  }
  const shuffled = shuffle(deck, rng);
  return new Map(ids.map((id, i) => [id, shuffled[i] as string]));
}

export interface TraitTriple {
  height: number;
  scarf: number;
  hat: number;
}

/** Each trait has 3 values (GDD 3.1), so a unique triple per player has 27 combinations to draw from. */
export const TRAIT_VALUES = 3;

export function dealTraits(ids: readonly string[], rng: Rng): Map<string, TraitTriple> {
  const combos: TraitTriple[] = [];
  for (let height = 0; height < TRAIT_VALUES; height++)
    for (let scarf = 0; scarf < TRAIT_VALUES; scarf++)
      for (let hat = 0; hat < TRAIT_VALUES; hat++) combos.push({ height, scarf, hat });
  if (ids.length > combos.length) throw new Error(`cannot deal ${ids.length} unique trait triples`);
  const picked = shuffle(combos, rng);
  return new Map(ids.map((id, i) => [id, picked[i] as TraitTriple]));
}
