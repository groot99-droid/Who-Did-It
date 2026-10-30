import { z } from 'zod';
import { GddRef, Id, Seconds, Tiles, byPlayerCount } from './common.js';
import { EffectKey } from './effects.js';

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
  'shot',
  'shout',
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
const Frac = z.number().gt(0).lte(1);
const Count = z.number().int().positive();
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
/** A `{min, max}` span drawn uniformly (GDD 3.12); `validate.ts` checks min <= max. */
const Span = z.strictObject({ min: z.number().nonnegative(), max: z.number().nonnegative() });
/** A `{min, max}` span of whole tiles. */
const TileSpan = z.strictObject({ min: z.number().int().positive(), max: z.number().int().positive() });
/** A `{min, max}` span of fractions of a phase. */
const FracSpan = z.strictObject({ min: Chance, max: Chance });
/** The next activity's weights in one phase class; each row sums to 1 (validate.ts). */
const RoutineWeights = z.strictObject({ work: Chance, stroll: Chance, idle: Chance });
/**
 * One row of the damage table (GDD 3.22, round 8): the health it takes, each effect it may apply with its chance,
 * and whether zero health from it is a death (else a knockout). The effect keys are `effects.json` ids.
 */
export const DamageRow = z.strictObject({
  dmg: z.number().int().positive(),
  effects: z.record(z.string().regex(/^[a-z][A-Za-z0-9]*$/), Chance),
  kills: z.boolean(),
});
export type DamageRow = z.infer<typeof DamageRow>;
/** A mood's factors on the routine weights (round 8, GDD 3.24). */
const MoodWeights = z.strictObject({
  work: z.number().nonnegative(),
  stroll: z.number().nonnegative(),
  idle: z.number().nonnegative(),
});

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
  /** Round 7 (GDD 3.21, `docs/round7/parties.md`): the device profile, the friends and invited lists, the party list. */
  party: Section({
    profileCodeLength: z.number().int().positive(),
    friendsMax: z.number().int().positive(),
    invitedMax: z.number().int().positive(),
    listMax: z.number().int().positive(),
    listRefreshS: z.number().positive(),
  }),
  phases: Section({
    roleRevealS: Seconds,
    countdownS: Seconds,
    graceS: Seconds,
    /** Round 6 (GDD 3.18): the opening cutscene's seconds, added to grace at `beginPlay` when the map has an opening. */
    openingS: Seconds,
    dayS: Seconds,
    duskS: Seconds,
    nightS: Seconds,
    voteS: Seconds,
    revealS: Seconds,
    immunityS: Seconds,
    /** The end screen holds this long, then the room returns to the lobby with the same code (A30). */
    gameOverS: Seconds,
  }),
  /** Keyed "4".."10". Cabal size and which specials play come from roles.json decks. */
  byCount: byPlayerCount(BalanceRow),
  meeting: Section({
    /** Round 8 (8L, A190): a vote cast before this many seconds of the discussion is refused (GDD 3.8). */
    minVoteS: Seconds,
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
    /** Round 8 (GDD 3.3): the discussion of the trial, the forced meeting after the hunt; longer than any meeting's. */
    trialS: Seconds,
    killCooldownS: Seconds,
    skipAllowed: z.boolean(),
    tieEjectsNobody: z.boolean(),
    /** A body report ends the Final Night hunt at once (GDD 3.3; the Bell is silent after dark). */
    reportEndsHunt: z.boolean(),
  }),
  /**
   * Impersonate (GDD 3.17): how long a requested face may wait to change unseen before it is cancelled, how long a
   * borrowed face lasts, and the cooldown from its drop.
   */
  impersonate: Section({ applyWindowS: Seconds, durationS: Seconds, cooldownS: Seconds }),
  /** Night powers (GDD 3.2): uses of each per night; whether the Watchman may watch one seat two nights running. */
  nightPowers: Section({ perNight: z.number().int().positive(), watchRepeatAllowed: z.boolean() }),
  snowball: Section({
    /** Applies when living Village <= living Cabal + margin. */
    villageMargin: z.number().int().nonnegative(),
    killCooldownPenaltyS: Seconds,
    nextKillTraitClues: z.number().int().positive(),
    /** One Killer left with at least this many alive: kill CD changes by `lastKillerCooldownDeltaS`. */
    lastKillerMinAlive: z.number().int().positive(),
    lastKillerCooldownDeltaS: z.number(),
  }),
  hunger: Section({
    cyclesWithoutKill: z.number().int().positive(),
    /** A Hungry Killer who moves leaves one glowing footprint per this many seconds (GDD 3.3). */
    trailEveryS: z.number().positive(),
  }),
  disconnect: Section({ deathAfterS: Seconds }),
  clues: Section({
    traitCluesPerKill: z.number().int().positive(),
    /** The first body of the match always spawns this many trait clues and a Dust-able print. */
    firstBodyTraitClues: z.number().int().positive(),
    capPerScene: z.number().int().positive(),
    collectHoldS: Seconds,
  }),
  /**
   * Round 8 (GDD 3.22, Session 8A; docs/round8/body.md 2-5): the body, replacing the two-hit-point `health` block.
   * Every attack is a row of `damage` (creatures carry theirs in `mobs.json`); the effects' numbers are
   * `effects.json`.
   */
  body: Section({
    maxHp: z.number().int().positive(),
    /** Health regained per second out of combat (no hit for `regenAfterS`), never while an effect blocks it. */
    regenHpPerS: z.number().positive(),
    regenAfterS: Seconds,
    maxStamina: z.number().int().positive(),
    /** Stamina running costs per second; walking and standing regain `staminaRegenPerS`. */
    runCostPerS: z.number().positive(),
    staminaRegenPerS: z.number().positive(),
    /** Fatigued ends once stamina is back over this. */
    fatigueRecover: z.number().int().positive(),
    /** Health under this is Wounded. */
    woundedBelow: z.number().int().positive(),
    /** No food for this long is Famished. */
    famishedAfterS: Seconds,
    /** A knockout lasts this long; the seat wakes at `koWakeHp`, Dazed, having dropped `koPurseShare` of its purse. */
    koS: Seconds,
    koWakeHp: z.number().int().positive(),
    koPurseShare: z.number().min(0).max(1),
    /** Stamina one strike costs. */
    strikeStamina: z.number().int().positive(),
    /** Health a medkit (`heal`) restores. */
    healHp: z.number().int().positive(),
    /** How long a dead creature's row stays in the scene before it goes (GDD 3.15, A142). */
    creatureCorpseS: Seconds,
    damage: z.strictObject({ strike: DamageRow, mugging: DamageRow, slingshot: DamageRow }),
  }),
  movement: Section({
    walkTilesPerS: z.number().positive(),
    runTilesPerS: z.number().positive(),
    sneakFactor: z.number().positive().max(1),
  }),
  vision: Section({
    dayTiles: Tiles,
    nightTiles: Tiles,
    childDeltaTiles: z.number(),
    /** Round 6 (GDD 3.15): the extra sight radius of a lit lantern or torch, both ways; 0 until Session 6G. */
    lanternTiles: Tiles,
  }),
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
    /** A door is usable from this many tiles of its tile centre (GDD 3.7). */
    reachTiles: z.number().positive(),
  }),
  tasks: Section({
    cabalFakeList: z.boolean(),
    ghostShareCap: z.number().min(0).max(1),
    /** Each real task the martyred Vicar's ghost finishes counts this many times, outside the cap (GDD 3.20). */
    martyrWeight: z.number().positive(),
    /** For this many seconds from the martyr's reveal; tasks finished later count as any ghost's (GDD 3.20). */
    martyrS: z.number().positive(),
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
    /**
     * The M3c walk, now only the fallback in a scene with no station and no stroll tile: a new heading every
     * `stepMinS..stepMaxS`, aimed at the nearest portal with `portalSteerChance`, a portal in reach taken with
     * `portalChance` (GDD 3.12).
     */
    wander: z.strictObject({
      stepMinS: Seconds,
      stepMaxS: Seconds,
      portalSteerChance: Chance,
      portalChance: Chance,
    }),
    /** The routine (GDD 3.12 "Routines"). */
    routine: z.strictObject({
      weights: z.strictObject({ day: RoutineWeights, night: RoutineWeights }),
      stationDwellS: Span,
      workPauseS: Span,
      idleS: Span,
      idleChanceAfterLeg: Chance,
      strollTiles: TileSpan,
      sceneDwellS: Span,
      favouriteStations: z.number().int().positive(),
      /** Walking this long without a still stretch of `idleS.min` forces an idle. */
      maxWalkS: z.number().positive(),
      /** A goal with no quarter-tile of progress in this time is dropped. */
      stuckS: z.number().positive(),
    }),
    /** Reactions (GDD 3.12): the startle at a body, the idle after a placement, the clue roll. */
    react: z.strictObject({ startleS: Span, afterPlacementIdleS: Span, collectChance: Chance }),
    /** The night rule (GDD 3.12 "Night"): the wait in an unlit scene before the walk home. */
    night: z.strictObject({ leaveDelayS: Span }),
    /** The vote tick: this fraction of the discussion plus the vote time, from the discussion's start. */
    vote: z.strictObject({ windowFrac: FracSpan }),
    /** The ready delay on the role card and in the lobby. */
    ready: z.strictObject({ delayS: Span }),
    /**
     * The kill-opportunity timer (GDD 3.12, A100): a Killer NPC alone with one seat in a room for longer than
     * `afterS` strikes it; in a room wider than the view the seat counts only within `sightTiles` and in sight.
     */
    aloneKill: z.strictObject({ afterS: Seconds, sightTiles: Tiles }),
    /** NPC night powers (GDD 3.2, 3.12): the use tick over dusk plus night, and the Last Shot delay. */
    nightPower: z.strictObject({ windowFrac: FracSpan, lastShotS: Span }),
    /**
     * Round 8 (8R, GDD 3.12 "The hive"): a reaction becomes due a `staggerS` after it is first proposed (a hash of
     * the seat and the reaction, never a draw); a heard noise, shout or bell stays on the board for `memoryS`.
     */
    hive: z.strictObject({ staggerS: Span, memoryS: Seconds }),
    /**
     * Round 8, 8R (GDD 3.12): the body bands, in tiles from the body: walk to it, shout for the Detective and the
     * Doctor, and stay to report it or run for the bell.
     */
    body: z.strictObject({ pullTiles: Tiles, shoutTiles: Tiles, bellTiles: Tiles }),
    /** Round 6 (GDD 3.19): an NPC at one goal and one tile for longer than this fails the stuck invariant. */
    stuckInvariantS: Seconds,
  }),
  /**
   * Round 8 (GDD 3.24, Session 8E): the needs and moods of NPC seats and ambient townsfolk. A need is a 0..1 level in
   * room memory; `threshold` is where it counts, `desperateNeeds` how many over it make Desperate, `moodHoldS` how long
   * a mood holds before it may change. A `riseS` or `fallS` is the time a need takes to cross the whole scale at that
   * rate; the other keys are the jump one event gives. `weights` scale the routine's draw per mood (`moodWeights`).
   */
  moods: Section({
    threshold: Chance,
    desperateNeeds: z.number().int().positive(),
    moodHoldS: Seconds,
    /** Hunger rises over `riseS` (`famishedMul` times faster under 8A's Famished), falls at home and on a meal. */
    hunger: z.strictObject({
      riseS: Seconds,
      homeFallS: Seconds,
      mealRelief: Chance,
      famishedMul: z.number().positive(),
    }),
    fear: z.strictObject({
      body: Chance,
      chase: Chance,
      struck: Chance,
      ejection: Chance,
      darkRiseS: Seconds,
      fallS: Seconds,
    }),
    anger: z.strictObject({
      struck: Chance,
      robbed: Chance,
      taxed: Chance,
      ejectionRelief: Chance,
      mealRelief: Chance,
      fallS: Seconds,
    }),
    /** `lightPurse` is in Scrip (8C's purse): below it Want rises over `lightRiseS`; Indebted (8D) over `debtRiseS`. */
    want: z.strictObject({
      lightPurse: z.number().int().nonnegative(),
      lightRiseS: Seconds,
      debtRiseS: Seconds,
      wage: Chance,
      sale: Chance,
    }),
    /**
     * The mugging (GDD 3.24): a Hungry, Angry or Desperate figure or NPC seat alone with a seat rolls each second
     * `chancePerS[band]` of the target's purse band, times `1 + moodMul * strength` (the need behind its mood), times
     * `1 - fearMul * fear`, times `nightMul` in the night class, `weakMul` for a Weakened or Fatigued target,
     * `longAloneMul` after `longAloneS` alone with a heavy purse, `lightMul` when the target's light burns. The
     * mugger walks up (`approachS` at most, within `reachTiles`), threatens for `threatS`, and the target answers
     * within `answerS`; Pay loses `share` of the purse; Flee is chased for `chaseS`. Each side waits `cooldownS`.
     */
    mug: z.strictObject({
      chancePerS: z.strictObject({ light: Chance, heavy: Chance }),
      moodMul: z.number().nonnegative(),
      fearMul: z.number().nonnegative(),
      nightMul: z.number().nonnegative(),
      weakMul: z.number().nonnegative(),
      longAloneS: Seconds,
      longAloneMul: z.number().nonnegative(),
      lightMul: z.number().nonnegative(),
      reachTiles: z.number().positive(),
      approachS: Seconds,
      threatS: Seconds,
      answerS: Seconds,
      share: Chance,
      chaseS: Seconds,
      cooldownS: Seconds,
    }),
    weights: z.strictObject({
      hungry: MoodWeights,
      scared: MoodWeights,
      angry: MoodWeights,
      desperate: MoodWeights,
    }),
  }),
  /**
   * Round 8 (GDD 3.24, Session 8E): the ambient townsfolk. `count` is how many figures a map holds at each party
   * profile (the named figure and the stallholders of `routines.json` `townsfolk` first); a figure walks at
   * `walkTilesPerS`, works a station for `stationDwellS`, then idles for `idleS` with chance `idleChance`; `height`
   * is the trait index it is drawn at.
   */
  townsfolk: Section({
    count: z.strictObject({ small: Count, medium: Count, large: Count }),
    walkTilesPerS: z.number().positive(),
    stationDwellS: Span,
    idleS: Span,
    idleChance: Chance,
    height: z.number().int().nonnegative(),
  }),
  /** Round 6 (GDD 3.14). Each resource's own gather hold and respawn are rows of resources.json. */
  resources: Section({
    /** The share of each node pool that is active in a match. */
    poolActiveFrac: Chance,
    /**
     * Round 10, A12 (GDD 3.30): the most units of one item a slot holds, by item kind; a kind not listed holds 1.
     */
    stackMax: z.partialRecord(z.enum(['material', 'food']), z.number().int().positive()),
  }),
  /** Round 6 (GDD 3.15): placeholders until Session 6E tunes them. */
  mobs: Section({ maxPerScene: z.number().int().nonnegative(), chaseS: Seconds }),
  /** Round 6 (GDD 3.16): placeholders until Session 6E tunes them. */
  quests: Section({ maxActive: z.number().int().nonnegative() }),
  /**
   * GDD 3.16: the five station mini-games' numbers, read by `rules/minigames.ts` as `MinigameBases`. Crates: drag
   * `steps` crates, then release the needle inside a `bandFrac` band. Pour: `steps` pours filling at `ratePerS` of the
   * bowl a second, released inside `bandFrac`. Slide: `steps` bannetons. Stoke: each tap adds `stokePerTap` heat,
   * heat falls `ratePerS` a second; hold inside `bandFrac` for `holdS`. Tap (round 7, 7M): a marker sweeps the track
   * once per `periodS`; tap inside a `bandFrac` band `steps` times in a row, a miss starting the run again.
   */
  minigames: Section({
    crates: z.strictObject({ steps: Count, bandFrac: Frac }),
    pour: z.strictObject({ steps: Count, ratePerS: Frac, bandFrac: Frac }),
    slide: z.strictObject({ steps: Count }),
    stoke: z.strictObject({ stokePerTap: Frac, ratePerS: Frac, bandFrac: Frac, holdS: Seconds }),
    tap: z.strictObject({ steps: Count, periodS: Seconds, bandFrac: Frac }),
  }),
  /**
   * Round 8 (GDD 3.26, 7M): the shelf reader. A shelf of books shows `spinesMin` to `spinesMax` spines (owner, A200
   * round 2); no page of `lore.json` is longer than `pageMaxChars`, so the first page reads whole at 1280x720 and on
   * a phone.
   */
  reader: Section({ spinesMin: Count, spinesMax: Count, pageMaxChars: Count }),
  /**
   * Round 7 (GDD 3.3): the Daily Train of a map with a `station`. It stops `arriveAtS` into each day and delivers
   * `deliveryAfterS` later; the seats of the hub within `hearTiles` of the platform hear it.
   */
  train: Section({ arriveAtS: z.number().nonnegative(), deliveryAfterS: Seconds, hearTiles: Tiles }),
  /** Round 6 (GDD 3.13, 3.18): the client's scene transitions, in seconds, the whole cover-and-lift (GDD 3.13). */
  ui: Section({
    transitionS: z.strictObject({ fade: Seconds, iris: Seconds, wipe: Seconds }),
    /** The loading screen shows only once a load has run `showAfterS`, and changes its tip every `tipEveryS`. */
    loading: z.strictObject({ showAfterS: z.number().positive(), tipEveryS: z.number().positive() }),
  }),
  ghosts: Section({ wispsPerCycle: z.number().int().nonnegative() }),
  /** Round 7 (GDD 3.20): the four vendettas' seconds and counts. */
  vendettas: Section({
    /** World-phase seconds the Zealot shares a scene with the Vicar's seat before the doubt is sown. */
    conversion: z.strictObject({ shareS: Seconds }),
    /** The Activist's still seconds at one task target, the targets wanted, the finished real tasks undone. */
    sabotage: z.strictObject({
      tamperS: Seconds,
      stations: z.number().int().positive(),
      undoTasks: z.number().int().nonnegative(),
    }),
    /** The Bandit's seconds alone at the loaded strongbox. */
    heist: z.strictObject({ crackS: Seconds }),
    /** The Knife's extra rest after a strike on anyone but a living contract target. */
    contract: z.strictObject({ offTargetRestS: Seconds }),
  }),
  /** Round 8 (GDD 3.23), 8C's keys. */
  economy: Section({
    /** A purse of this many Scrip or more reads "a heavy purse" at inspect. */
    heavyPurse: z.number().int().positive(),
    /** The wage of one finished task, real or fake alike. */
    taskWage: z.number().int().nonnegative(),
    /** The share of every bank balance a cracked strongbox carries off (rounded down per seat). */
    heistShare: z.number().min(0).max(1),
    /** The hold that picks up a coins node on the ground (all of it). */
    coinPickupS: z.number().positive(),
  }),
  chat: Section({
    /** A `chat.say` line is cut to this many characters (GDD 3.5). */
    maxChars: z.number().int().positive(),
    quickChatRadiusTiles: Tiles,
    quickChat: z.array(z.strictObject({ id: Id, text: z.string().min(1) })).length(8),
  }),
  /** Round 8 (GDD 3.8 "Meeting notes", 3.25), 8T's keys. */
  talk: Section({
    /** A seat writes at most one note in this many seconds, human or NPC alike. */
    noteGapS: Seconds,
    /** A seat writes at most this many notes in one meeting. */
    notesPerMeeting: z.number().int().positive(),
    npc: z.strictObject({
      /** The notes an NPC seat means to write in a meeting, drawn per meeting from its `talk` stream. */
      notesPerMeeting: z.strictObject({
        min: z.number().int().nonnegative(),
        max: z.number().int().nonnegative(),
      }),
      /** When they fall: fractions of the discussion plus the vote time, from the discussion's first tick. */
      windowFrac: FracSpan,
      /** Red herrings a meeting (GDD 3.25 "Misdirection"): this many living NPC seats' first notes. */
      herringsPerMeeting: z.strictObject({
        min: z.number().int().nonnegative(),
        max: z.number().int().nonnegative(),
      }),
      /** The chance that any other NPC note is small talk. */
      smallTalkChance: Chance,
    }),
    /** The model's notes (GDD 3.25 "Talk"), only with the server key: a late answer gives the template line. */
    model: z.strictObject({
      /** A call not answered in this many seconds gives the template line. */
      timeoutS: z.number().positive(),
      /** Per match, at most this many calls and this many tokens, in and out; past either, templates only. */
      callsPerMatch: z.number().int().nonnegative(),
      tokensPerMatch: z.number().int().nonnegative(),
      /** `max_tokens` of one call. */
      maxTokens: z.number().int().positive(),
      /** A line longer than this is thrown away for the template. */
      maxChars: z.number().int().positive(),
      /** The meeting so far, as the model reads it: the last this many lines. */
      transcriptLines: z.number().int().positive(),
    }),
  }),
  /**
   * Round 10, A12 (GDD 3.30): the slots of a seat's inventory. `items.inventorySlots` is the hotbar and the pack
   * together; the first `hotbar` of them are the hotbar. The `belt` slots take tools only.
   */
  inventory: Section({ hotbar: z.number().int().positive(), belt: z.number().int().nonnegative() }),
  /**
   * Round 10, B1 (GDD 3.24, F4 2.2): the guard figures, the Constables and the Company Clerk. A guard walks only the
   * stations within `leashTiles` of its post and keeps after a seat that struck it for `angerS`, while that seat
   * stays within the leash.
   */
  guard: Section({ leashTiles: Tiles, angerS: Seconds }),
  /**
   * Round 10, B2 (GDD 3.31): the law. The Constables verify a clue `speedMult` times a Detective's rate (its
   * `clues.collectHoldS`) and post a briefing `briefingAfterS` after it appears.
   */
  law: Section({ speedMult: z.number().positive(), briefingAfterS: Seconds }),
  /** Round 10, A7 (GDD 3.32): sleeping through the night. */
  sleep: Section({
    /** Every active player asleep this long ends the night. */
    confirmS: Seconds,
    /** The tavern bed's price, paid from the purse when the sleeper lies down. */
    innBedScrip: z.number().int().nonnegative(),
    /** Round 10, A7b: the share of maximum stamina each kind of bed restores at the dawn its sleeper sleeps to. */
    restore: z.strictObject({
      bed: z.number().min(0).max(1),
      cot: z.number().min(0).max(1),
      innBed: z.number().min(0).max(1),
    }),
    /** The effects the tavern bed cures at that dawn (`effects.json` ids). */
    innBedCures: z.array(EffectKey),
    /** The Faith a night on the chapel cot gives, unless the chapel bars the sleeper. */
    cotFaith: z.number().int().nonnegative(),
    /** The last active player awake, alone this long while the rest sleep, is Exhausted the next day. */
    holdoutGraceS: Seconds,
  }),
});
export type BalanceFile = z.infer<typeof BalanceFile>;
