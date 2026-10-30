import { z } from 'zod';
import { GddRef, Id, Ships } from './common.js';
import { NoiseKey } from './balance.js';

/**
 * Round 10 (A9; docs/round9/logic-table.md 3, GDD 3.14): the logic table. An interaction is a verb a tool (or bare
 * hands) performs on a target class, with a result and a failure line per reason. A9 lands the schema, the live
 * classes and the census decision of every placed prop; the resolver (A10) and the tool walls (A11) add behaviour.
 */

/** Capability tags a tool carries; append only, like `SCENE_IDS`. */
export const ToolTag = z.enum(['cut', 'break', 'dig', 'pick', 'pry', 'skin']);
export type ToolTag = z.infer<typeof ToolTag>;

const PropKind = z.string().regex(/^[a-z][A-Za-z]*$/);
/** The name of a prop id minus its prefix and a trailing `_<n>` or `<n>`: `ov.woodpile_2` is `woodpile`. */
const Stem = z.string().regex(/^[a-z][a-z0-9_]*[a-z]$/, 'stems are snake_case without a trailing number');
/** A class id: camelCase, or `node:<resource>` for a resource node's class. */
export const ClassId = z
  .string()
  .regex(/^(node:)?[a-z][A-Za-z0-9]*$/, 'class ids are camelCase or node:<id>');
/** A refusal reason (`failures.md` 4); A10 checks the key against `RefusalReason` once A1 has landed. */
const ReasonKey = z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'reasons are SCREAMING_SNAKE');

const Qty = z.tuple([z.number().int().positive(), z.number().int().positive()]);

export const Drop = z.strictObject({ item: Id, qty: Qty, chance: z.number().gt(0).max(1).optional() });

export const ClassMatch = z
  .strictObject({
    /** Prop kinds this class answers for. */
    kinds: z.array(PropKind).min(1).optional(),
    /** Stems of `dressing` and `decor` props (the census reads those two kinds by stem). */
    stems: z.array(Stem).min(1).optional(),
    /** A resource node of this resource (`resources.json`). */
    resource: Id.optional(),
    /** Every portal with a `lock`. */
    portalLock: z.literal(true).optional(),
    /** Round 10 (S1): every `dressing` or `decor` prop with this census decision that no other class takes. */
    census: z.enum(['live', 'interact', 'container', 'keep']).optional(),
  })
  .refine((m) => Object.keys(m).length > 0, 'a class matches something');

export const InteractionClass = z.strictObject({ name: z.string().min(1), match: ClassMatch });
export type InteractionClass = z.infer<typeof InteractionClass>;

export const Mode = z
  .strictObject({
    /** Capability a held item must carry; null = bare hands. */
    tool: z.strictObject({ tag: ToolTag, tier: z.number().int().min(1).max(3) }).nullable(),
    /** Stems this mode applies to when the class has several. Default: all. */
    only: z.array(Stem).min(1).optional(),
    /** Required unless `minigame` is set. */
    holdS: z.number().positive().optional(),
    drops: z.array(Drop).optional(),
    /** A key of `lootTables`. */
    loot: Id.optional(),
    consumes: z.array(z.strictObject({ item: Id, qty: z.number().int().positive() })).optional(),
    /** Uses taken from the tool's durability; 0 = none. */
    wear: z.number().int().min(0).default(0),
    noise: NoiseKey.nullable().default(null),
    /** The trace an opened lock or a handled thing leaves: a print (GDD 3.4) or the role-neutral scratch. */
    leaves: z.enum(['print', 'scratch']).optional(),
    /** A `minigames.json` kind that runs in place of a plain hold (owner answer LT2). */
    minigame: Id.optional(),
    /** Chance a fine lands with no witness. */
    fineChance: z.number().min(0).max(1).optional(),
    unlocks: z.union([z.literal(true), z.literal('broken')]).optional(),
  })
  .refine((m) => m.holdS !== undefined || m.minigame !== undefined, 'a mode needs holdS or a minigame');
export type Mode = z.infer<typeof Mode>;

export const Interaction = z
  .strictObject({
    verb: z.string().regex(/^[a-z]+$/),
    /** The prompt, "Chop". */
    label: z.string().min(1),
    /** A key of `classes`. */
    target: ClassId,
    /** The server routine that runs the hold: the generic ones, or a legacy action kept as an alias. */
    handler: z.enum([
      'stock',
      'search',
      'lock',
      'craft',
      'gather',
      'task',
      'shop',
      'bank',
      'civic',
      'collect',
    ]),
    /** `nfy` answers NFY with `feature` (failures.md). */
    status: z.enum(['live', 'nfy']),
    feature: z.string().min(1).optional(),
    phases: z.array(z.enum(['day', 'night'])).min(1),
    /** Ordered best first: the first mode whose tool the seat holds runs. */
    modes: z.array(Mode).min(1),
    after: z.strictObject({ state: Id, respawnS: z.number().positive().nullable() }).optional(),
    ownership: z.enum(['wild', 'public', 'owned']),
    /** The crime a witness reports when `ownership` is `owned`. */
    crime: z.enum(['theft', 'trespass', 'vandalism']).nullable().optional(),
    /** Per reason, the line in the world's voice; a missing reason uses the generic line. */
    fail: z.record(ReasonKey, z.string().min(1)),
    hint: z.string().optional(),
    ships: Ships,
  })
  .refine((i) => (i.status === 'nfy') === (i.feature !== undefined), 'an nfy interaction names its feature');
export type Interaction = z.infer<typeof Interaction>;

export const LootTable = z.strictObject({
  name: z.string().min(1),
  rolls: Qty,
  /** Weights are relative; a null item is the empty draw. */
  entries: z
    .array(
      z.strictObject({
        item: Id.nullable(),
        w: z.number().positive(),
        qty: Qty.optional(),
        /** Round 10 (S1): the lowest container tier that may draw this entry (logic-table.md 6.2). Default 1. */
        tier: z.number().int().min(1).max(3).optional(),
      }),
    )
    .min(1),
});

/**
 * Round 10 (S1; logic-table.md 6.2 to 6.4, GDD 3.14): which containers hold loot in a match, and from which table.
 * `themes` and `stems` map a table to the scenes or stems that draw from it, split by spaces; a stem's table wins.
 */
export const ContainerRules = z.strictObject({
  /** Classes whose props are furniture unless dealt active. */
  classes: z.array(ClassId).min(1),
  /** Classes whose verb works on every prop, and whose active props also give their contents. */
  stocked: z.array(ClassId),
  /** The locked classes: capped per scene, spaced apart and never below `chestMinTier`. */
  chestGrade: z.array(ClassId),
  activeFrac: z.number().gt(0).max(1),
  keepClearTiles: z.number().min(0),
  minSpacingTiles: z.number().min(0),
  chestCap: z.strictObject({
    interior: z.number().int().min(0),
    exterior: z.number().int().min(0),
    exteriorMinFloor: z.number().int().min(0),
  }),
  /** The most portal hops from the hub that are still tier 1, and tier 2; more is tier 3, as is a dark cave. */
  tierHops: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  chestMinTier: z.number().int().min(1).max(3),
  /** The line an empty search gives its searcher. */
  empty: z.string().min(1),
  themes: z.record(Id, z.string().regex(/^[a-z][a-z_ ]*$/)),
  stems: z.record(Id, z.string().regex(/^[a-z][a-z0-9_ ]*$/)),
});
export type ContainerRules = z.infer<typeof ContainerRules>;

/**
 * The census decision of every placed prop (logic-table.md 5): `live` the sim reads it today, `interact` a tool, a
 * station or a bare-hands verb works on it, `container` it holds loot, `keep` decoration on purpose. `dressing` and
 * `decor` props are decided by stem, every other prop by kind. A list entry holds several names split by spaces, so
 * the file stays short.
 */
export const CENSUS_DECISIONS = ['live', 'interact', 'container', 'keep'] as const;
export type CensusDecision = (typeof CENSUS_DECISIONS)[number];
const CensusLists = z.partialRecord(z.enum(CENSUS_DECISIONS), z.array(z.string().regex(/^[a-z][\w ]*$/)));

export const InteractionsFile = z.strictObject({
  gddRef: GddRef,
  tags: z.record(ToolTag, z.strictObject({ name: z.string().min(1), tiers: z.number().int().min(1).max(3) })),
  classes: z.record(ClassId, InteractionClass),
  interactions: z.record(Id, Interaction),
  lootTables: z.record(Id, LootTable),
  containers: ContainerRules,
  census: z.strictObject({ kinds: CensusLists, stems: CensusLists }),
});
export type InteractionsFile = z.infer<typeof InteractionsFile>;

/** The kinds the census reads by stem. */
export const STEM_KINDS: ReadonlySet<string> = new Set(['dressing', 'decor']);

/** `ov.woodpile_2` -> `woodpile`. */
export const propStem = (id: string): string => (id.split('.')[1] ?? id).replace(/_?\d+$/, '');

/** Every name of a census list, with its decision; a name listed twice keeps its first decision. */
export function censusMap(lists: z.infer<typeof CensusLists>): Map<string, CensusDecision> {
  const out = new Map<string, CensusDecision>();
  for (const d of CENSUS_DECISIONS)
    for (const entry of lists[d] ?? [])
      for (const name of entry.split(/\s+/)) if (!out.has(name)) out.set(name, d);
  return out;
}

/** The census decision of one prop, or undefined if the census misses it. */
export function decideProp(
  file: InteractionsFile,
  prop: { id: string; kind: string },
): CensusDecision | undefined {
  return STEM_KINDS.has(prop.kind)
    ? censusMap(file.census.stems).get(propStem(prop.id))
    : censusMap(file.census.kinds).get(prop.kind);
}

/**
 * The ids of every class whose match takes this prop; a valid table gives at most one. A class matching by census
 * decision takes a stem prop only when no class names it.
 */
export function classesOfProp(file: InteractionsFile, prop: { id: string; kind: string }): string[] {
  const stem = STEM_KINDS.has(prop.kind) ? propStem(prop.id) : undefined;
  const named = Object.entries(file.classes)
    .filter(
      ([, c]) =>
        (c.match.kinds?.includes(prop.kind) ?? false) ||
        (stem !== undefined && (c.match.stems?.includes(stem) ?? false)),
    )
    .map(([id]) => id);
  if (named.length > 0 || stem === undefined) return named;
  const decision = decideProp(file, prop);
  return Object.entries(file.classes)
    .filter(([, c]) => c.match.census !== undefined && c.match.census === decision)
    .map(([id]) => id);
}
