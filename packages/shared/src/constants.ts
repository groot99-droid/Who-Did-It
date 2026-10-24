// Every radius is in tiles and is named by docs/GDD.md (3.x) or docs/ARCHITECTURE.md; balance numbers
// stay in packages/content/data/balance.json. Nothing here is invented.

export const TILE_PX = 64;

/** Server tick rate (ARCHITECTURE 5.6). */
export const TICK_RATE = 20;
/** `patchRate` in ms (ARCHITECTURE 5.6). */
export const PATCH_RATE_MS = 50;
/** `Visibility.ts` reconcile every N ticks, i.e. 5 Hz (ARCHITECTURE 5.6). */
export const VIEW_RECONCILE_EVERY_TICKS = 4;

export const MAX_PLAYERS = 10;
/** Lower bound of the party size used for the scene profile (balance.json `players.min`, GDD 3.9); Start itself needs one human (A28). */
export const MIN_PLAYERS_TO_START = 4;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;

/** Join code: 5 characters from an alphabet without 0/O/1/I (GDD 2. Create / Join). */
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Hard cap on messages per second per client (ARCHITECTURE 5.11). */
export const MAX_MESSAGES_PER_SECOND = 100;

/** `Clue.kind` indices, frozen; the ids are the keys of `clues.json` (GDD 3.4). */
export const ClueKind = {
  footprints: 0,
  thread: 1,
  felt: 2,
  fingerprint: 3,
  smear: 4,
  wetBucket: 5,
  dragSmear: 6,
  fur: 7,
  clawMarks: 8,
  /** A Hungry Killer's glowing footprints (GDD 3.3): `value` the height index, `dir` the facing. */
  hungerPrints: 9,
  /** Round 8 (8E, GDD 3.24): scuffed ground where a mugging happened; `value` the mugger's height index. */
  scuffle: 10,
} as const;
export type ClueKindId = (typeof ClueKind)[keyof typeof ClueKind];

/** `NotebookEntry.status` values (GDD 3.4; `teaching` is the grace-phase clue of GDD 2 step 5). */
export const NotebookStatus = {
  claimed: 0,
  verified: 1,
  corroborated: 2,
  forged: 3,
  teaching: 4,
} as const;

/** `NotebookEntry.note` values (GDD 3.2): 0 is a clue entry, the others a night-power entry about `of`. */
export const NoteKind = {
  clue: 0,
  confession: 1,
  watching: 2,
  watchHeld: 3,
  remedyGiven: 4,
  remedyHeld: 5,
  poisonGiven: 6,
  shot: 7,
  /** Round 7 (GDD 3.20): the Vicar's own news that a sown doubt kept its vote out of the tally; `of` is itself. */
  doubt: 8,
  /** Round 7 (GDD 3.20): the Hitman's own contract, brought by the first Train; `of` is the target seat. */
  contract: 9,
  /** Round 8 (GDD 3.23): a Blackmail Notice from the mailbag; `of` is the look it names, `sceneId` and `value` (a phase) where and when. */
  notice: 10,
} as const;
export type NoteKindId = (typeof NoteKind)[keyof typeof NoteKind];

/** Sent in `Private.cooldownEndTick[abilityId]` while a night power is spent for the current night (GDD 3.2). */
export const SPENT_TONIGHT = 0xffffffff;

/** Avatar handles: 6 random bytes in base64url, 8 characters (GDD 3.17); never drawn from a seeded stream. */
export const AVATAR_HANDLE_BYTES = 6;

/** `Settings.npcDifficulty` values, in the order of balance.json `npc.difficulty` (GDD 3.12). */
export const NpcLevel = { easy: 0, normal: 1, hard: 2 } as const;
export type NpcLevelId = (typeof NpcLevel)[keyof typeof NpcLevel];

/**
 * Round 8 (GDD 3.22, docs/round8/seams.md 2): the effect ids of `EffectState.id`, u8 on the wire; `effects.json`
 * keys its rows by the string. Append-only. `indebted` is the economy status 8D sets (GDD 3.23); it is defined
 * here so every session shares one table. `charm` is reserved for 7M's well (round 8, stations.md 4): one silent
 * charge that the first killing Knife strike spends, leaving the seat Wounded at 1 health (GDD 3.22).
 */
export const EffectId = {
  slowed: 1,
  wounded: 2,
  bleeding: 3,
  weakened: 4,
  poisoned: 5,
  fatigued: 6,
  stunned: 7,
  dazed: 8,
  famished: 9,
  knockedOut: 10,
  indebted: 11,
  charm: 12,
} as const;
export type EffectKey = keyof typeof EffectId;
export type EffectIdValue = (typeof EffectId)[EffectKey];
/** `EffectId` keys in id order, so a wire id maps back to its `effects.json` row. */
export const EFFECT_KEYS = Object.keys(EffectId) as readonly EffectKey[];

// Gameplay radii, light, noise and timers are rules numbers: they live once, in
// packages/content/data/balance.json (GDD 3.x), and are read through @wdi/content.
