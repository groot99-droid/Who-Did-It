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
} as const;
export type NoteKindId = (typeof NoteKind)[keyof typeof NoteKind];

/** Sent in `Private.cooldownEndTick[abilityId]` while a night power is spent for the current night (GDD 3.2). */
export const SPENT_TONIGHT = 0xffffffff;

/** Avatar handles: 6 random bytes in base64url, 8 characters (GDD 3.17); never drawn from a seeded stream. */
export const AVATAR_HANDLE_BYTES = 6;

/**
 * Quick mode (GDD 3.11): every ONUB seat sits in the `loft` pseudo-scene, index 255 in `Player.sceneId`, from
 * prep to the lobby reset, so the server encodes no presence for anyone; it has no SceneState and is not a
 * content scene. The name is the round-4 one; nothing in ONUB v2 draws a loft.
 */
export const LOFT_SCENE_ID = 'loft';
export const LOFT_SCENE_INDEX = 255;

/** Quick-mode act ids (`act.ability`) start with this prefix (ARCHITECTURE 5.14). */
export const ONUB_ACT_PREFIX = 'onub.';
/**
 * The Evening Prep commit (GDD 3.11): `act.ability {abilityId: ONUB_PREP, targets: [stationId, cardId]}`, once
 * per seat in `Phase.dusk`. Not a night act, so not in `balance.onub.json` `acts`.
 */
export const ONUB_PREP = 'onub.prep';
/**
 * The night act ids of GDD 3.11, exactly the keys of `balance.onub.json` `acts` (a server test asserts it).
 * Each window's acts and their rules are content; these names exist so code can switch on them.
 */
export const ONUB_ACTS = {
  cloche: 'onub.cloche',
  sporePeek: 'onub.sporePeek',
  peekLoc: 'onub.peekLoc',
  vent: 'onub.vent',
  peekRole: 'onub.peekRole',
  peekPantry: 'onub.peekPantry',
  peekLocs: 'onub.peekLocs',
  rob: 'onub.rob',
  laminatePeek: 'onub.laminatePeek',
  laminateSwap: 'onub.laminateSwap',
  drunk: 'onub.drunk',
  dishRoles: 'onub.dishRoles',
  dishLocs: 'onub.dishLocs',
  inspect: 'onub.inspect',
} as const;
export type OnubActName = (typeof ONUB_ACTS)[keyof typeof ONUB_ACTS];
/** The Pantry as a `meeting.vote` target and a claim target (GDD 3.11); never a seat id. */
export const PANTRY_VOTE = 'pantry';

/** `Settings.npcDifficulty` values, in the order of balance.json `npc.difficulty` (GDD 3.12). */
export const NpcLevel = { easy: 0, normal: 1, hard: 2 } as const;
export type NpcLevelId = (typeof NpcLevel)[keyof typeof NpcLevel];

// Gameplay radii, light, noise and timers are rules numbers: they live once, in
// packages/content/data/balance.json (GDD 3.x), and are read through @wdi/content.
