import { z } from 'zod';
import { GddRef, Id, Seconds, byPlayerCount } from './common.js';
import { OnubActId } from './onubRoles.js';

// ONUB v2 balance (GDD 3.11): decks, stations, ingredient cards, mini-games, night acts and windows,
// timers, the vote, the winners table and the NPC numbers. Every number of the mode lives here or in GDD 3.11.

/** A fraction of a gauge, a band or a window: (0, 1]. */
const Frac = z.number().gt(0).lte(1);
const Count = z.number().int().positive();
const Range = z.strictObject({ min: z.number().nonnegative(), max: z.number().nonnegative() });
const ByLevel = z.strictObject({
  easy: z.number().min(0).max(1),
  normal: z.number().min(0).max(1),
  hard: z.number().min(0).max(1),
});

/** The station mini-game (client-side skill only; its result never reaches the wire). */
export const OnubMinigame = z.discriminatedUnion('kind', [
  /** Drag `steps` crates to the cart, then release the thermostat needle inside a `bandFrac` band. */
  z.strictObject({ kind: z.literal('crates'), steps: Count, bandFrac: Frac }),
  /** `steps` pours: hold to fill at `ratePerS` of the bowl a second, release inside a `bandFrac` band. */
  z.strictObject({ kind: z.literal('pour'), steps: Count, ratePerS: Frac, bandFrac: Frac }),
  /** Slide `steps` bannetons into the cabinet slots. */
  z.strictObject({ kind: z.literal('slide'), steps: Count }),
  /** Each tap adds `stokePerTap` heat, heat falls `ratePerS` a second; hold inside `bandFrac` for `holdS`. */
  z.strictObject({
    kind: z.literal('stoke'),
    stokePerTap: Frac,
    ratePerS: Frac,
    bandFrac: Frac,
    holdS: Seconds,
  }),
]);
export type OnubMinigame = z.infer<typeof OnubMinigame>;

export const OnubStation = z.strictObject({
  id: Id,
  /** French room name ("Le Pétrin"); `gloss` is the English line under it. */
  name: z.string().min(1),
  gloss: z.string().min(1),
  /** Ingredient card ids of `cards`, in hand order. */
  good: z.array(Id).min(1),
  sabotage: z.array(Id).min(1),
  /** What one sabotage card here adds to the station's net weight. */
  weight: Count,
  /** A pile of at least one and fewer than this many cards is under-mixed: a flag worth `underMixWeight`. */
  underMixBelow: Count.optional(),
  underMixWeight: Count.optional(),
  /** `peekPantryLoc`: with visitors and no sabotage card here, each visitor sees one Pantry Location card. */
  perk: z.enum(['peekPantryLoc']).optional(),
  minigame: OnubMinigame,
});
export type OnubStation = z.infer<typeof OnubStation>;

export const OnubCard = z.strictObject({
  id: Id,
  name: z.string().min(1),
  /** The station whose hand holds this card. */
  station: Id,
  kind: z.enum(['good', 'sabotage']),
  /** `discardRandomOther`: at the reveal, one other card of the pile is discarded by seed, unseen. */
  effect: z.enum(['none', 'discardRandomOther']),
  text: z.string().min(1),
});
export type OnubCard = z.infer<typeof OnubCard>;

/** Where one pick of an act may come from; `other*` never names the actor's own seat. */
export const OnubTargetKind = z.enum([
  'anySeatCard',
  'anySeatRole',
  'otherSeatRole',
  'otherSeatLoc',
  'pantryRole',
  'pantryLoc',
]);
export type OnubTargetKind = z.infer<typeof OnubTargetKind>;

export const OnubAct = z
  .strictObject({
    id: OnubActId,
    /** Each pick comes from any of these kinds. Empty for an act without picks (`onub.inspect`). */
    targets: z.array(OnubTargetKind),
    /** Distinct targets the act names in `act.ability.targets`. */
    picks: z.number().int().min(0).max(2),
    /**
     * `cloche` covers the pick; `peek` moves nothing; `swapWithOwn` swaps the pick with the actor's own card of
     * the same kind; `swapWithPeeked` swaps the pick with the Pantry slot the actor peeked in the first step;
     * `swapPair` swaps the two picks.
     */
    effect: z.enum(['cloche', 'peek', 'swapWithOwn', 'swapWithPeeked', 'swapPair']),
    /** What the actor is shown: the picks before the act, their own card after it, both own cards, or nothing. */
    reveal: z.enum(['picked', 'ownAfter', 'ownCards', 'none']),
    /** A second step the actor must take in the same window (the Tourrier's swap). */
    then: OnubActId.optional(),
    description: z.string().min(1),
  })
  .refine((a) => (a.picks === 0) === (a.targets.length === 0), {
    message: 'an act with picks names target kinds, and an act without picks names none',
  });
export type OnubAct = z.infer<typeof OnubAct>;

export const OnubWindow = z.strictObject({
  order: z.number().int().positive(),
  role: Id,
  /** Window length before its seeded jitter and its fade. */
  seconds: Seconds,
  /** Seats dealt this role see each other (the Spores, the Commis). */
  seeEachOther: z.boolean(),
  /** Role ids whose dealt seats this window is shown (the Levain sees `champignon`). */
  sees: z.array(Id),
  /** Alternative acts; empty: the window only shows. */
  acts: z.array(OnubActId),
  /** The acts are allowed only when no other seat was dealt this role (the lone Spore). */
  onlyIfAlone: z.boolean(),
  /** `seededPick`: a mandatory act the server completes by seed when the window ends. */
  onTimeout: z.enum(['nothing', 'seededPick']),
});
export type OnubWindow = z.infer<typeof OnubWindow>;

export const OnubCountRow = z.strictObject({
  /** The default deck: player count + `pantry.roles` cards. `Settings.onubDeck` replaces it when set. */
  deck: z.array(Id).min(1),
  gddRef: GddRef,
});
export type OnubCountRow = z.infer<typeof OnubCountRow>;

const Flag = z.boolean().optional();
export const OnubWinnerRow = z.strictObject({
  id: Id,
  /** Conditions over the final cards after the Critique's drag; an omitted condition matches either value. */
  when: z.strictObject({
    ruined: Flag,
    croissantOut: Flag,
    sporeOut: Flag,
    sporeAmongPlayers: Flag,
    moldOut: Flag,
    anyoneOut: Flag,
  }),
  /** Teams whose final cards win; `nobody` wins no seat. */
  winners: z.array(z.enum(['baker', 'mold', 'croissant', 'nobody'])).min(1),
  text: z.string().min(1),
});
export type OnubWinnerRow = z.infer<typeof OnubWinnerRow>;

export const OnubBalanceFile = z.strictObject({
  gddRef: GddRef,
  /** The target match length in minutes the lobby chip shows (GDD 3.11, A15). */
  targetLengthMin: z.strictObject({ min: z.number().positive(), max: z.number().positive(), gddRef: GddRef }),
  /** Cards in the Pantry: Role cards left from the deal, Location cards drawn over the stations. */
  pantry: z.strictObject({ roles: Count, locations: Count, gddRef: GddRef }),
  byCount: byPlayerCount(OnubCountRow),
  timers: z.strictObject({
    roleCardS: Seconds,
    prepS: Seconds,
    /** Client-side: the baker walking into a station room. */
    stationTransitionS: Seconds,
    /** Client-side: a Done control appears after this long in a mini-game. */
    minigameAssistS: Seconds,
    prepRevealS: Seconds,
    fadeS: Seconds,
    windowJitterMaxS: Seconds,
    dawnS: Seconds,
    rushS: Seconds,
    voteS: Seconds,
    /** "Un, deux, trois, CRUST!": the opening countdown of the vote; CRUST never ends early before it has played. */
    crustCountdownS: Seconds,
    revealS: Seconds,
    /** The lights-out screen plays a muffled noise every min..max s, generated client-side. */
    sleeperPulseMinS: Seconds,
    sleeperPulseMaxS: Seconds,
    gddRef: GddRef,
  }),
  prep: z.strictObject({ endsWhenAllCommitted: z.boolean(), gddRef: GddRef }),
  /** The four stations in overview order. */
  stations: z.array(OnubStation).min(1),
  cards: z.record(Id, OnubCard),
  ruin: z.strictObject({
    /** The ruin threshold for a party size `weightByCount` does not list. */
    weight: Count,
    /** Party size -> the ruin threshold at that size (GDD 3.11); `resolvePrep` uses `weightByCount[n] ?? weight`. */
    weightByCount: z.record(z.string(), z.number().int().min(1)).optional(),
    goodCancels: z.number().int().nonnegative(),
    gddRef: GddRef,
  }),
  acts: z.record(OnubActId, OnubAct),
  windows: z.array(OnubWindow).min(1),
  rules: z.strictObject({ critiqueCopies: z.boolean(), gddRef: GddRef }),
  vote: z.strictObject({
    skipAllowed: z.boolean(),
    pantryTarget: z.boolean(),
    selfVoteAllowed: z.boolean(),
    /** In the vote phase (CRUST) only: the Rush always runs `rushS`. */
    endsWhenAllVoted: z.boolean(),
    /** Nobody goes in unless the top count reaches this. */
    minVotesToTurnOut: Count,
    tiesTurnOutAll: z.boolean(),
    /** Seats a `dragVote` card in the oven pulls in after it. */
    critiqueHops: z.number().int().nonnegative(),
    gddRef: GddRef,
  }),
  claims: z.strictObject({ maxSaw: z.number().int().nonnegative(), gddRef: GddRef }),
  /** First row that holds wins; the last row must match every dawn the earlier rows leave. */
  winners: z.array(OnubWinnerRow).min(1),
  npc: z.strictObject({
    sabotageChance: ByLevel,
    smartVoteChance: ByLevel,
    claimTruthChance: z.strictObject({
      baker: z.number().min(0).max(1),
      mold: z.number().min(0).max(1),
      croissant: z.number().min(0).max(1),
    }),
    /** Seconds after prep opens. */
    commitS: Range,
    /** Fractions of the NPC's own window. */
    actFrac: Range,
    /** Fractions of `rushS`. */
    claimFrac: Range,
    /** Fractions of `rushS + voteS`. */
    voteFrac: Range,
    gddRef: GddRef,
  }),
});
export type OnubBalanceFile = z.infer<typeof OnubBalanceFile>;
