import { shuffle, type Rng } from './prng';

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
