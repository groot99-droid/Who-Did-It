import { z } from 'zod';
import { GddRef, Id, Seconds, Tiles, byPlayerCount } from './common.js';

export const NOISE_KEYS = [
  'walk',
  'run',
  'door',
  'killScream',
  'rag',
  'skeletonKey',
  'crowbar',
  'bolt',
  'lockpick',
  'hide',
  'burst',
  'oneWayDrop',
  'goat',
  'wispRattle',
] as const;
export const NoiseKey = z.enum(NOISE_KEYS);
export type NoiseKey = z.infer<typeof NoiseKey>;

export const Profile = z.enum(['small', 'medium', 'large']);
export type Profile = z.infer<typeof Profile>;
export const PROFILE_RANK: Record<Profile, number> = { small: 0, medium: 1, large: 2 };

export const BalanceRow = z.strictObject({
  killCooldownS: Seconds,
  /** After any kill, no Killer may kill for this long (two-Killer games). */
  globalKillLockS: Seconds,
  discussionS: Seconds,
  tasksEach: z.number().int().positive(),
  /** `villageAtMostOne`: Cabal wins when living Village <= 1 (4-5 players). */
  cabalWin: z.enum(['parity', 'villageAtMostOne']),
  profile: Profile,
  gddRef: GddRef,
});
export type BalanceRow = z.infer<typeof BalanceRow>;

const Section = <T extends z.ZodRawShape>(shape: T) => z.strictObject({ ...shape, gddRef: GddRef });

export const NpcDifficulty = z.enum(['easy', 'normal', 'hard']);
export type NpcDifficulty = z.infer<typeof NpcDifficulty>;
const Chance = z.number().min(0).max(1);
export const NpcDifficultyRow = z.strictObject({
  /** A Killer NPC strikes a human alone in its scene at night with this chance per 10 s of opportunity. */
  killChancePer10s: Chance,
  reportDelayS: Seconds,
  /** False clues an Accomplice NPC plants per night. */
  plantsPerNight: z.number().int().nonnegative(),
  /** Chance an NPC votes for the top Case Board suspect rather than Skip. */
  suspectVoteChance: Chance,
});
export type NpcDifficultyRow = z.infer<typeof NpcDifficultyRow>;

export const BalanceFile = z.strictObject({
  gddRef: GddRef,
  tickHz: z.number().int().positive(),
  players: Section({ min: z.literal(4), max: z.literal(10) }),
  lobby: Section({
    nameMin: z.number().int().positive(),
    nameMax: z.number().int().positive(),
    codeLength: z.number().int().positive(),
    codeAlphabet: z.string().regex(/^[A-Z2-9]+$/),
    /** Humans needed to press Start; below `players.min` the seats are NPC-filled (GDD 3.12). */
    startMinHumans: z.number().int().min(1),
  }),
  phases: Section({
    roleRevealS: Seconds,
    countdownS: Seconds,
    graceS: Seconds,
    dayS: Seconds,
    duskS: Seconds,
    nightS: Seconds,
    voteS: Seconds,
    revealS: Seconds,
    immunityS: Seconds,
  }),
  /** Keyed "4".."10". Cabal size and which specials play come from roles.json rosters. */
  byCount: byPlayerCount(BalanceRow),
  meeting: Section({
    voteOpensImmediately: z.boolean(),
    endsWhenAllVoted: z.boolean(),
    secretVotes: z.boolean(),
    skipAllowed: z.boolean(),
    wrongEjectionDiscussionBonusS: Seconds,
    /** After this many consecutive no-ejection meetings Skip is disabled for the next vote. */
    noEjectionStreak: z.number().int().positive(),
    /** With Skip disabled a player needs at least ceil(living / divisor) votes. */
    forcedVoteDivisor: z.number().int().positive(),
    presentPerPlayer: z.number().int().nonnegative(),
    suspectSetMax: z.number().int().positive(),
  }),
  finalNight: Section({
    afterCycle: z.number().int().positive(),
    huntS: Seconds,
    killCooldownS: Seconds,
    skipAllowed: z.boolean(),
    tieEjectsNobody: z.boolean(),
  }),
  snowball: Section({
    /** Applies when living Village <= living Cabal + margin. */
    villageMargin: z.number().int().nonnegative(),
    killCooldownPenaltyS: Seconds,
    nextKillTraitClues: z.number().int().positive(),
    /** One Killer left with at least this many alive: kill CD changes by `lastKillerCooldownDeltaS`. */
    lastKillerMinAlive: z.number().int().positive(),
    lastKillerCooldownDeltaS: z.number(),
  }),
  hunger: Section({ cyclesWithoutKill: z.number().int().positive() }),
  disconnect: Section({ deathAfterS: Seconds }),
  clues: Section({
    traitCluesPerKill: z.number().int().positive(),
    /** The first body of the match always spawns this many trait clues and a Dust-able print. */
    firstBodyTraitClues: z.number().int().positive(),
    capPerScene: z.number().int().positive(),
    collectHoldS: Seconds,
  }),
  health: Section({
    maxHp: z.number().int().positive(),
    regenHp: z.number().int().positive(),
    regenEveryS: Seconds,
    knifeDamage: z.number().int().positive(),
    wolfDamage: z.number().int().positive(),
    woundedS: Seconds,
    woundedSpeedFactor: z.number().positive().max(1),
  }),
  movement: Section({
    walkTilesPerS: z.number().positive(),
    runTilesPerS: z.number().positive(),
    sneakFactor: z.number().positive().max(1),
  }),
  vision: Section({ dayTiles: Tiles, nightTiles: Tiles, childDeltaTiles: z.number() }),
  noise: Section({
    ...(Object.fromEntries(NOISE_KEYS.map((k) => [k, Tiles])) as Record<
      (typeof NOISE_KEYS)[number],
      typeof Tiles
    >),
    portalFactor: z.number().positive().max(1),
  }),
  doors: Section({
    swingS: Seconds,
    transitS: Seconds,
    sceneFadeS: Seconds,
  }),
  tasks: Section({
    cabalFakeList: z.boolean(),
    ghostShareCap: z.number().min(0).max(1),
  }),
  wolves: Section({
    count: z.number().int().nonnegative(),
    fleeLightTiles: Tiles,
    gateClearingTiles: Tiles,
    intrudersWhenFenceBroken: z.number().int().nonnegative(),
  }),
  npc: Section({
    /** Below this many NPC seats the difficulty setting is off and NPCs play `defaultDifficulty`. */
    difficultyMinNpcs: z.number().int().positive(),
    defaultDifficulty: NpcDifficulty,
    difficulty: z.strictObject({
      easy: NpcDifficultyRow,
      normal: NpcDifficultyRow,
      hard: NpcDifficultyRow,
    }),
  }),
  ghosts: Section({ wispsPerCycle: z.number().int().nonnegative() }),
  chat: Section({
    quickChatRadiusTiles: Tiles,
    quickChat: z.array(z.strictObject({ id: Id, text: z.string().min(1) })).length(8),
  }),
});
export type BalanceFile = z.infer<typeof BalanceFile>;
