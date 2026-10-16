import { z } from 'zod';
import { GddRef, Id, Seconds, Tiles, byPlayerCount } from './common.js';
import { OnubActId } from './onubRoles.js';

export const OnubAct = z.strictObject({
  id: OnubActId,
  target: z.enum(['deadLoaf', 'otherPlate', 'ownPlate', 'ledger']),
  /** Hold E per pick. */
  holdS: Seconds,
  /** `withOwn`: the picked loaf trades places with the actor's; `pair`: two picks trade places. */
  swap: z.enum(['none', 'withOwn', 'pair']),
  /** The actor is shown the token of what they picked (or now hold). */
  reveals: z.boolean(),
  description: z.string().min(1),
});
export type OnubAct = z.infer<typeof OnubAct>;

export const OnubWindow = z.strictObject({
  order: z.number().int().positive(),
  role: Id,
  seconds: Seconds,
  /** Players of this role see each other's nameplates during the window. */
  seeEachOther: z.boolean(),
  /** Alternative acts; `picks` is how many targets the act takes. Empty: no act. */
  acts: z.array(z.strictObject({ act: OnubActId, picks: z.number().int().positive() })),
  /** The acts are allowed only when exactly one player holds this dealt role. */
  onlyIfAlone: z.boolean(),
  /** `seededPick`: a mandatory act the server completes by seed when the window expires. */
  onTimeout: z.enum(['nothing', 'seededPick']),
  trace: z.enum(['none', 'ledgeScuff', 'ledgerOpen', 'plateTurned', 'twoPlatesTurned']),
  traceText: z.string(),
});
export type OnubWindow = z.infer<typeof OnubWindow>;

export const OnubCountRow = z.strictObject({
  loaves: z.number().int().positive(),
  /** Roles V1 deals: one per player plus the dead's loaves. `dealOnub` shuffles this list. */
  deck: z.array(Id),
  /** The GDD 3.11 deck including roles that ship later (dealt as the stand-in in V1). */
  planned: z.array(Id),
  discussionS: Seconds,
  gddRef: GddRef,
});
export type OnubCountRow = z.infer<typeof OnubCountRow>;

const Flag = z.boolean().optional();
export const WinnerRow = z.strictObject({
  id: Id,
  /** Conditions over the dawn result; an omitted condition matches either value. */
  when: z.strictObject({
    debtorOut: Flag,
    poisonerOut: Flag,
    poisonerAmongMourners: Flag,
    anyoneOut: Flag,
  }),
  /** `hirelingIfMourner`: the Hireling wins if they hold a mourner's plate, else nobody. */
  winners: z.array(z.enum(['debtor', 'village', 'cabal', 'hirelingIfMourner', 'nobody'])).min(1),
  text: z.string().min(1),
});
export type WinnerRow = z.infer<typeof WinnerRow>;

export const OnubBalanceFile = z.strictObject({
  gddRef: GddRef,
  /** Loaves left on the oven ledge (the dead's loaves). */
  deadLoaves: z.number().int().positive(),
  /** The target match length in minutes the lobby chip shows (GDD 3.11, A15). */
  targetLengthMin: z.strictObject({
    min: z.number().positive(),
    max: z.number().positive(),
    gddRef: GddRef,
  }),
  byCount: byPlayerCount(OnubCountRow),
  timers: z.strictObject({
    roleCardS: Seconds,
    duskS: Seconds,
    plateHoldS: Seconds,
    fadeS: Seconds,
    windowJitterMaxS: Seconds,
    dawnS: Seconds,
    voteS: Seconds,
    revealS: Seconds,
    /** Sleepers in the loft hear a fake noise pulse every min..max s, generated client-side. */
    sleeperPulseMinS: Seconds,
    sleeperPulseMaxS: Seconds,
    gddRef: GddRef,
  }),
  actRangeTiles: Tiles,
  acts: z.record(OnubActId, OnubAct),
  windows: z.array(OnubWindow).min(1),
  vote: z.strictObject({
    skipAllowed: z.boolean(),
    selfVoteAllowed: z.boolean(),
    endsWhenAllVoted: z.boolean(),
    /** Nobody is turned out unless the top count reaches this. */
    minVotesToTurnOut: z.number().int().positive(),
    tiesTurnOutAll: z.boolean(),
    gamekeeperHops: z.number().int().nonnegative(),
    gddRef: GddRef,
  }),
  winners: z.array(WinnerRow).min(1),
});
export type OnubBalanceFile = z.infer<typeof OnubBalanceFile>;
