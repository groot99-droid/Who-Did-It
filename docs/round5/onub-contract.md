# ONUB v2: the round-5 contract for Sessions 5A to 5E

> **History.** The quick mode this contract built was removed in round 7 (DECISIONS A115, A117; GDD 3.11); nothing here describes the game today.

Everything the five ONUB v2 sessions need to start in parallel on the round-5 base branch. It builds on the round-5
decisions (DECISIONS A49, the owner's answers, and A50, the round-5 contract) and on sections 2 to 4 of the
orchestrator's ONUB report (which stays with the orchestrator), and re-decides none of them; section 12 lists the few
calls this contract had to make on top. The rules text is `docs/GDD.md` 3.11, the data
`packages/content/data/roles.onub.json` and `balance.onub.json`, the content schemas appendix A of this document.

Every TypeScript block below was type-checked (`tsc --noEmit` with the repo's `tsconfig.base.json`), linted (the
repo's `eslint.config.js`) and formatted (`.prettierrc.json`) on a scratch copy of the packages on 2026-10-17.
Sections 2 and 3 show the code of the two pre-seed diffs of the packages against `a0850ba` (`shared.patch` and
`content.patch`; the patch files stay with the orchestrator).

**What has landed.** Sections 2, 3, 4.2 and 9 landed in the pre-seed commit 265bda9 (with the hooks of 4.3 and the
client seams of 5.1 to 5.3): sessions do not redo them. The three design reviews and the orchestrator's rulings
(2026-10-17) changed a few of those lines. Section 13, "Pre-seed amendment (after review)", lists every edit; the
amendment landed with the round-5 main-mode pre-seed on top of 265bda9, together with the random streams of 4.1 and
the `prepStreams` helper of 4.3. Where this contract and section 13 differ, section 13 wins. `seams.md` (this folder)
lists every pre-seeded hook with its locked call site.

## 1. Sessions, paths and what is locked

| Session | Owns (new files marked new) | Docs it writes |
|---|---|---|
| **5A. ONUB v2 rules, server deal and prep** | `packages/shared/src/rules/onub.ts` (fills the bodies), new `packages/shared/test/onubPrep.test.ts`; `apps/server/src/sim/Onub.ts`; new `apps/server/src/sim/onub/Prep.ts`; new `apps/server/test/{onubDeal,onubPrep,onubContract}.test.ts` and `apps/server/test/onubPrepHelpers.ts` | GDD 3.11 sentences marked "(5A)" in "Two cards each", "Decks", "Evening Prep" and "The crime scenes"; ARCHITECTURE 5.14 rows "Rules (prep)" and "Server modules (deal, prep)" |
| **5B. ONUB v2 server night and morning** | `packages/shared/src/rules/onubNight.ts` (fills the bodies), new `packages/shared/test/onubNight.test.ts`; `apps/server/src/sim/Conductor.ts`; new `apps/server/src/sim/onub/Acts.ts`; the quick-mode branches of `apps/server/src/sim/Meeting.ts` (`openMeeting` for `dawn`, `handleVote`, `startOnubReveal`, `endReveal`, `runMeeting`, `handleClaim`) and of `apps/server/src/sim/Win.ts` (`endOnubMatch`, the quick lines of `resetToLobby`); new `apps/server/test/{onubNight,onubMorning}.test.ts` and `apps/server/test/onubNightHelpers.ts` | GDD 3.11 sentences marked "(5B)" in "The Baking Cycle", "The Iron Cloche", "Must and may", "Dawn and the Morning Rush", "The vote" and "Reveal and game over"; ARCHITECTURE 5.14 rows "Rules (night, vote)", "Messages", "Privacy", "Server modules (night, morning)" |
| **5C. ONUB v2 client prep, mini-games, lobby deck editor** | new `apps/client/src/scenes/Kitchen.ts`; new `apps/client/src/view/onub/{PrepView,StationView,PilesView}.ts` and `apps/client/src/view/onub/minigames/{crates,pour,slide,stoke}.ts` with tests; new `apps/client/src/ui/lobby/DeckEditor.ts` with its test; new `apps/client/src/net/mock/onubPrepMock.ts` with its test; new `apps/client/src/ui/copy/onubPrep.ts`; `apps/client/src/ui/theme/components.css` (rules appended at the end under a "Round 5 (5C)" comment only); new `apps/client/e2e/kitchen.spec.ts` (mock only, `?mock=1&mode=onub`); for bug #126 (below), the lobby-chip and 14.13 ids in `apps/client/src/ui/copy/lobby.ts` and the fill line of `openDialog` in `apps/client/src/ui/Lobby.ts` | `docs/UI.md` 14.12, replaced wholesale by the prep, board and deck-editor lines |
| **5D. ONUB v2 client night, morning and results** | new `apps/client/src/scenes/Night.ts`; new `apps/client/src/view/onub/{NightView,CardTableView,LightsOutView}.ts` with tests; new `apps/client/src/ui/onub/{rush,claim,over,actlog}.ts` with tests; new `apps/client/src/net/onubColyseus.ts` with its test; new `apps/client/src/net/mock/onubNightMock.ts` with its test; new `apps/client/src/ui/copy/onubNight.ts`; `components.css` (appended under "Round 5 (5D)" only, plus deleting the round-4 loft, bedroll and claim-strip rules); new `apps/client/e2e/night.spec.ts` (mock only) | new `docs/UI.md` 14.14 (night, dawn, Rush, claims, vote, reveal, game over, act log) |
| **5E. ONUB v2 bots, NPC brains, e2e and soak** | `apps/server/src/sim/npc/onub.ts`; new `apps/server/test/onubNpc.test.ts`; the quick-mode parts of `tools/bots/{quick,walk,soak,live}.ts` and `tools/bots/test/quick*.test.ts`, and, at integration after 5F's contract phase, the main-mode reads of `tools/bots/walk.ts` (prey from `SceneState.avatars` by handle, Kill by handle; `deck-wire.md` 8.3); `apps/client/e2e/onub.spec.ts` (rewritten); the quick-mode case of `apps/client/e2e/npc.spec.ts` | GDD 3.11 sentences marked "(5E)" in "NPC seats"; ARCHITECTURE 5.12 (the quick-mode bot rows) |

**Bug #126 (5C, ruling F16)**, from `bugs.md`: "[minor] Lobby copy (V) uses provisional NPC and mode ids, and the
Start confirm lacks the fill line. Where: `apps/client/src/ui/copy/lobby.ts:30,37-49` and
`apps/client/src/ui/Lobby.ts:100-104,163,236` vs `docs/UI.md` 14.12 (Lobby chip) and 14.13. Fix: Paste the 14.13
and lobby-chip ids into `lobby.ts` and fill `difficulty.locked` with `{need, level}`. In `openDialog`, add the
`lobby.confirm.fill` line when `snapshot.players.length < MIN_PLAYERS_TO_START`." (Line numbers are a0850ba's; at
265bda9 the dialog is `openDialog` in `Lobby.ts` and the copy block is `lobby.ts` `lobby.hint.*` to
`lobby.npc.*`; the round-5 main-mode pre-seed moved the `Lobby.ts` lines again, adding the map and deck-list slots,
and the names hold.) 5C touches no other line of either file; the lobby mount hooks there are the pre-seed's.

**Locked for all five** (the orchestrator pre-seeded them; a session needing a change writes it in its PR description,
uses a local stand-in, and the orchestrator adds it): `packages/shared/src/{schema,protocol}/index.ts`,
`packages/shared/src/constants.ts`, `packages/shared/src/rules/index.ts`; `packages/content/src/**` and
`packages/content/data/{roles,balance}.onub.json`; `apps/server/src/sim/onub/state.ts`; the dispatcher body of
`handleOnubAbility` and the call sites of section 4.3 in files the five do not own (`rooms/handlers/lobby.ts`,
`sim/Npc.ts`, `sim/Step.ts`, `sim/Phases.ts`, `sim/Actions.ts`); `apps/client/src/net/{onub,onubRouter}.ts`,
`apps/client/src/net/mock/onubMock.ts`, the mount hooks of section 5.3; every number of GDD 3.11. Units: every
`*Tick` is in ticks (`secondsToTicks`); content paths are whole: `onubBalance.timers.prepS`,
`onubBalance.stations.find((s) => s.id === id)` (an array), `onubBalance.cards[id].kind`,
`onubBalance.acts[id].picks`, `onubBalance.windows.find((w) => w.role === role)` (an array),
`onubBalance.vote.critiqueHops`, `onubBalance.pantry.roles`, `onubBalance.npc.voteFrac.min`,
`onubRoles.roles[id].team`, `onubRoles.teams[team].faction`, `onubFor(n).deck`.

## 2. Pre-seed: `@wdi/shared` (landed in 265bda9)

Landed as written here; sessions do not redo it. Section 13's amendment (landed) changed two places: `OnubBoard`
gained `window` (2.2) and `resolvePrep` takes the ruin rule and three streams (2.4). The exact change was `shared.patch`
(kept by the orchestrator): constants, schema, protocol, `rules/index.ts`, `rules/onub.ts`, the new
`rules/onubNight.ts`, the payload-type list of `packages/shared/scripts/protocol-doc.ts` (round 4's `SwapLogEntry`
gives way to the v2 types) and `docs/PROTOCOL.md` as `pnpm docs:protocol` renders it. `packages/shared/test/onub.test.ts`
is deleted (section 9); the other shared suites pass unchanged (60 tests on the scratch copy).

### 2.1 `constants.ts`

`ONUB_SET_PLATE` is removed; the loft constants stay, with a new meaning (every ONUB seat sits in the pseudo-scene).

```ts
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
```

### 2.2 `schema/index.ts`

`Phase.prepReveal = 13`; `Winner.croissant` takes value 4 (the round-4 `debtor`); `NightReveal` gains `kind` and
renames `roleId` to `value`; `Private` gains `onubLoc` and `onubCard`; `Settings` gains `onubDeck`; `Claim` gains
station, card and sightings; `MeetingState.traces` is removed; `OnubPile` and `OnubBoard` are new and
`GameState.onub` holds the board. Field counts after the change: `GameState` 13, `Private` 12, `Settings` 6,
`MeetingState` 9, `OnubBoard` 7 (8 with section 13's `window`), `OnubPile` 4, `Claim` 5, `ClaimSaw` 3, all far under 63 (the round-5 main-mode
pre-seed added `Private.sceneId`, `.avatar`, `.coverLook` and `.mateLooks`, so `Private` now has 16, and `Player.look`;
`deck-wire.md` section 1).

```ts
export const Phase = {
  lobby: 0,
  roleReveal: 1,
  grace: 2,
  day: 3,
  dusk: 4,
  night: 5,
  dawn: 6,
  meetingDiscussion: 7,
  meetingVote: 8,
  reveal: 9,
  immunity: 10,
  finalNight: 11,
  gameOver: 12,
  /** Quick mode (GDD 3.11): the prep piles face up on `GameState.onub`, between Evening Prep and the night. */
  prepReveal: 13,
} as const;
```

```ts
/**
 * 0 = nobody has won yet. `croissant` (the Stale Croissant, alone or with the Bakers) and `nobody` are quick-mode
 * values (GDD 3.11; 4 was the round-4 `debtor`). In quick mode the headline comes from the winners row, not this.
 */
export const Winner = { none: 0, village: 1, cabal: 2, drifter: 3, croissant: 4, nobody: 5 } as const;
```

```ts
/**
 * Quick mode (GDD 3.11): one thing this seat learned, kept so a reconnecting client can re-read it.
 * `slot` is a card slot (`seat.<i>.role`, `seat.<i>.loc`, `pantry.role.<k>`, `pantry.loc.<k>`, see
 * `rules/onub.ts`); `kind` is `role` or `loc` for a card seen, `mate` for a seat seen at night (the other
 * Spore or Commis, a Spore the Levain sees; `slot` is then `seat.<i>`); `value` is the role or station id;
 * `of` is the seat id behind a seat slot, empty for the Pantry.
 */
export const NightReveal = schema({ slot: str(), kind: str(), value: str(), of: str() }, 'NightReveal');
```

```ts
export const Private = schema(
  {
    role: Role,
    inventory: Inventory,
    notebook: t.array(NotebookEntry),
    tasks: t.array(TaskEntry),
    cabalMates: t.array('string'),
    cooldownEndTick: t.map('uint32'),
    ledger: t.array(LedgerLine),
    lensCharges: u8(),
    myVote: str(),
    /** Quick mode only; empty in the main mode. Every peek, sighting and the proofing perk, in order. */
    nightReveal: t.array(NightReveal),
    /** Quick mode: the station this seat committed at prep (its dealt Location card), empty before. */
    onubLoc: str(),
    /** Quick mode: the Ingredient card this seat committed at prep, empty before. */
    onubCard: str(),
  },
  'Private',
);
```

```ts
/**
 * `mode` is 0 main, 1 onub (ARCHITECTURE 5.14). `revealMode` 0 is full, locked in V1 (GDD 2).
 * `npcDifficulty` is an `NpcLevel` index and `npcSeats` the number of NPC seats in the party, a count
 * only: no seat is ever marked (GDD 3.12, A39). `onubDeck` is the leader's custom quick-mode deck, public;
 * empty means `onubFor(n).deck` (GDD 3.11).
 */
export const Settings = schema(
  {
    map: str('hollowmere'),
    revealMode: u8(),
    mode: u8(),
    npcDifficulty: u8(),
    npcSeats: u8(),
    onubDeck: t.array('string'),
  },
  'Settings',
);

/** One thing a quick-mode claim says it saw: `targetId` a seat id or `"pantry"`, with a role or a station id. */
export const ClaimSaw = schema({ targetId: str(), roleId: str(), stationId: str() }, 'ClaimSaw');
/**
 * A quick-mode claim (GDD 3.11), latest per seat: "I was {roleId}, I worked {stationId} and played {cardId}",
 * plus up to `claims.maxSaw` sightings. Empty strings are parts left out.
 */
export const Claim = schema(
  { from: str(), roleId: str(), stationId: str(), cardId: str(), saw: t.array(ClaimSaw) },
  'Claim',
);
```

```ts
export const MeetingState = schema(
  {
    phase: u8(),
    reason: str(),
    callerId: str(),
    bodyOf: str(),
    endsTick: u32(),
    missing: t.array('string'),
    board: t.array(BoardRow),
    suspects: t.array('string'),
    /** Quick mode: the structured claims, latest per seat (GDD 3.11). */
    claims: t.array(Claim),
  },
  'MeetingState',
);

/**
 * One prep pile face up (GDD 3.11), keyed by station id in `OnubBoard.piles`: `cards` the card ids still in it,
 * in seeded order; `lost` how many the Thermostat Flip discarded; `net` its net sabotage weight; `underMixed`
 * the Mixer's caution flag.
 */
export const OnubPile = schema(
  { cards: t.array('string'), lost: u8(), net: u8(), underMixed: bool() },
  'OnubPile',
);

/**
 * The public quick-mode board (GDD 3.11). `seats` is the deal order (slot index `i` of `seat.<i>.*` is
 * `seats[i]`) and `deck` the cards in play, both from the role card on; `piles`, `ruinWeight`, `ruined` and
 * `perk` from `prepReveal`; `cloche` (a slot id) from dawn. Cleared at the lobby reset; empty in the main mode.
 */
export const OnubBoard = schema(
  {
    seats: t.array('string'),
    deck: t.array('string'),
    piles: t.map(OnubPile),
    ruinWeight: u8(),
    ruined: bool(),
    perk: bool(),
    cloche: str(),
  },
  'OnubBoard',
);
```

`GameState` ends with `winner: u8(),` then `/** Quick mode only (GDD 3.11). */ onub: OnubBoard,`.

Amended by section 13.1: `OnubBoard` gains `window: str()` after `cloche`, the open night window's role id (the
narrator), '' during fades and outside the night.

### 2.3 `protocol/index.ts`

The quick-mode types (they replace round 4's `NightRevealEntry`, `SwapLogEntry` and `OnubGameOver`):

```ts
/**
 * Quick mode (GDD 3.11): one thing a seat learned at prep or at night (mirrors the `NightReveal` schema).
 * `slot` is a card slot (`seat.<i>.role`, `seat.<i>.loc`, `pantry.role.<k>`, `pantry.loc.<k>`) or `seat.<i>`
 * for a `mate`; `value` is a role id (`role`, `mate`) or a station id (`loc`); `of` the seat id behind a seat
 * slot, empty for the Pantry.
 */
export interface NightRevealEntry {
  slot: string;
  kind: 'role' | 'loc' | 'mate';
  value: string;
  of: string;
}

/** Quick mode: one act a waker may make now, with the slots its picks may name (cloche and illegal slots removed). */
export interface OnubLegalAct {
  /** An `ONUB_ACTS` id. */
  act: string;
  /** How many distinct slots `act.ability.targets` must name; 0 for `onub.inspect`. */
  picks: number;
  /** The pool the picks come from; empty when `picks` is 0. */
  slots: string[];
}

/** Quick mode: what a waker's card table shows (`nightWake.view`), computed by the server from the DEALT roles. */
export interface OnubWakeView {
  /** Other seats dealt this window's role (`seeEachOther`): the other Spore, the other Commis. */
  mates: string[];
  /** Seats dealt a role this window is shown (`sees`): the Levain's Spores. */
  seen: { seat: string; roleId: string }[];
  /** `seeEachOther` and nobody else was dealt this role: a lone Spore or a lone Commis. */
  alone: boolean;
  /** The slot under the Iron Cloche, or empty. */
  cloche: string;
  /** The acts open to this seat now: empty for a window that only shows, or once the seat has acted. */
  legal: OnubLegalAct[];
  /** The window's act is mandatory: the server completes it by seed when the window ends. */
  must: boolean;
}

/** Quick mode: one accepted night act, in window order, for the end screen (GDD 3.11). */
export interface OnubActLogEntry {
  /** The window's `order`. */
  order: number;
  /** The acting window's role id (the actor's dealt role), never the actor's seat. */
  roleId: string;
  /** An `ONUB_ACTS` id. */
  act: string;
  /** The slots the act named; for a swap with the actor's own card, the actor's slot first. */
  slots: string[];
  /** The server made it by seed when the window ended (a must-act left undone). */
  auto: boolean;
}

/** Quick mode: a prep pile as the end screen shows it; `lost` names the cards the thaw discarded. */
export interface OnubPileOver {
  cards: string[];
  lost: string[];
  net: number;
  underMixed: boolean;
}

/** Quick mode: the end-screen facts of GDD 3.11, sent only with `gameOver`. Seat ids key every record. */
export interface OnubGameOver {
  /** The deal order: `seat.<i>.*` slots name `seats[i]`. */
  seats: string[];
  /** The deck in play. */
  deck: string[];
  /** Seat -> Role card dealt; seat -> Role card held at dawn. */
  dealt: Record<string, string>;
  final: Record<string, string>;
  /** Seat -> station chosen at prep (its Location card dealt); seat -> Location card held at dawn. */
  dealtLoc: Record<string, string>;
  finalLoc: Record<string, string>;
  /** Seat -> the Ingredient card it played (a card the thaw discarded included). */
  prepCards: Record<string, string>;
  /** Seats whose prep the server completed at the timeout. */
  prepAuto: string[];
  /** The Pantry's Role and Location cards, as dealt and at dawn, slot `k` at index `k`. */
  pantryRolesDealt: string[];
  pantryRoles: string[];
  pantryLocsDealt: string[];
  pantryLocs: string[];
  /** Station id -> its pile. */
  piles: Record<string, OnubPileOver>;
  ruinWeight: number;
  ruined: boolean;
  /** The Iron Cloche's slot, or empty. */
  cloche: string;
  actLog: OnubActLogEntry[];
  /** Voter -> seat id or `"pantry"`; an abstention is absent. */
  votes: Record<string, string>;
  /** Seats in the oven, the Critique's drag included. */
  outs: string[];
  /** The seat the Critique dragged in, or empty. */
  hop: string;
  /** The Pantry was among the top of the vote. */
  pantryOut: boolean;
  /** The `balance.onub.json` winners row that applied. */
  rowId: string;
  /** The seats that won. */
  winnerIds: string[];
}

/** Quick mode: one sighting in a claim: a seat id or `"pantry"`, with the role or the station it showed. */
export interface ClaimSawPayload {
  targetId: string;
  roleId?: string;
  stationId?: string;
}

/** Quick mode: `meeting.claim` (GDD 3.11). Every part but `roleId` may be left out; `saw` holds up to `claims.maxSaw`. */
export interface OnubClaimPayload {
  roleId: string;
  stationId?: string;
  cardId?: string;
  saw?: ClaimSawPayload[];
}
```

The payload changes (`RoleRevealPayload.teamName` is new; `act.ability` loses `targetId2` and gains `targets`):

```ts
// RoleRevealPayload
  /** Quick mode: the card's team name (`roles.onub.json` `teams[team].name`), shown in place of the faction. */
  teamName?: string;

// C2SPayloads
  /**
   * Main mode: `targetId` names the target. Quick mode: `targets` names every pick, in order: `[stationId, cardId]`
   * for `onub.prep`, card slots for a night act (none for `onub.inspect`).
   */
  'act.ability': { abilityId: string; targetId?: string; targets?: string[] };
  /** A living player's id, or `"skip"`; quick mode: another seat's id or `"pantry"`, never `"skip"`. Changeable until the vote closes (A30). */
  'meeting.vote': { targetId: string };
  /**
   * Leader only, phase lobby: `mode` is a `GameMode`, `npcDifficulty` an `NpcLevel` (A39); `onubDeck` a custom
   * quick-mode deck (role ids, `[]` for the default), checked by `onubDeckProblem` without the size (GDD 3.11).
   * All or nothing; refused 422 / 425.
   */
  'lobby.settings': { mode?: number; npcDifficulty?: number; onubDeck?: string[] };
  /** Quick mode, a seat in play in the Rush or CRUST: replaces the seat's claim (GDD 3.11). */
  'meeting.claim': OnubClaimPayload;

// S2CPayloads
  /**
   * `tally` counts votes per target id and `"skip"`; voters are never named (GDD 3.8). Quick mode (3.11): `tally`
   * counts `"pantry"` instead of `"skip"`; `outs` are the seats in the oven (the drag included), `hop` the seat
   * the Critique dragged in, `pantryOut` whether the Pantry was at the top, `roles` the final Role cards of
   * `outs`, `abstained` the seats in play that did not vote.
   */
  voteResult: {
    tally: Record<string, number>;
    ejectedId?: string;
    role?: string;
    outs?: string[];
    hop?: string;
    pantryOut?: boolean;
    roles?: Record<string, string>;
    abstained?: string[];
  };
  /**
   * Private, quick mode: your window is open until `endsTick` (GDD 3.11). Sent again inside the window when
   * `view.legal` changes (the Tourrier's second step); the latest one wins. Never sent to a sleeper.
   */
  nightWake: { windowRole: string; endsTick: number; view: OnubWakeView };
  /**
   * Private, quick mode: what you learned, the same rows `Private.nightReveal` gains. Sent for every accepted act
   * (empty for an act that shows nothing), for the sightings at a window's opening and for the proofing perk.
   */
  nightReveal: { entries: NightRevealEntry[] };
  /** Private, quick mode: your window closed; back to the lights-out screen. */
  nightSleep: Record<string, never>;
```

`RATE_LIMITS` is unchanged (`act.ability` 5/s, `meeting.claim` 2/s). `MeetingReason` keeps `dawn`. The `map?: string`
field of `lobby.settings`, beside `onubDeck`, was added by the round-5 world pre-seed (after 265bda9; `world.md` 9.1);
the server ignores it until 5J reads it in `handleSettings`.

### 2.4 `rules/onub.ts` (Session 5A; full replacement)

Amended by section 13.1: `resolvePrep`'s `rule` becomes `OnubRuinRule` (`balance.onub.json` `ruin`, with
`weightByCount`) and its `rng` becomes `rngs: OnubPrepStreams` (`piles`, `thaw`, `perk`); its doc comment changes
with them. The block below is the landed text.

```ts
import type { Rng } from './prng';

// Quick mode rules, ONUB v2 (GDD 3.11, ARCHITECTURE 5.14): pure functions over plain data. The decks, stations,
// cards, windows, vote rule and winners table are `balance.onub.json`, the roles `roles.onub.json`; the caller
// passes in what a function needs, since `@wdi/shared` cannot import `@wdi/content`. This file is the table
// (slots), the deal, the deck check, Evening Prep and the night script: Session 5A fills it. The night acts, the
// wake view, the vote and the winners are `onubNight.ts` (Session 5B). The slot helpers, `tableAtNight` and
// `nightScript` are implemented in the pre-seed; every other body throws until 5A fills it.

// --- Slots ----------------------------------------------------------------------------------------------

/** A card's kind: a Role card or a Location card. */
export type SlotKind = 'role' | 'loc';

/**
 * A parsed slot id. Card slots are `seat.<i>.role`, `seat.<i>.loc`, `pantry.role.<k>` and `pantry.loc.<k>`, where
 * `i` is the seat's index in the deal order (`OnubBoard.seats`) and `k` the Pantry position; `seat.<i>` (kind
 * `seat`) names a seat itself, for a `mate` reveal.
 */
export interface ParsedSlot {
  owner: 'seat' | 'pantry';
  index: number;
  kind: SlotKind | 'seat';
}

export const seatSlot = (index: number, kind: SlotKind): string => `seat.${index}.${kind}`;
export const pantrySlot = (kind: SlotKind, k: number): string => `pantry.${kind}.${k}`;
export const mateSlot = (index: number): string => `seat.${index}`;

const SLOT_RE = /^(?:seat\.(\d+)(?:\.(role|loc))?|pantry\.(role|loc)\.(\d+))$/;

/** The parts of a slot id, or null for anything that is not one. */
export function parseSlot(slot: string): ParsedSlot | null {
  const m = SLOT_RE.exec(slot);
  if (!m) return null;
  if (m[1] !== undefined) {
    return { owner: 'seat', index: Number(m[1]), kind: (m[2] as SlotKind | undefined) ?? 'seat' };
  }
  return { owner: 'pantry', index: Number(m[4]), kind: m[3] as SlotKind };
}

/** The table at night: slot -> role id for every Role card, slot -> station id for every Location card. */
export interface OnubCards {
  roles: Map<string, string>;
  locs: Map<string, string>;
}

/**
 * The table as the night starts: seat `i` holds `seatRoles[i]` and `seatLocs[i]`, Pantry position `k` holds
 * `pantryRoles[k]` and `pantryLocs[k]`. Throws when the two seat lists differ in length.
 */
export function tableAtNight(
  seatRoles: readonly string[],
  seatLocs: readonly string[],
  pantryRoles: readonly string[],
  pantryLocs: readonly string[],
): OnubCards {
  if (seatRoles.length !== seatLocs.length) {
    throw new Error(`${seatRoles.length} seat roles for ${seatLocs.length} seat locations`);
  }
  const roles = new Map<string, string>();
  const locs = new Map<string, string>();
  seatRoles.forEach((r, i) => roles.set(seatSlot(i, 'role'), r));
  seatLocs.forEach((l, i) => locs.set(seatSlot(i, 'loc'), l));
  pantryRoles.forEach((r, k) => roles.set(pantrySlot('role', k), r));
  pantryLocs.forEach((l, k) => locs.set(pantrySlot('loc', k), l));
  return { roles, locs };
}

// --- The deal and the deck --------------------------------------------------------------------------------

/**
 * Deals `deck` to `seats` (the deal order): seat `i` gets the `i`-th card of a shuffle, the rest go to the Pantry
 * in order. The deck is the party size plus `pantry.roles` cards (`onubDeckProblem` with a size has checked it);
 * throws when it does not leave at least one card for the Pantry. Draws only from `rng` (the `deal` stream).
 */
export function dealOnub(
  seats: readonly string[],
  deck: readonly string[],
  rng: Rng,
): { dealt: Map<string, string>; pantry: string[] } {
  void seats;
  void deck;
  void rng;
  throw new Error('dealOnub: not implemented (Session 5A)');
}

/**
 * The Pantry's Location cards: `count` draws, each uniform over `stationIds`, repeats allowed (GDD 3.11). Called
 * on the `deal` stream right after `dealOnub`.
 */
export function dealPantryLocs(stationIds: readonly string[], count: number, rng: Rng): string[] {
  void stationIds;
  void count;
  void rng;
  throw new Error('dealPantryLocs: not implemented (Session 5A)');
}

/** What the deck check reads of a `roles.onub.json` role. */
export interface OnubDeckRole {
  ships: string;
  /** Allowed non-zero copy counts. */
  copies: readonly number[];
  required: boolean;
}

/** Why a deck is refused, in the order the checks run; each has an `onub.deck.problem.<id>` line (UI 14.12). */
export type OnubDeckProblem = 'unknownRole' | 'notShipped' | 'copies' | 'missingRequired' | 'size';

/**
 * The first problem with a quick-mode deck, or null (GDD 3.11): every id a role of `roles`, every role shipping
 * in `V1`, each role's count one of its `copies`, every `required` role present, and, when `size` is given (at
 * Start: seats after the NPC fill plus `pantry.roles`), exactly `size` cards. `lobby.settings` checks without
 * the size, since the party may still grow or shrink.
 */
export function onubDeckProblem(
  deck: readonly string[],
  roles: Readonly<Record<string, OnubDeckRole | undefined>>,
  size?: number,
): OnubDeckProblem | null {
  void deck;
  void roles;
  void size;
  throw new Error('onubDeckProblem: not implemented (Session 5A)');
}

// --- Evening Prep -----------------------------------------------------------------------------------------

/** What prep reads of a `balance.onub.json` station. */
export interface OnubStationLike {
  id: string;
  good: readonly string[];
  sabotage: readonly string[];
  weight: number;
  underMixBelow?: number | undefined;
  underMixWeight?: number | undefined;
  perk?: 'peekPantryLoc' | undefined;
}

/** What prep reads of a `balance.onub.json` ingredient card. */
export interface OnubCardLike {
  kind: 'good' | 'sabotage';
  effect: 'none' | 'discardRandomOther';
}

/** One seat's prep: the station it worked and the Ingredient card it played there. */
export interface OnubCommit {
  station: string;
  card: string;
}

/**
 * Why `onub.prep` is refused (422): `station` not a station id; `card` not in that station's good cards, nor in
 * its sabotage cards for a seat whose dealt role `sabotages`. Null when the commit is legal.
 */
export function prepCommitProblem(
  commit: OnubCommit,
  stations: readonly OnubStationLike[],
  sabotages: boolean,
): 'station' | 'card' | null {
  void commit;
  void stations;
  void sabotages;
  throw new Error('prepCommitProblem: not implemented (Session 5A)');
}

/**
 * The commit the server makes for a seat that did not commit by the end of prep: a station uniform over
 * `stations`, then a good card uniform over that station's `good` (the `prepTimeout` stream).
 */
export function timeoutCommit(stations: readonly OnubStationLike[], rng: Rng): OnubCommit {
  void stations;
  void rng;
  throw new Error('timeoutCommit: not implemented (Session 5A)');
}

/** One resolved pile: the cards left face up in seeded order, the cards the thaw discarded, the net and the flag. */
export interface PrepPile {
  cards: string[];
  lost: string[];
  net: number;
  underMixed: boolean;
}

export interface PrepOutcome {
  /** Station id -> pile, every station present (an empty pile when nobody worked there). */
  piles: Record<string, PrepPile>;
  ruinWeight: number;
  ruined: boolean;
  /** The proofing perk: the station whose visitors peek and the Pantry Location slot they all see; null if it did not fire. */
  perk: { station: string; slot: string } | null;
}

/**
 * Resolves every pile (GDD 3.11 "The crime scenes"). The rng is the `piles` stream and is drawn in this order:
 * 1. per station in `stations` order: the pile is the commits there in `seats` order, then `shuffle`d;
 * 2. per station, for each `discardRandomOther` card in pile order that is still in the pile while another card
 *    is: one other card, uniform over the rest of the pile, moves to `lost`;
 * 3. per station: net = max(0, sabotage cards x `weight` - good cards x `rule.goodCancels`) over the cards left;
 *    `underMixed` when the station has `underMixBelow` and 0 < its visitors < `underMixBelow`;
 * 4. ruinWeight = the nets plus `underMixWeight` per flag; ruined when ruinWeight >= `rule.ruinWeight`;
 * 5. for the first station with `perk`: when it had a visitor and no sabotage card was committed there, one
 *    Pantry Location position `k` uniform over `pantryLocs`, and `perk.slot` is `pantry.loc.<k>`.
 * Throws on a commit naming an unknown station or card (the handler refused those).
 */
export function resolvePrep(
  commits: ReadonlyMap<string, OnubCommit>,
  seats: readonly string[],
  stations: readonly OnubStationLike[],
  cards: Readonly<Record<string, OnubCardLike | undefined>>,
  rule: { ruinWeight: number; goodCancels: number },
  pantryLocs: number,
  rng: Rng,
): PrepOutcome {
  void commits;
  void seats;
  void stations;
  void cards;
  void rule;
  void pantryLocs;
  void rng;
  throw new Error('resolvePrep: not implemented (Session 5A)');
}

// --- The night script ---------------------------------------------------------------------------------------

/** One night window as the Conductor runs it: `role` wakes for `seconds`, jitter included, before the fade. */
export interface NightWindow {
  order: number;
  role: string;
  /** Window length in seconds including its seeded jitter, before the fade. */
  seconds: number;
}

/**
 * Every window whose role is in the deck (dealt or in the Pantry), in `order`, each with a seeded jitter in
 * [0, jitterMaxS] (the `script` stream). It reads the deck and the rng only, never who holds what, so the night's
 * shape leaks nothing about the deal. Unchanged from round 4.
 */
export function nightScript(
  deck: readonly string[],
  windows: readonly { order: number; role: string; seconds: number }[],
  rng: Rng,
  jitterMaxS: number,
): NightWindow[] {
  const present = new Set(deck);
  return windows
    .filter((w) => present.has(w.role))
    .sort((a, b) => a.order - b.order)
    .map((w) => ({
      order: w.order,
      role: w.role,
      seconds: Math.round((w.seconds + rng() * jitterMaxS) * 10) / 10,
    }));
}
```

### 2.5 `rules/onubNight.ts` (Session 5B; new)

```ts
import type { NightRevealEntry, OnubWakeView } from '../protocol/index';
import type { OnubCards } from './onub';
import type { Rng } from './prng';

// Quick mode rules, ONUB v2 (GDD 3.11): the night acts on the card table, the wake view, the vote and the winners.
// Pure functions over plain data; Session 5B fills them. Slots and the table are `onub.ts`. Every body throws
// until 5B fills it.

/** Where one pick of an act may come from (`balance.onub.json` `acts[id].targets`). */
export type OnubTargetKindLike =
  'anySeatCard' | 'anySeatRole' | 'otherSeatRole' | 'otherSeatLoc' | 'pantryRole' | 'pantryLoc';

/** What the rules read of a `balance.onub.json` act. */
export interface OnubActLike {
  id: string;
  targets: readonly OnubTargetKindLike[];
  picks: number;
  effect: 'cloche' | 'peek' | 'swapWithOwn' | 'swapWithPeeked' | 'swapPair';
  reveal: 'picked' | 'ownAfter' | 'ownCards' | 'none';
  then?: string | undefined;
}

/** What the rules read of a `balance.onub.json` window. */
export interface OnubWindowLike {
  order: number;
  role: string;
  seeEachOther: boolean;
  sees: readonly string[];
  acts: readonly string[];
  onlyIfAlone: boolean;
  onTimeout: 'nothing' | 'seededPick';
}

/** The table's shape: seats in the deal order, then the Pantry (`balance.onub.json` `pantry`). */
export interface TableSize {
  seats: number;
  pantryRoles: number;
  pantryLocs: number;
}

/** A reveal row before the server names the seat behind it (`of`). */
export type OnubReveal = Omit<NightRevealEntry, 'of'>;

/**
 * The slots one pick of `act` may name for the seat at deal index `actor` (GDD 3.11): every slot of the act's
 * target kinds (`other*` never the actor's own, `any*` the actor's own included, `pantry*` every Pantry
 * position), minus `cloche`. Empty when the act cannot be made at all: a `swapWithOwn` act whose own card of the
 * target's kind lies under the cloche. Empty for an act without picks. Slot order: seats in deal order, then the
 * Pantry; for `anySeatCard` each seat's Role slot before its Location slot.
 */
export function targetPool(act: OnubActLike, actor: number, size: TableSize, cloche: string): string[] {
  void act;
  void actor;
  void size;
  void cloche;
  throw new Error('targetPool: not implemented (Session 5B)');
}

/**
 * Why a pick list is refused (422), or null: `count` when it does not name exactly `act.picks` slots,
 * `duplicate` when a slot repeats, `slot` when a slot is outside `targetPool` (the cloche included), `step`
 * when a `swapWithPeeked` act has no `peeked` slot or another act arrives while one is pending.
 */
export function actTargetsProblem(
  act: OnubActLike,
  actor: number,
  size: TableSize,
  cloche: string,
  targets: readonly string[],
  peeked: string,
): 'count' | 'duplicate' | 'slot' | 'step' | null {
  void act;
  void actor;
  void size;
  void cloche;
  void targets;
  void peeked;
  throw new Error('actTargetsProblem: not implemented (Session 5B)');
}

export interface CardActResult {
  /** The table after the act: the same multiset of roles and of stations as before, whatever the act. */
  next: OnubCards;
  /** What the actor is shown, per `act.reveal`: the picks before the act, the own card after it, or both own cards. */
  reveal: OnubReveal[];
  /** The slot the act covered (`effect: cloche`), else empty. */
  cloche: string;
  /** The slots for the act log: the actor's own slot first for `swapWithOwn`, the peeked slot first for `swapWithPeeked`, both own slots for `onub.inspect`. */
  logSlots: string[];
}

/**
 * Applies one validated act (`actTargetsProblem` returned null) to the table, for the seat at deal index `actor`.
 * `peeked` is the Pantry slot the actor peeked in the first step, for `swapWithPeeked`. A `peek` or `cloche`
 * changes nothing; a swap exchanges two slots of the same kind. Never refuses: throws on a pick it cannot apply.
 */
export function applyCardAct(
  cards: OnubCards,
  act: OnubActLike,
  actor: number,
  targets: readonly string[],
  peeked: string,
): CardActResult {
  void cards;
  void act;
  void actor;
  void targets;
  void peeked;
  throw new Error('applyCardAct: not implemented (Session 5B)');
}

/**
 * The view a waker's table shows (`nightWake.view`, GDD 3.11), from the DEALT roles (`dealt[i]` is seat `i`'s,
 * `seats[i]` its id): `mates` the other seats dealt `window.role` when `seeEachOther`; `seen` the seats dealt a
 * role of `window.sees`; `alone` when `seeEachOther` and nobody else was dealt the role; `legal` empty once
 * `state.acted`, the `then` act alone while `state.peeked` is set, else the window's acts (none when
 * `onlyIfAlone` and not `alone`) whose `targetPool` holds at least `picks` slots; `must` when
 * `window.onTimeout` is `seededPick`.
 */
export function wakeView(
  window: OnubWindowLike,
  actor: number,
  dealt: readonly string[],
  seats: readonly string[],
  acts: Readonly<Record<string, OnubActLike | undefined>>,
  size: TableSize,
  cloche: string,
  state: { acted: boolean; peeked: string },
): OnubWakeView {
  void window;
  void actor;
  void dealt;
  void seats;
  void acts;
  void size;
  void cloche;
  void state;
  throw new Error('wakeView: not implemented (Session 5B)');
}

/**
 * The picks the server makes for a must-act left undone (the `nightTimeout` stream): `act.picks` distinct slots
 * uniform over `targetPool`, or null when the pool is too small (the act is then skipped).
 */
export function seededTargets(
  act: OnubActLike,
  actor: number,
  size: TableSize,
  cloche: string,
  rng: Rng,
): string[] | null {
  void act;
  void actor;
  void size;
  void cloche;
  void rng;
  throw new Error('seededTargets: not implemented (Session 5B)');
}

// --- The vote and the winners -----------------------------------------------------------------------------

/** What the vote and the winners read of a `roles.onub.json` role. */
export interface OnubRoleInfo {
  team: 'baker' | 'mold' | 'croissant';
  spore: boolean;
  onOut: 'none' | 'dragVote';
}

/** `balance.onub.json` `vote`, as `resolveDawn` reads it. */
export interface OnubVoteRule {
  minVotesToTurnOut: number;
  tiesTurnOutAll: boolean;
  pantryTarget: boolean;
  critiqueHops: number;
}

export interface DawnOutcome {
  /** Votes per seat id, and per `"pantry"`. */
  tally: Record<string, number>;
  /** Seats in the oven, in `seats` order, the Critique's drag included. */
  outs: string[];
  /** The seat a `dragVote` card pulled in, or empty. */
  hop: string;
  /** The Pantry was among the top with at least `minVotesToTurnOut` votes. */
  pantryOut: boolean;
  /** Seats in play whose vote was not counted (none cast, or one for a non-target or for themselves). */
  abstained: string[];
}

/**
 * The CRUST vote (GDD 3.11). `seats` are the seats in play (a leaver is neither a voter nor a target); `votes`
 * maps a voter to a seat id or `"pantry"` (when `pantryTarget`); a vote from or for anyone else, or for oneself,
 * is an abstention. Everyone at the top goes in, ties included (`tiesTurnOutAll`), when the top count reaches
 * `minVotesToTurnOut`; the Pantry at the top only sets `pantryOut`. Then, `critiqueHops` times at most, a seat in
 * `outs` whose final card `onOut` is `dragVote` pulls in the seat it voted for, if that seat is not out yet.
 * `finals` maps every seat to its final Role card.
 */
export function resolveDawn(
  votes: Readonly<Record<string, string>>,
  seats: readonly string[],
  finals: ReadonlyMap<string, string>,
  roleInfo: (roleId: string) => OnubRoleInfo,
  rule: OnubVoteRule,
): DawnOutcome {
  void votes;
  void seats;
  void finals;
  void roleInfo;
  void rule;
  throw new Error('resolveDawn: not implemented (Session 5B)');
}

/** One row of `balance.onub.json` `winners`: every `when` flag that is present must match. */
export interface OnubWinnerRowLike {
  id: string;
  when: {
    ruined?: boolean | undefined;
    croissantOut?: boolean | undefined;
    sporeOut?: boolean | undefined;
    sporeAmongPlayers?: boolean | undefined;
    moldOut?: boolean | undefined;
    anyoneOut?: boolean | undefined;
  };
  winners: readonly ('baker' | 'mold' | 'croissant' | 'nobody')[];
}

/** The facts the winners table is judged on (GDD 3.11), over the final cards. */
export interface OnubWinFlags {
  ruined: boolean;
  /** A seat in `outs` holds a `croissant`-team card. */
  croissantOut: boolean;
  /** A seat in `outs` holds a `spore` card. */
  sporeOut: boolean;
  /** Some seat (in play or not) holds a `spore` card. */
  sporeAmongPlayers: boolean;
  /** A seat in `outs` holds a `mold`-team card. */
  moldOut: boolean;
  anyoneOut: boolean;
}

/** The flags for a dawn: `outs` from `resolveDawn`, `finals` every seat's final Role card, `ruined` from prep. */
export function onubWinFlags(
  outs: readonly string[],
  finals: ReadonlyMap<string, string>,
  ruined: boolean,
  roleInfo: (roleId: string) => OnubRoleInfo,
): OnubWinFlags {
  void outs;
  void finals;
  void ruined;
  void roleInfo;
  throw new Error('onubWinFlags: not implemented (Session 5B)');
}

/**
 * The winners table, first row whose `when` holds (GDD 3.11). The tokens resolve to seats by final card: `baker`,
 * `mold` and `croissant` every seat whose final card is of that team (seats in the oven included), `nobody` no
 * seat. Throws when no row holds (the table's last row must catch every dawn).
 */
export function onubWinners(
  flags: OnubWinFlags,
  finals: ReadonlyMap<string, string>,
  roleInfo: (roleId: string) => OnubRoleInfo,
  rows: readonly OnubWinnerRowLike[],
): { rowId: string; winnerIds: string[] } {
  void flags;
  void finals;
  void roleInfo;
  void rows;
  throw new Error('onubWinners: not implemented (Session 5B)');
}

/**
 * `GameState.winner` for a quick-mode result (GDD 3.11): `croissant` when the row's winners include `croissant`
 * and a seat won with it, else `nobody` when no seat won, else `cabal` for a `mold` row, else `village`.
 */
export function onubWinnerName(
  row: OnubWinnerRowLike,
  winnerIds: readonly string[],
): 'croissant' | 'village' | 'cabal' | 'nobody' {
  void row;
  void winnerIds;
  throw new Error('onubWinnerName: not implemented (Session 5B)');
}
```

### 2.6 `rules/index.ts`

```ts
// Round 4 (docs/SESSIONS.md): S added npc. Round 5: 5A fills onub (table, deal, prep), 5B fills onubNight
// (acts, wake view, vote, winners); nobody else edits this file.
export * from './onub';
export * from './onubNight';
export * from './npc';
```

The rules split in two files so 5A and 5B never wait on each other's bodies: 5B's server code calls only
`onubNight.ts` and the slot helpers, `tableAtNight` and `nightScript`, which are implemented in the pre-seed.

## 3. Pre-seed: `@wdi/content` (landed in 265bda9)

`roles.onub.json`, `balance.onub.json`, the two zod files, the `validate.ts` block and the content tests, as given in
appendix A (the `content.patch` diff). `index.ts` is unchanged. Landed; sessions do not redo it. Section 13.2's
amendment (landed) added `ruin.weightByCount`, `timers.crustCountdownS` and `targetLengthMin` 8-10 (appendix A shows
them in place).

## 4. Pre-seed: server seams

### 4.1 Random streams

ONUB draws from the independent crypto-seeded streams of `apps/server/src/sim/seeds.ts` (bugs.md: the deal must
never share a stream with anything public). The stream spec is `deck-wire.md` section 2 (ruling X2): every stream is
`sfc32` seeded with four `randomInt(2 ** 32)` words; `MatchSeeds.get(name, key?)` gives a keyed stream
(`npcPlay:<seatId>`, `npcTiming:<seatId>`) that is independent per key; `fixSeeds(room, words)` exists for tests
only. `nightTimeout` and `npcPlay` were in `StreamName` at 265bda9; `thaw`, `perk`, the key argument, `sfc32` and
`fixSeeds` landed with the round-5 stream pre-seed (`deck-wire.md` 2.2; `seeds.ts` and `rules/prng.ts` were not in
`onub-amend.patch`): `sfc32` in `packages/shared/src/rules/prng.ts`, `MatchSeeds` in `apps/server/src/sim/seeds.ts`
(built only by `startMatch` and the `PartyRoom` field initialiser), `fixSeeds` in `apps/server/test/seedHelpers.ts`,
and `prepStreams(room)` in `apps/server/src/sim/onub/Prep.ts`, which returns `{ piles, thaw, perk }` from
`room.seeds` for `resolvePrep` (4.3, 13.1). The streams ONUB reads, by name:

| Stream | Drawn by | For |
|---|---|---|
| `deal` | 5A | `dealOnub`, then `dealPantryLocs` |
| `traits` | 5A | `dealTraits` (cosmetic portraits; never the deal stream) |
| `piles` | 5A | `resolvePrep` step 1 only: each pile's card ids sorted by id, then shuffled (public order) |
| `thaw` (new) | 5A | `resolvePrep` step 2: the card each Thermostat Flip discards (secret until game over) |
| `perk` (new) | 5A | `resolvePrep` step 5: the Pantry Location slot the proofing visitors see (private to them) |
| `prepTimeout` | 5A | `timeoutCommit` |
| `script` | 5B | `nightScript` jitter |
| `nightTimeout` | 5B | `seededTargets` for a must-act left undone |
| `npcTiming:<seatId>` (keyed) | 5E | that NPC seat's commit, act, claim and vote ticks |
| `npcPlay:<seatId>` (keyed) | 5E | that NPC seat's station, card, sabotage roll, act plan, claim and vote choices |

Every NPC seat draws only from its own keyed streams. The ONUB prep sabotage roll is drawn by every NPC and ignored
unless its card sabotages, so how far a seat's stream moves never depends on its card.

### 4.2 `apps/server/src/sim/onub/state.ts` (new, implemented, locked; landed in 265bda9)

Landed as written here; sessions do not redo it. The narrator's `OnubBoard.window` needs no room-memory field: 5B
writes it from `stage` and `script[windowIdx]`.

`isOnub` moves here from `sim/Onub.ts` (the pre-seed updated its importers: `Meeting`, `Win`, `Npc`, `Phases`,
`Actions`, `Conductor`). 5A writes the deal and prep fields, 5B the night and morning fields, 5E only reads.

```ts
import {
  type DawnOutcome,
  GameMode,
  type NightWindow,
  type OnubActLogEntry,
  type OnubCards,
  type OnubCommit,
  type PrepOutcome,
  type TableSize,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';

// Room memory of one quick-mode match (GDD 3.11, ARCHITECTURE 5.14): never on the wire. Pre-seeded and locked
// for round 5: 5A writes the deal and prep fields, 5B the night and morning fields, 5E reads. A field another
// session needs goes in the PR description; the orchestrator adds it.

/** Where the Conductor is inside the night. */
export type NightStage = 'idle' | 'fade' | 'window' | 'done';

export interface OnubState {
  // --- The deal (5A, `startOnubMatch`) ---------------------------------------------------------------
  /** The deal order: slot `seat.<i>.*` is `seats[i]`; mirrored to `OnubBoard.seats`. */
  seats: string[];
  /** The deck in play (`Settings.onubDeck`, or `onubFor(n).deck`); mirrored to `OnubBoard.deck`. */
  deck: string[];
  /** Seat id -> the Role card dealt: the role card, and the window the seat wakes for all night. */
  dealt: Map<string, string>;
  /** The Pantry as dealt, position `k` at index `k`. */
  pantryRolesDealt: string[];
  pantryLocsDealt: string[];
  // --- Evening Prep (5A, `sim/onub/Prep.ts`) -----------------------------------------------------------
  /** Seat id -> its prep, human or server-made. */
  commits: Map<string, OnubCommit>;
  /** Seats whose prep the server made when the timer ran out. */
  prepAuto: Set<string>;
  /** The resolved piles, from the end of prep. */
  prep: PrepOutcome | null;
  /** The table: set by 5A with `tableAtNight` when prep ends, changed only by 5B's acts; final at dawn. */
  cards: OnubCards;
  // --- The night (5B, `sim/Conductor.ts`, `sim/onub/Acts.ts`) ------------------------------------------
  script: NightWindow[];
  stage: NightStage;
  windowIdx: number;
  /** When the current stage ends: the window's close, or the end of its fade. */
  stageEndsTick: number;
  /** Seats woken for the open window (dealt its role). */
  wakers: string[];
  /** Seats that have finished their act this window. */
  acted: Set<string>;
  /** Seat id -> the Pantry slot it peeked in a first step (the Tourrier), until its second step. */
  peeked: Map<string, string>;
  /** The Iron Cloche's slot, or empty. */
  cloche: string;
  actLog: OnubActLogEntry[];
  // --- The morning (5B, quick branches of `sim/Meeting.ts` and `sim/Win.ts`) ---------------------------
  /** Voter -> seat id or `"pantry"`, as counted at the reveal. */
  votes: Record<string, string>;
  dawn: DawnOutcome | null;
}

const states = new WeakMap<PartyRoom, OnubState>();

/** Quick mode is on for this party (`Settings.mode`, ARCHITECTURE 5.14). */
export const isOnub = (room: PartyRoom): boolean => room.state.settings.mode === GameMode.onub;
export const onubOf = (room: PartyRoom): OnubState | undefined => states.get(room);
export const setOnub = (room: PartyRoom, s: OnubState): void => {
  states.set(room, s);
};
export const clearOnub = (room: PartyRoom): void => {
  states.delete(room);
};

/** A fresh match memory after the deal: prep, night and morning fields empty, the table empty until prep ends. */
export function createOnubState(
  seats: readonly string[],
  deck: readonly string[],
  dealt: ReadonlyMap<string, string>,
  pantryRolesDealt: readonly string[],
  pantryLocsDealt: readonly string[],
): OnubState {
  return {
    seats: [...seats],
    deck: [...deck],
    dealt: new Map(dealt),
    pantryRolesDealt: [...pantryRolesDealt],
    pantryLocsDealt: [...pantryLocsDealt],
    commits: new Map(),
    prepAuto: new Set(),
    prep: null,
    cards: { roles: new Map(), locs: new Map() },
    script: [],
    stage: 'idle',
    windowIdx: -1,
    stageEndsTick: 0,
    wakers: [],
    acted: new Set(),
    peeked: new Map(),
    cloche: '',
    actLog: [],
    votes: {},
    dawn: null,
  };
}

/** A seat's index in the deal order (-1 for a non-seat). */
export const seatIndexOf = (o: OnubState, seatId: string): number => o.seats.indexOf(seatId);

/** The table's shape, for the rules. */
export const tableSizeOf = (o: OnubState): TableSize => ({
  seats: o.seats.length,
  pantryRoles: o.pantryRolesDealt.length,
  pantryLocs: o.pantryLocsDealt.length,
});
```

### 4.3 Hooks (pre-seeded with stub bodies unless marked)

| File (owner) | Signature | Called by | Stub until the owner lands |
|---|---|---|---|
| `sim/Onub.ts` (5A) | `startOnubMatch(room: PartyRoom, ids: readonly string[]): boolean` | `startMatch` in `rooms/handlers/lobby.ts`, before the main deal (the `rng` argument is gone: streams come from `sim/seeds.ts`) | in quick mode: refuse Start 422 to every seat and return true |
| `sim/Onub.ts` (5A) | `beginOnubPlay(room: PartyRoom): boolean` | `beginPlay`, first | false |
| `sim/Onub.ts` (5A, body pre-seeded and kept as is) | `handleOnubAbility(room, sessionId, payload): void`: `payload.abilityId === ONUB_PREP` goes to `handlePrep`, every other `onub.*` id to `handleOnubAct` | `handleAbility` (`sim/Actions.ts`), for every `act.ability` id starting `onub.` | implemented |
| `sim/Onub.ts` (5A) | `onubDeckSetting(deck: unknown): string[] \| null`: the deck to store, or null when it is not an array of strings or `onubDeckProblem` (no size) finds a problem | `handleSettings` (lobby.ts), which validates every field first, refuses 422 on null and only then writes `settings.onubDeck` (all or nothing, A41) | null for any non-empty deck, `[]` for `[]` |
| `sim/Onub.ts` (5A) | `resetOnubForLobby(room: PartyRoom): void`: clears `OnubState` and every field of `GameState.onub` (`window` included, section 13), never `Settings.onubDeck` | `resetToLobby` (exists) | clears the state |
| `sim/onub/Prep.ts` (5A, new) | `handlePrep(room, sessionId, payload): void`; `runPrep(room): void` (each tick in `Phase.dusk`: ends prep at `phaseEndsTick`, or early when every seat has committed and `prep.endsWhenAllCommitted`); `endPrep(room): void` (timeout commits, `resolvePrep` with `onubBalance.ruin` and `prepStreams(room)`, the `piles`, `thaw` and `perk` streams, `o.cards = tableAtNight(...)`, the board's piles, ruin and perk, the perk's `nightReveal` to each proofing visitor, `Phase.prepReveal` for `prepRevealS`) | `handleOnubAbility`; `runOnubPhases`; `onubClock` | refuse 422; no-op; no-op (its doc comment holds the exact `resolvePrep` call, 13.1) |
| `sim/onub/Prep.ts` (5A, body pre-seeded and kept as is) | `prepStreams(room): OnubPrepStreams`: `{ piles, thaw, perk }` from `room.seeds` | 5A's `endPrep`, as `resolvePrep`'s last argument (no call in the pre-seed) | implemented |
| `sim/onub/Acts.ts` (5B, new) | `handleOnubAct(room, sessionId, payload): void`; `onubWakeView(room: PartyRoom, seatId: string): OnubWakeView \| null` (the view the seat would be sent now; null while it is not awake) | `handleOnubAbility`; the Conductor; 5E's NPC brain | refuse 425; null |
| `sim/Conductor.ts` (5B) | `runConductor(room): void` (exists, `sim/Step.ts` after the portals; writes `GameState.onub.window`: the role id as each window opens, '' as it closes, through the fade); `runOnubPhases(room): void` (exists, `runPhases` hands over in quick mode); `onubClock(room, sessionId, payload): boolean` (exists) | as today | the skeleton below |
| `sim/Meeting.ts` (5B, quick branches) | `handleClaim(room, sessionId, payload): void` (v2 payload) and the branches named in section 1 | as today | quick mode: `handleClaim` refuses 422; `startOnubReveal` goes straight to `endOnubMatch` |
| `sim/Win.ts` (5B) | `endOnubMatch(room): void` | `endReveal` in quick mode | `Phase.gameOver` with `winner = Winner.nobody` and no `onub` |
| `sim/npc/onub.ts` (5E) | `runOnubNpc(room, mem, brain, player, p): void` | `runNpcs` (`sim/Npc.ts`) in quick mode for every phase but `roleReveal` (pre-seeded routing: `roleReveal` -> `readyOnRoleCard`, which marks the seat card-ready through 5F's `markCardReady(room, id)` in both modes and writes `player.ready` until 5F lands; quick -> `runOnubNpc`; main meeting phases -> `runMeetingVotes(..., false)`; main world phases -> `runWorldNpc`) | `stand(p)` |

The pre-seeded `runOnubPhases` (5B then owns it; the hand-off lines stay):

```ts
export function runOnubPhases(room: PartyRoom): void {
  const sim = simOf(room);
  for (const e of sim.deaths) if (e.cause === 'vanished') flowOf(room).vanished++; // bugs.md: leavers counted
  sim.deaths.length = 0;
  sim.meetingRequests.length = 0;
  const o = onubOf(room);
  if (!o) return;
  const { phase, tick, phaseEndsTick } = room.state;
  if (phase === Phase.dusk) runPrep(room); // 5A: ends prep, sets Phase.prepReveal
  else if (phase === Phase.prepReveal && tick >= phaseEndsTick) enterNight(room, o); // 5B
  else if (phase === Phase.dawn && tick >= phaseEndsTick) openMeeting(room, { reason: 'dawn', callerId: '' });
  else if (phase === Phase.meetingDiscussion || phase === Phase.meetingVote || phase === Phase.reveal) {
    runMeeting(room);
  }
}
```

Other pre-seeded call-site edits: `handleSettings` clears `flowOf(room).fixedDeal` whenever `mode` changes (bugs.md,
the cross-mode `debug.deal` crash); `resetToLobby` clears `priv.onubLoc` and `priv.onubCard` and no longer touches
`meeting.traces`; `Brain` (`sim/npc/memory.ts`) loses `plateSends`, `lastPlateSendTick` and `sentPlan` (5E keeps its
brain state in its own `WeakMap` in `sim/npc/onub.ts`); `MatchRecord.winner` reads `croissant` where it read
`debtor`.

### 4.4 Phase hand-offs

| From -> to | Who | When | What changes on the wire |
|---|---|---|---|
| lobby -> roleReveal | 5A `startOnubMatch` | Start accepted, deck size right | `GameState.onub.seats`, `.deck`; private `roleReveal`; `Private.role` |
| roleReveal -> dusk | 5A `beginOnubPlay` | card timer or every seat card-ready (5F's private `flow.cardReady`) | every seat's `PlayerSim.sceneIdx = LOFT_SCENE_INDEX`, `placed = true`, its scene index on the wire 255 (`Player.sceneId`, and `Private.sceneId`, which the main-mode pre-seed added beside the public field, ruling X1; 5F removes `Player.sceneId` in its contract phase); `phaseEndsTick` = `prepS` |
| dusk -> prepReveal | 5A `runPrep` / `endPrep` | `phaseEndsTick`, or all committed | `GameState.onub.piles`, `ruinWeight`, `ruined`, `perk`; perk `nightReveal` to proofing visitors; `phaseEndsTick` = `prepRevealS` |
| prepReveal -> night | 5B `enterNight` | `phaseEndsTick` | `phaseChange` with the nominal night end; nothing else |
| night windows | 5B `runConductor` | each window | public: `GameState.onub.window` = the window's role as it opens, '' as it closes and through its fade (the narrator); wakers only: `nightWake`, `nightReveal` (sightings at open, then per act), `nightSleep` at close |
| night -> dawn | 5B | last fade | `GameState.onub.cloche`; `onub.window` stays ''; `phaseEndsTick` = `dawnS` |
| dawn -> meetingDiscussion | 5B (`openMeeting`, reason `dawn`) | `phaseEndsTick` | `meetingStart`; `MeetingState.claims` cleared; `phaseEndsTick` = `rushS` |
| meetingDiscussion -> meetingVote | 5B (`runMeeting`) | `phaseEndsTick` only (the Rush never ends early) | `phaseEndsTick` = `voteS` |
| meetingVote -> reveal | 5B (`startOnubReveal`) | `phaseEndsTick`, or every seat in play has voted once `timers.crustCountdownS` has passed since CRUST opened | `voteResult`; `alive = false` for `outs`; `phaseEndsTick` = `revealS` |
| reveal -> gameOver | 5B (`endOnubMatch`) | `phaseEndsTick` | `gameOver` with `onub`; `GameState.winner` |
| gameOver -> lobby | `resetToLobby` (exists) | `balance.phases.gameOverS` | board, claims, `Private` quick fields cleared; `settings.mode` and `onubDeck` kept |

### 4.5 Debug (`WDI_DEBUG=1`)

`debug.deal {roles: {seatId: roleId}}` is honoured by `startOnubMatch` (5A), which drops ids unknown to
`roles.onub.json` and fills the rest of the deck by the deal stream. `debug.clock` in quick mode (5B's `onubClock`):
`{phase: 'prepReveal'}` from dusk calls `endPrep`; `{phase: 'night'}` from prepReveal starts the night; `{phase:
'dawn'}` from dusk, prepReveal or night runs every remaining step at once (prep timeouts, must-acts by seed, no other
act) and opens dawn; `{window: roleId}` in the night closes the open window and opens that one (`onub.window`
follows); anything else is 425 in the wrong phase and 422 when unknown.

### 4.6 Refusals

| Message | 425 (`wrongPhase`) | 422 (`cannot`) |
|---|---|---|
| `act.ability onub.prep` | outside `Phase.dusk` | a second commit; `prepCommitProblem` not null; malformed `targets` |
| `act.ability` night act | outside `Phase.night`, outside an open window, or the open window's role is not the actor's dealt role | not an act of this window; `onlyIfAlone` and not alone; `actTargetsProblem` not null; already acted |
| `meeting.claim` | outside the Rush and CRUST | a seat not in play; `roleId` not in `OnubBoard.deck`; unknown station; a card not of the claimed station; more than `claims.maxSaw` sightings; a sighting target that is neither a seat nor `"pantry"` |
| `meeting.vote` | outside the Rush and CRUST | `"skip"`; the voter's own id; a target that is neither a seat in play nor `"pantry"` |
| `lobby.settings {onubDeck}` | not the lobby (leader) | not the leader; `onubDeckSetting` null |
| `lobby.start` (quick mode) | not the lobby | the deck in play is not seats + `pantry.roles` cards (`onubDeckProblem` with the size) |

## 5. Pre-seed: client seams

### 5.1 `apps/client/src/net/onub.ts` (new, locked)

```ts
import type { Emitter } from 'mitt';
import type { NightRevealEntry, OnubClaimPayload, S2CPayloads } from '@wdi/shared/protocol';

// What the ONUB v2 screens (Kitchen, Night, the Rush panel, the end panel, the deck editor) read from the network
// (GDD 3.11). `ColyseusOnubFeed` (`net/onubColyseus.ts`, 5D) reads the room; `MockOnubFeed`
// (`net/mock/onubMock.ts`, pre-seeded composer of 5C's prep mock and 5D's night mock) plays a scripted match on
// `?mock=1&mode=onub`. Votes and chat stay on the MeetingFeed. Pre-seeded and locked for round 5.

/** One pile on the public board (`OnubBoard.piles[station]`). */
export interface OnubPileView {
  cards: string[];
  lost: number;
  net: number;
  underMixed: boolean;
}

/** `GameState.onub` as plain data; empty arrays and an empty `piles` before they are filled. */
export interface OnubBoardView {
  seats: string[];
  deck: string[];
  piles: Record<string, OnubPileView>;
  ruinWeight: number;
  ruined: boolean;
  perk: boolean;
  cloche: string;
}

/** One seat's latest claim (`MeetingState.claims`); empty strings are parts left out. */
export interface OnubClaimView {
  from: string;
  roleId: string;
  stationId: string;
  cardId: string;
  saw: { targetId: string; roleId: string; stationId: string }[];
}

export type OnubFeedEvents = {
  nightWake: S2CPayloads['nightWake'];
  nightReveal: S2CPayloads['nightReveal'];
  nightSleep: S2CPayloads['nightSleep'];
  phaseChange: S2CPayloads['phaseChange'];
  /** Any change of `GameState.onub` (the board). */
  board: OnubBoardView;
  /** Any change of `MeetingState.claims`. */
  claims: readonly OnubClaimView[];
};

export interface OnubFeed {
  readonly bus: Emitter<OnubFeedEvents>;
  readonly selfId: string;
  /** `state.phase`, `state.phaseEndsTick` and `state.tick`. */
  clock(): { phase: number; phaseEndsTick: number; tick: number };
  /** Every seat in the deal order with its public name (empty before the role card). */
  seats(): { id: string; name: string }[];
  board(): OnubBoardView;
  /** The Role card this seat was dealt (`Private.role.roleId`); the client never knows the current one. */
  dealtRole(): string;
  /** This seat's prep once committed, by itself or by the server (`Private.onubLoc`, `Private.onubCard`). */
  myPrep(): { station: string; card: string } | null;
  /** Everything this seat learned, oldest first (`Private.nightReveal`). */
  reveals(): readonly NightRevealEntry[];
  /** This seat's open window (the latest `nightWake`), or null while it sleeps and outside the night. */
  wake(): S2CPayloads['nightWake'] | null;
  /** Every seat's latest claim. */
  claims(): readonly OnubClaimView[];
  /** `act.ability {abilityId: 'onub.prep', targets: [stationId, cardId]}`. */
  prep(stationId: string, cardId: string): void;
  /** `act.ability {abilityId, targets}` for a night act. */
  act(abilityId: string, targets: readonly string[]): void;
  /** `meeting.claim`. */
  claim(c: OnubClaimPayload): void;
  dispose(): void;
}

/** Phaser registry key under which the router publishes the active ONUB feed. */
export const REG_ONUB = 'onubFeed';
```

Amended by section 13.3: `OnubBoardView` gains `window: string` after `cloche` (the narrator, from `OnubBoard.window`).

The vote and chat stay on `MeetingFeed` (`vote('pantry')` is a legal call in quick mode). The pre-seed removed
`claims()`, `traces()` and `claim()` from `MeetingFeed`, its Colyseus feed and its mock; `ClaimRow` went with them.

### 5.2 Routes (`apps/client/src/net/onubRouter.ts`, pre-seeded and implemented)

`installWorldRouter` installs it when `state.settings.mode` is `onub` and publishes the feed under `REG_ONUB`. Round
4's `nightSleep`/`nightWake`/Loft routes are deleted from `worldRouter.ts`.

| Event | Route |
|---|---|
| `phaseChange` to `dusk` or `prepReveal` | stop every match scene but RoleReveal (it sleeps itself, as today), start `Kitchen` |
| `phaseChange` to `night` or `dawn` | stop `Kitchen`, start `Night` (it draws lights-out until a `nightWake`, and the dawn panel) |
| `meetingStart` | as today: start `Meeting`; in quick mode `ui/Meeting.ts` mounts the Rush panel |
| `gameOver` | as today: start `GameOver`; in quick mode `ui/GameOver.ts` mounts the end panel |
| `phaseChange` to `lobby` | as today |

### 5.3 Scenes and mount hooks (pre-seeded as empty or stubbed)

| Hook | Owner | Pre-seed |
|---|---|---|
| `scenes/Kitchen.ts`, key `Kitchen` | 5C | an empty Phaser scene registered in `main.ts` after `World` |
| `scenes/Night.ts`, key `Night` | 5D | an empty scene registered after `Kitchen`; `Loft` is unregistered |
| `ui/lobby/DeckEditor.ts`: `mountDeckEditor(root: HTMLElement, net: NetworkService): { update(s: LobbySnapshot): void; destroy(): void }` | 5C | a stub that renders nothing; `ui/Lobby.ts` mounts it under the settings block; `NetworkService` gains `setOnubDeck(deck: readonly string[])` and `LobbySettings` gains `onubDeck: string[]` |
| `view/onub/PilesView.ts`: `renderPiles(root: HTMLElement, board: OnubBoardView, opts: { compact: boolean }): void` | 5C (5D calls it on the Rush board) | renders a plain list of station names and card ids |
| `ui/onub/rush.ts`: `mountRush(root: HTMLElement, meeting: MeetingFeed, onub: OnubFeed): { update(): void; destroy(): void }` | 5D | renders nothing; `ui/Meeting.ts` calls it in quick mode and hides Skip there |
| `ui/onub/over.ts`: `renderOnubOver(root: HTMLElement, over: OnubGameOver, names: (id: string) => string): void` | 5D | renders nothing; `ui/GameOver.ts` calls it when `over.onub` is set |
| `net/mock/onubMock.ts`: `MockOnubFeed implements OnubFeed` with the shared mock clock; delegates `prep`, `myPrep`, `board` to `onubPrepMock.ts` (5C) and `act`, `wake`, `reveals`, `claims`, `claim`, the board's `cloche` and its `window` (section 13.3) to `onubNightMock.ts` (5D); `onubMockRoleCard(): RoleRevealPayload` for `net/mock.ts`'s quick-mode Start (bugs.md: no more Killer card in the quick mock) | composer locked; the two halves 5C and 5D | both halves stubbed with a fixed 5-seat deal |
| `ui/RoleCard.ts` | (not an ONUB session) | shows `teamName` in place of the faction label when it is set |

### 5.4 Art keys (5M produces them; until then the client draws a labelled greybox)

`onub_station_<stationId>` (4, the Brick Oven generated), `onub_scene_<sceneId>` (10, the keys of
`roles.onub.json` `scenes`), `onub_kitchen` (the overview), `onub_card_<cardId>` (18 ingredient cards),
`onub_loc_<stationId>` (4 Location card faces), `onub_card_back_role`, `onub_card_back_loc`, `onub_cloche`,
`onub_portrait_<roleId>` (15, private on the own card and night scene, public at game over), `onub_baker` (the neutral
seat portrait every seat shows during the match). All are `type: image` entries in both manifests. To them the art
plan adds `onub_mini` (art plan 5.7: the mini-game sprites, one multiatlas page, 5M, drawn by 5C).

Every key above, `onub_mini` included, carries `modes: ['onub']` in both manifests (ruling C7: the optional manifest
field `modes: ('main'|'onub')[]` of SPRITES 5; an entry with `modes` loads when the match's mode is listed), so they
load at ONUB match start, whatever the client's card, and never in the main mode; `manifest.test.ts` checks both
manifests. `loft_backdrop`, `prop_bedroll` and `prop_bedroll_self` leave the manifests with 5M. The bakery frames
(`prop_plate`, `prop_deadLoaf`, `prop_ledger`, `prop_wakeTable`, frames of the `props` atlas, not manifest keys) move
to `props_hollowmere` (5K). The `storm`, `creak`, `stamp` and `loaf_crack` audio stay (lights-out, reveal, end).

## 6. Private and public, per phase

"Public" is the schema state every client receives; "private" is the own client only (`Private` or a message sent
to one client); "room memory" never leaves the server before `gameOver`.

| Phase | Public | Private (own client only) | Room memory only |
|---|---|---|---|
| lobby | `settings.mode`, `settings.onubDeck`, the roster, `npcSeats` (a count) | none | which seats are NPCs |
| roleReveal (12 s) | `onub.seats`, `onub.deck`; no `ready` tick (5F's `flow.cardReady` holds it privately in both modes) | `roleReveal {roleId, team, teamName, goal, cardText, beware, teammates: [], traits}`; `Private.role` (the dealt card) | the deal, the Pantry's Role and Location cards, every stream |
| dusk, Evening Prep (60 s) | `phase`, `phaseEndsTick`; nothing per seat: no `ready`, no `hasVoted`, no scene, no presence, no count | `Private.onubLoc`, `Private.onubCard` once committed (by the seat or the server) | every commit, its timing, who sabotaged, the mini-game (never sent at all) |
| prepReveal (15 s) | `onub.piles` (cards in seeded order, `lost` count, `net`, `underMixed`), `onub.ruinWeight`, `onub.ruined`, `onub.perk` | proofing visitors when the perk fired: one `nightReveal` entry (`kind: 'loc'`, a Pantry slot) | who played which card, which cards the thaw took, which Pantry card the perk showed |
| night | `phase`, the nominal `phaseEndsTick` and `onub.window` (the open window's role id, '' during fades: the narrator; every window of the deck runs whatever was dealt) | wakers only, in their own window: `nightWake {windowRole, endsTick, view}`, `nightReveal` (`mate` rows at the window's opening, then one per accepted act, empty for an act that shows nothing), `nightSleep`; the same rows in `Private.nightReveal`. Sleepers receive nothing all night. | the table (`cards`), the wakers, whether a seat woke or acted, the Cloche, the act log, the NPC plans |
| dawn (5 s) | `onub.cloche` | none | the final cards |
| meetingDiscussion, Morning Rush (300 s) | `meeting.claims`; `hasVoted`; chat on the meeting channel | `Private.myVote` | the votes |
| meetingVote, CRUST (20 s; its first `crustCountdownS` 3 s are the countdown) | as the Rush | as the Rush | as the Rush |
| reveal (30 s) | `voteResult {tally (with "pantry"), outs, hop, pantryOut, roles: final Role cards of outs, abstained}`; `alive = false` for `outs` | the turned-out talk on the ghost channel | every other final card |
| gameOver | `gameOver {winner, roles: every final Role card, summary, onub: OnubGameOver}` | none | none |

Never on the wire before `gameOver`: anyone's current Role or Location card (your own after the night included) and
the Pantry's contents, except what an act showed its own actor; who played which prep card, a commit's timing,
whether a seat woke or acted, which seats are NPCs, who is ready on the role card. The open window is public
(`OnubBoard.window`): it follows the night script, which reads the deck and the `script` stream only. Every ONUB
seat sits in the `loft` pseudo-scene from dusk to the lobby, so `reconcileViews` grants no SceneState and no presence
to anyone; the public `sceneId` reads 255 for every seat (the main-mode pre-seed added `Private.sceneId` beside it and 5F
removes the public field in its contract phase, ruling X1; the scene index still reads 255). `Player.look` stays empty in quick mode: every seat shows the neutral `onub_baker` portrait with its cosmetic
traits.

**Audio at night.** Every page plays the same thing all night: the sleepers' sound bed (client-side noises with no
link to the windows) plus the narrator's call for each `onub.window` change. A waker's client plays exactly that: no
wake cue, no role-scene audio, nothing keyed to `nightWake`, `nightReveal` or `nightSleep`.

**Privacy invariants** (ruling P7; each is a test in the file named, written by the session named; O8 and O9 are the
narrator tests of ruling F5):

| Id | Owner | Test file | Invariant |
|---|---|---|---|
| O1 | 5A | `apps/server/test/onubContract.test.ts` | An observer's decoded state and messages, tick excluded, are identical from dusk to the end of prep whether a given seat commits at 5 s or 50 s, good or sabotage. |
| O2 | 5A | `packages/shared/test/onubPrep.test.ts` | Across 200 runs with fixed commits, a card's pile position is independent of its committer's deal index. |
| O3 | 5A | `apps/server/test/onubContract.test.ts` | At `endPrep`, only proofing visitors receive any message. |
| O4 | 5B | `apps/server/test/onubNight.test.ts` | A sleeper's state and messages over the whole night are identical whether every waker acts or none does. `OnubBoard.cloche` stays '' until dawn. |
| O5 | 5B | `apps/server/test/onubNight.test.ts` | With the `script` seed fixed, night length is identical across 50 deals of the same deck. |
| O6 | 5B | `apps/server/test/onubNight.test.ts` | No act changes any seat's `Private.role`, `onubLoc` or `onubCard`. |
| O7 | 5B | `apps/server/test/onubNight.test.ts` | Any act from a seat whose window is not open gets 425, whichever window is open or fading. |
| O8 | 5B | `apps/server/test/onubNight.test.ts` | Every seat receives the same `OnubBoard.window` sequence, in deck order (each window's role, then '' for its fade), whatever was dealt. |
| O9 | 5D | `apps/client/src/view/onub/NightView.test.ts` | A `nightWake` starts no audio key; a waking page and a sleeping page fed the same `window` sequence start the same audio keys. |

## 7. Frozen `data-testid` hooks

A spec may use only the assertion listed for a hook (plus `.click()` where the hook is a control and `.first()`
where it says "several"). Hidden means `toBeHidden()`, which passes whether the element is hidden or absent, so no
spec ever depends on hide versus remove. Text is never asserted on an ONUB hook: copy may change, hooks may not.

**Lobby (5C).**

| Hook | Element | Assertion |
|---|---|---|
| `mode-chip`, `mode-toggle` | unchanged from round 4 | `toBeVisible()` |
| `deck-editor` | the deck editor panel | `toBeVisible()` in quick mode, `toBeHidden()` in the main mode |
| `deck-role-<roleId>` | one toggle per role of `roles.onub.json` (15) | `toHaveCount(1)`; `toBeEnabled()` for the leader, `toBeDisabled()` for everyone else |
| `deck-reset` | the leader's "default deck" control | `toBeVisible()` for the leader, `toBeHidden()` for everyone else |
| `deck-problem` | the line saying why the deck cannot start | `toBeHidden()` when the deck fits the party, `toBeVisible()` when it does not |

**Role card** (unchanged hooks, 5F's file): `rolecard`, `role-name`, `ready`: `toBeVisible()`. Ready is private in
both modes (ruling P8): `ready` marks the own seat card-ready through 5F's `flow.cardReady` (`sim/Covers.ts`), and no
other page shows a tick, so no spec asserts another seat's readiness.

**Kitchen and Evening Prep (5C).**

| Hook | Element | Assertion |
|---|---|---|
| `kitchen` | the overview root | `toBeVisible()` in dusk and prepReveal; `toBeHidden()` from the night on |
| `onub-clock` | the phase timer (Kitchen; the waker's table) | `toBeVisible()` |
| `station-<stationId>` | the four room buttons | `toHaveCount(1)` each; `toBeEnabled()` before the commit, `toBeDisabled()` after |
| `station-room` | the open station room | `toBeVisible()` after a station is tapped |
| `station-back` | back to the overview | `toBeVisible()` in a room before the commit, `toBeHidden()` after |
| `minigame-<stationId>` | the mini-game | `toBeVisible()` in the room until it is done |
| `minigame-assist` | the Done control after `timers.minigameAssistS` | `toBeVisible()` within `minigameAssistS + 5` s; clicking it completes the mini-game |
| `hand` | the card hand | `toBeHidden()` until the mini-game is done, `toBeVisible()` after |
| `card-<cardId>` | one hand card | good cards `toBeVisible()`; sabotage cards `toHaveCount(0)` for a seat dealt a Baker or Croissant card, `toBeVisible()` for a seat dealt Team Mold |
| `prep-commit` | the commit control | `toBeDisabled()` until a card is picked, `toBeEnabled()` after |
| `prep-done` | the waiting panel after the commit | `toBeVisible()` after the seat's commit or the server's |
| `prep-board` | the crime-scene board | `toBeVisible()` in prepReveal |
| `pile-<stationId>` | one pile on the board | `toHaveCount(1)` each, inside `prep-board` and `rush-board` |
| `ruin-banner` | the ruined line | `toBeVisible()` when `onub.ruined`, else `toBeHidden()` |
| `under-mix-flag` | the Mixer's caution flag | `toBeVisible()` when the Mixer pile is under-mixed, else `toBeHidden()` |
| `perk-card` | the Pantry Location card the perk showed | `toBeVisible()` for a proofing visitor when the perk fired, else `toBeHidden()` |

**Night (5D).**

| Hook | Element | Assertion |
|---|---|---|
| `night` | the Night scene root | `toBeVisible()` in night and dawn on every page |
| `lights-out` | the sleeper's screen | `toBeVisible()` while the seat sleeps, `toBeHidden()` while it is awake |
| `narrator` | the narrator's call line (`onub.narrator.<roleId>.wake` / `.sleep`) | `toBeVisible()` on every page, waking or sleeping, while `onub.window` is set |
| `night-wake` | the role scene with the card table (round 4's id) | `toBeVisible()` only on the page whose dealt role's window is open; `toBeHidden()` on every other page |
| `card-table` | the table inside `night-wake` | `toBeVisible()` |
| `slot-<slotId>` | one card, e.g. `slot-seat.0.role`, `slot-pantry.loc.2` | `toHaveCount(1)` per slot; `[data-testid^="slot-"]` `toHaveCount(2 * seats + pantry.roles + pantry.locations)` |
| `act-<actId>` | one act choice, e.g. `act-onub.peekRole` | `toBeVisible()` for each act in `view.legal` |
| `act-confirm` | sends the act | `toBeDisabled()` until the picks are complete, `toBeEnabled()` after |
| `cloche-token` | the Iron Cloche on the table | `toBeVisible()` when `view.cloche` is set, else `toBeHidden()` |
| `night-reveal` | what this seat learned (round 4's id) | `toBeVisible()` once it has an entry |
| `night-reveal-entry` | one learned row (several) | `toHaveCount(n)` for `n` rows of `Private.nightReveal` |
| `night-done` | the done state after an accepted act | `toBeVisible()` after `nightReveal` answers the act |
| `dawn` | the dawn panel | `toBeVisible()` in dawn |

**Morning Rush, CRUST and the reveal (5D).**

| Hook | Element | Assertion |
|---|---|---|
| `meeting`, `meeting-reason` | round 3's | `toBeVisible()` |
| `rush-board` | the public board on the Rush | `toBeVisible()` |
| `vote-pantry` | the Pantry vote tile | `toBeVisible()` in quick mode, `toBeHidden()` in the main mode |
| `vote-skip` | round 3's | `toBeHidden()` in quick mode |
| `portrait-<id>` | round 3's | the own tile `toBeDisabled()`, every other seat in play `toBeEnabled()` in the Rush and CRUST |
| `claim-open` | opens the claim form | `toBeVisible()` for a seat in play in the Rush and CRUST |
| `claim-role-<roleId>` | role chips, deck roles only | `toBeVisible()` once the form is open; `toHaveCount(0)` for a role not in the deck |
| `claim-station-<stationId>` | station chips | `toBeVisible()` once the form is open |
| `claim-card-<cardId>` | the cards of the picked station | `toBeVisible()` after a station is picked |
| `claim-saw-add` | adds a sighting | `toBeVisible()` until `claims.maxSaw` sightings, then `toBeHidden()` |
| `claim-post` | sends the claim | `toBeDisabled()` until a role is picked, `toBeEnabled()` after |
| `claimed-<id>` | round 4's portrait chip | `toBeVisible()` once that seat has claimed |
| `stamp` | round 3's (several on a tie) | `.first()` `toBeVisible()` |
| `reveal-role` | round 3's | `toBeVisible()` at the reveal |
| `reveal-hop` | the Critique's drag line | `toBeVisible()` when `voteResult.hop` is set, else `toBeHidden()` |
| `reveal-pantry` | the "the Pantry was pointed at" line | `toBeVisible()` when `voteResult.pantryOut`, else `toBeHidden()` |
| `reveal-abstained` | round 4's | `toBeVisible()` when someone abstained, else `toBeHidden()` |

**Game over (5D).**

| Hook | Element | Assertion |
|---|---|---|
| `gameover`, `gameover-winner` | round 3's | `toBeVisible()` |
| `gameover-final-<id>` | the final Role card of a seat (round 4's id) | `toBeVisible()` for every seat |
| `gameover-loc-<id>` | the final Location card of a seat | `toBeVisible()` for every seat |
| `gameover-pantry` | the Pantry panel | `toBeVisible()` |
| `gameover-pantry-role-<k>`, `gameover-pantry-loc-<k>` | one Pantry card | `toHaveCount(1)` for each `k` in `0..pantry.roles - 1` and `0..pantry.locations - 1` |
| `gameover-piles` | every pile with its lost cards | `toBeVisible()` |
| `actlog` | the night's timeline (replaces round 4's `swaplog`) | `toBeVisible()` |
| `actlog-entry` | one act (several) | `toHaveCount(n)` for `n = gameOver.onub.actLog.length` |

Round 4's `loft`, `bedroll-<id>`, `swaplog`, `claims`, `claim-<roleId>`, `claim-form`, `claim-target`, `claim-saw`
and `gameover-center*` hooks are retired; no ONUB v2 screen renders them.

## 8. Copy ids: who owns which namespace

Every quick-mode line has an id of `docs/UI.md` 14.12 (5C) or 14.14 (5D), written there first, then pasted into the
session's own copy module; ids are prefixed `onub.` so they never collide with a main-mode module. Values in braces
are filled with `fill()`. Names come from content and are never restated in copy: role `name` and `gloss`, team
`name`, scene `name`, station `name` and `gloss`, card `name` and `text`, the role card's `cardLine`, `nightAct` and
`cardText`, the winners row `text` (shown under the headline as `summary`).

| Namespace | Owner and module | Lines |
|---|---|---|
| `onub.deck.*`, `onub.deck.problem.<OnubDeckProblem>` | 5C, `ui/copy/onubPrep.ts` | the deck editor, its five problem lines (`unknownRole`, `notShipped`, `copies`, `missingRequired`, `size`) |
| `onub.kitchen.*`, `onub.station.*` | 5C | the overview, entering and leaving a room, the timer caption |
| `onub.mini.crates.*`, `onub.mini.pour.*`, `onub.mini.slide.*`, `onub.mini.stoke.*`, `onub.mini.assist` | 5C | each mini-game's instruction and done lines, the Done control |
| `onub.hand.*`, `onub.prep.*` | 5C | the hand, the commit, the waiting panel, the server-made commit ("The kitchen chose for you") |
| `onub.board.*` | 5C (5D reuses them on the Rush board through `PilesView`) | pile headers, "{count} card lost to the thaw", the under-mix flag, the net weight, the ruin line, the perk line |
| `onub.refuse.prep` | 5C | a 422 on `onub.prep` |
| `onub.night.*`, `onub.wake.*` | 5D, `ui/copy/onubNight.ts` | lights-out caption, the window banner, mates, the Levain's Spores, the lone Spore and the lone Commis, done |
| `onub.narrator.<roleId>.wake`, `onub.narrator.<roleId>.sleep` | 5D | the narrator's call as each window opens and closes, one pair per waking role ("Le Sous-Chef, réveillez-vous…"), the same on every page |
| `onub.act.<act>.*` (the act id after `onub.`, e.g. `onub.act.peekRole.pick`) | 5D | each act's control label and pick prompts |
| `onub.reveal.*` | 5D | what a peek, a swap or a sighting showed (`nightReveal` rows) |
| `onub.dawn.*`, `onub.rush.*`, `onub.claim.*`, `onub.vote.*` | 5D | dawn, the Rush board, claim form and claim lines, the Pantry tile, CRUST and its "Un, deux, trois, CRUST!" countdown |
| `onub.out.*` | 5D | the reveal: outs, ties, the drag, the Pantry, abstainers |
| `onub.over.*`, `onub.over.row.<rowId>`, `onub.log.*` | 5D | the end screen: one headline per winners row id, the seat rows, the Pantry, piles, the timeline lines per act |
| `onub.refuse.act` | 5D | a 422 on a night act |
| `lobby.mode.onub`, `lobby.mode.onub.hint` | `ui/copy/lobby.ts`; 5C pastes the lobby-chip and 14.13 ids there (bug #126) | the chip keeps reading `targetLengthMin` (8-10 after section 13); the parody title appears only here |

5A, 5B and 5E write no client copy (a refusal's `msg` is a server log string; the client maps the code).

## 9. Round-4 code: the compile cut and what each session deletes (landed in 265bda9)

The pre-seed column below landed in 265bda9 for every row but `docs/GDD.md`, whose 3.11 the orchestrator's round-5
docs replaced (the 3.12 sentences with it; now `docs/GDD.md` 3.11 and 3.12); sessions do not redo any of
it and do only the session column. Replacing the two data files and the shared contract broke every round-4 reader of the removed fields, so the
pre-seed commit itself cut that code to compiling stubs (left column); each session then deletes or rewrites the
rest in its own paths (right column). The bakery scene (`scenes/bakery.json`, `bk.*` ids) stays frozen and unused.

| Path | Pre-seed (orchestrator, same commit as the data) | Session |
|---|---|---|
| `apps/server/src/sim/Onub.ts` | replaced by the hooks of 4.3 with stub bodies; plates, reach, `bakeryActor`, `setPlate`, `nightAct`, `commitAct`, `legalPlans`, `planNpcAct`, `onubNpcPlan`, `seededDeadPick`, `finalRoleOf`, `plateOf` and the `PLATE_PREFIX`/`DEAD_PREFIX`/`LEDGER_ID` constants are gone | 5A fills it; `dealWithFixed` drops unknown ids; the Poisoner mates on the card are gone for good |
| `apps/server/src/sim/Conductor.ts` | the skeleton of 4.3 (`runConductor` a no-op, `onubClock` refusing) | 5B: the window machine without `enterScene` and without loft moves (every seat is already in the loft), wake views, timeouts, dawn |
| `apps/server/src/sim/Meeting.ts` | quick branches compile against v2 (no `traces`, `handleClaim` refusing, `startOnubReveal` straight to `endOnubMatch`) | 5B rewrites the quick branches |
| `apps/server/src/sim/Win.ts` | `endOnubMatch` stub; `resetToLobby` lines of 4.3 | 5B |
| `apps/server/src/sim/npc/onub.ts` | `runOnubNpc` = `stand(p)` | 5E rewrites it (no walking: prep, acts, claims, votes) |
| `apps/server/src/sim/npc/meeting.ts` | untouched (the `quick` branch is no longer called) | 5H deletes the `quick` parameter and branch |
| `apps/server/src/sim/{Npc.ts,npc/memory.ts}`, `rooms/handlers/lobby.ts`, `services/MatchLog.ts` | the routing, field and call-site edits of 4.3 | none |
| `apps/server/test/onub{Deal,Meeting,Night,Npc,Rules}.test.ts`, `apps/server/test/onubHelpers.ts`, `packages/shared/test/onub.test.ts` | deleted | 5A, 5B, 5E write the v2 suites of section 1 |
| `packages/shared/scripts/protocol-doc.ts`, `docs/PROTOCOL.md` | the payload-type list names the v2 types; the doc regenerated (both in the shared diff) | none |
| `packages/content/test/{onub,validate}.test.ts` | replaced and edited as appendix A says (in the content diff) | none |
| `apps/client/src/view/quickMode.ts` and its test | deleted | none |
| `apps/client/src/scenes/World.ts` | the quick branch deleted (`quick`, the plate and act holds, `updateQuickTarget`, `showReveals`, the quick dusk toast, the `balance.onub.json` import) | none (World is 5I's) |
| `apps/client/src/view/{PropView,PlayerView,EntityView,Hud}.ts` | the bakery props path, the Poisoner red glow (`mates`), the `night-wake` banner and the `night-reveal` log deleted | none |
| `apps/client/src/net/{world,worldColyseus}.ts`, `net/mock/worldMock.ts` and its test | `props()`, `mates()`, `nightReveal()`, `wake()`, the `nightWake`/`nightReveal`/`nightSleep` events, `targetId2` and the mock's `?mode=onub` bakery deleted | none |
| `apps/client/src/net/worldRouter.ts` | the Loft, `nightWake` and `nightSleep` routes deleted; installs `onubRouter` | none |
| `apps/client/src/net/{meeting,meetingColyseus}.ts`, `net/mock/meetingMock.ts` and its test | `claims()`, `traces()`, `claim()`, `ClaimRow` and the mock's quick-mode dawn, tally and winners deleted | none |
| `apps/client/src/ui/{Meeting,GameOver,meetingText}.ts` and tests | the claim strip, traces, the quick reveal lines, the onub end-screen section and `claimLine`/`claimRoleIds`/`swapLogLine` deleted; the two mount hooks of 5.3 added | 5D builds the replacements in `ui/onub/**` |
| `apps/client/src/ui/copy/{world,meeting}.ts` | the `quick.*`, `loft.*`, `prompt.act.*`, `night.*`, `meeting.claim.*`, `meeting.traces.*`, `reveal.outs.*`, `over.onub.*`, `over.swap.*`, `over.debtor` lines deleted | none |
| `apps/client/src/scenes/Loft.ts`, `view/LoftView.ts` | unregistered from `main.ts` (they still compile) | 5D deletes both and the `.wdi-loft*`, `.wdi-bedroll*` and `.wdi-claims*` rules of `components.css` |
| `apps/client/e2e/onub.spec.ts` | deleted (it reads removed fields) | 5E writes the v2 spec |
| `apps/client/e2e/npc.spec.ts` | the quick-mode case is `test.skip` with a pointer to 5E | 5E rewrites the case |
| `apps/client/e2e/world.spec.ts` | the bakery and loft cases deleted | none |
| `tools/bots/quick.ts`, `tools/bots/test/{quick,quickBrain}.test.ts` | replaced by a stub module exporting nothing the main mode uses; the tests deleted | 5E writes the v2 planner and its tests |
| `tools/bots/walk.ts`, `soak.ts`, `live.ts` | the quick-mode plate, window and leak code deleted; `--mode onub` still starts a quick match | 5E: bots plan from `nightWake.view`, commit prep, claim and vote; the leak monitor checks that a sleeper never receives `nightWake`/`nightReveal` and nobody receives a presence (bugs.md: the own-presence false leak retires) |
| `tools/grid/test/reach.test.ts` | the bakery reach case deleted | none |
| `docs/GDD.md` | 3.11 replaced by the round-5 text; in 3.12 the two quick-mode sentences ("In quick mode (3.11) an NPC votes for a random living seat..." and "In quick mode (3.11) NPCs are sleepers with a bedroll...") become "In quick mode NPC seats follow 3.11 'NPC seats'." | the "(5A)", "(5B)", "(5E)" sentences of section 1 |
| `docs/UI.md` 14.12 | untouched | 5C replaces it; 5D adds 14.14 |

Round-4 bugs this retires rather than fixes (the round-5 decisions, DECISIONS A49): the midpoint walk, the own-presence leak, the bot prop
race, the plate prompt, the bedroll glow, 422 versus 425 for loft sleepers; also the dead-loaf copy drift and the
`swaplog` headline bug, since those screens are rebuilt. Kept and fixed inside the rebuild: the deal stream
(4.1), the vanished count (4.3), the cross-mode `debug.deal` crash (4.3 and 5A), every accepted act answered with
`nightReveal` (2.3), the NPC vote spread (`npc.voteFrac`, 5E), the game-over headline from the row (5D), `loaf_crack`
played at the reveal (5D).

## 10. Seams

| Producer -> consumer | Contract | Until it lands |
|---|---|---|
| 5A -> 5B | `OnubState.dealt`, `.commits`, `.prep`, `.cards` filled; `Phase.prepReveal` set by `endPrep` with `prepRevealS` | 5B builds its states with `createOnubState` and `tableAtNight` in its own helpers |
| 5B -> 5A | `handleOnubAct` behind the pre-seeded dispatcher | refuses 425 |
| 5A, 5B -> 5E | `handleOnubAbility` for `onub.prep` and night acts, `onubWakeView`, `OnubState`, `Private.onubLoc`, `Private.nightReveal`, `meeting.claim`, `meeting.vote` with `"pantry"` | 5E's planners are pure and tested on fixtures; the wiring is exercised at integration |
| 5A, 5B -> 5C, 5D | the wire of sections 2 and 6 | each client session builds on its half of `MockOnubFeed` |
| 5A -> 5C | `onubDeckProblem` (pure, `@wdi/shared`) for the editor's `deck-problem` line and its five ids | a local stand-in with the same signature, deleted when 5A lands |
| 5C -> 5D | `renderPiles` (Rush board), `onub.board.*` copy | the pre-seeded plain list |
| 5D -> 5C | `ColyseusOnubFeed` covers prep too (`prep`, `myPrep`, `board`) | 5C runs on the mock; the real feed is checked at integration |
| 5C, 5D -> 5E | the hooks of section 7 | `onub.spec.ts` is opt-in (`WDI_E2E_ONUB=1`) and runs at integration |
| 5B -> 5D | `OnubBoard.window` (the narrator, public) through `OnubFeed.board().window` | the mock night half's `window()` returns '' |
| 5M -> 5C, 5D | the art keys of 5.4 plus `onub_mini`, each with `modes: ['onub']` | labelled greybox |
| 5F -> 5C, 5D, 5E | `RoleCard` shows `teamName`; Ready on the card is private in both modes (`flow.cardReady`, `markCardReady`, `sim/Covers.ts`); `Player.look` empty in quick mode | the pre-seed's one-line `teamName` fallback; the card and `readyOnRoleCard` write `player.ready` until 5F lands |

## 11. Balance note for the soak (5E) and the orchestrator

A Monte Carlo of prep alone (40 000 deals per party size, stations uniform, the round-5 data; the script, `ruin_sim.py`, stays with the
orchestrator) gives these ruin
rates (all matches / matches with a Team Mold card at the table):

| Players | NPC Normal (sabotage 0.6) | NPC Hard (0.8) | All-in humans (always sabotage, half of them at the Oven) |
|---|---|---|---|
| 4 | 0.06 / 0.07 | 0.09 / 0.10 | 0.25 / 0.29 |
| 5 | 0.05 / 0.05 | 0.08 / 0.09 | 0.23 / 0.26 |
| 6 | 0.09 / 0.09 | 0.15 / 0.15 | 0.44 / 0.44 |
| 7 | 0.13 / 0.13 | 0.22 / 0.22 | 0.64 / 0.64 |
| 8 | 0.10 / 0.10 | 0.18 / 0.18 | 0.61 / 0.61 |
| 9 | 0.08 / 0.08 | 0.14 / 0.14 | 0.57 / 0.57 |
| 10 | 0.06 / 0.06 | 0.11 / 0.11 | 0.53 / 0.53 |

The table is for `ruin.weight` 3 at every size. With it an all-in Team Mold wins at prep in about half the matches
from 6 seats up, because the Levain, the Rat and the Apprenti sabotage too, and after a ruin no Baker card can win.
A per-count threshold of 3, 3, 4, 5, 5, 5, 5 brings the all-in rate to 21-29% at every size (NPC Normal then 1-7%).
Ruling F6 adopts it: `ruin.weightByCount` `{4: 3, 5: 3, 6: 4, 7: 5, 8: 5, 9: 5, 10: 5}`, with `ruin.weight` 3 the
fallback (section 13), and a DECISIONS row records the departure from the owner's "3+" from 6 seats. The soak reports
the ruin rate per size against the 20-30% target.

## 12. Calls this contract made beyond the round-5 decisions (DECISIONS A49)

1. **The rules are two files**: `rules/onub.ts` (5A: slots, deal, deck check, prep, script) and `rules/onubNight.ts`
   (5B: acts, wake view, vote, winners), so neither session waits on the other's bodies.
2. **Slots name seats by deal index** (`seat.<i>.role`), with `OnubBoard.seats` public from the role card.
3. **The Rat sees the Location card it ends up with** (`onub.vent` reveals `ownAfter`), so it can claim a room the
   Aboyeur's later look will confirm.
4. **The Chef peeks one other player's card or exactly two Pantry cards**; the Inspecteur's look is a "may" act.
5. **Prep ends early when every seat has committed**; the Rush never ends early; CRUST ends when every seat in play
   has voted, but never before its `timers.crustCountdownS` (3 s) countdown has played (ruling F11); votes may be
   cast and changed in the Rush.
6. **Claims carry a station, a card and up to two sightings** (seat or Pantry, with a role or a station), checked
   only for existing ids; a claimed role must be in the deck.
7. **Sightings are learned rows**: `NightReveal.kind` is `role`, `loc` or `mate`, so the Spores, the Commis and the
   Levain keep what they saw in `Private.nightReveal`; `cabalMates` stays empty in quick mode.
8. **The end screen's timeline lists every accepted act** (`actLog`, peeks and the Cloche included, `auto` for a
   timeout pick) instead of swaps only.
9. **`Winner.debtor` becomes `Winner.croissant`** (same value 4); the headline is always the row's line.
10. **`RoleRevealPayload.teamName`** carries the fiction's team name to the role card; teams map onto the wire
    factions through `roles.onub.json` `teams`, so no team literal lives in code.
11. **Four new streams**, `nightTimeout`, `npcPlay`, `thaw` and `perk`, beside those the round-5 decisions list; `npcPlay` and
    `npcTiming` are keyed per NPC seat (ruling X2, `deck-wire.md` section 2).
12. **Mini-games get an assist**: a Done control after `timers.minigameAssistS` (20 s), for accessibility and so a
    spec can finish one.
13. **NPC numbers**: `commitS` 12-40 s, `actFrac` 0.25-0.75 of the window, `claimFrac` 0.05-0.4 of the Rush,
    `voteFrac` 0.3-0.9 of Rush plus CRUST, `smartVoteChance` 0.3 / 0.6 / 0.9 beside the reported `sabotageChance`.
14. **Every ONUB seat sits in the loft pseudo-scene from dusk to the lobby** (no presence for anyone), and
    `MeetingState.traces` is removed.
15. **Roles carry `copies`, `required` and `onOut`** in `roles.onub.json`, so the deck check and the Critique's drag
    read data, not role-id literals.

## 13. Pre-seed amendment (after review)

The rulings on the three design reviews (2026-10-17) changed five things the pre-seed had written: the prep streams
(X2), the public narrator (F5 with P13), the ruin threshold by party size (F6), the CRUST countdown (F11) and the
target length (F12). The amendment (`onub-amend.patch`, an exact diff against 265bda9: 11 files, 94 lines added and 20
removed) is additive: nothing is removed, and the two new members a reader must supply (`OnubBoardView.window`,
`MockOnubNightHalf.window`) come with stub values. It was checked on a git worktree of 265bda9 on 2026-10-17: `git
apply` clean; `pnpm --filter @wdi/shared typecheck` clean and `test` 61 passed; `pnpm --filter @wdi/content
typecheck` clean and `test` 80 passed (77 before); also `@wdi/server` and `@wdi/client` typecheck clean, the server
suite 146 passed and 2 skipped, the client suite 143 passed; eslint, prettier and `lint-data.mjs` clean;
`pnpm docs:protocol` left `docs/PROTOCOL.md` unchanged.

**Landed (2026-10-17).** The amendment was applied with the main-mode pre-seed (ruling X1): `git apply` clean on a
clean tree, touching exactly the 11 files of 13.1 to 13.3. With the stream pre-seed beside it (13.4), `@wdi/shared`
passed 67 tests (61 plus the 6 of the new `prng.test.ts`), `@wdi/content` 80 and the client 143, and `pnpm
docs:protocol` left `docs/PROTOCOL.md` unchanged. The server suite passed 151 with 2 skipped and one timing failure
in `npc.test.ts` ("1 human + 3 NPCs starts and deals the 4-row": the deal assertions passed, but the human's
`roleReveal` missed the helper's 150 ms wait on a slow run while other agents worked); that test passed twice and its
file 15 of 15 when re-run alone, and the later pre-seed steps ran the whole server suite clean (153 passed, 2
skipped). The locked-file rule of section 1 now covers the amended lines.

### 13.1 `@wdi/shared`

`packages/shared/src/schema/index.ts` (F5): `OnubBoard` gains `window`, the narrator; `OnubBoard` then has 8 fields.
5B's Conductor writes it (section 4.3), 5A's `resetOnubForLobby` clears it.

```ts
/**
 * The public quick-mode board (GDD 3.11). `seats` is the deal order (slot index `i` of `seat.<i>.*` is
 * `seats[i]`) and `deck` the cards in play, both from the role card on; `piles`, `ruinWeight`, `ruined` and
 * `perk` from `prepReveal`; `cloche` (a slot id) from dawn. `window` is the open night window's role id, the
 * narrator's call, '' during fades and outside the night: public, since every window of the deck runs whatever
 * was dealt. Cleared at the lobby reset; empty in the main mode.
 */
export const OnubBoard = schema(
  {
    seats: t.array('string'),
    deck: t.array('string'),
    piles: t.map(OnubPile),
    ruinWeight: u8(),
    ruined: bool(),
    perk: bool(),
    cloche: str(),
    window: str(),
  },
  'OnubBoard',
);
```

`packages/shared/src/rules/onub.ts` (X2, F6): `resolvePrep` reads `balance.onub.json` `ruin` as it is and draws the
public pile order, the secret thaw and the private perk from three streams. The body still throws until 5A fills it. 5A's `endPrep` calls it as the stub's
doc comment says: `resolvePrep(commits, seats, onubBalance.stations, onubBalance.cards, onubBalance.ruin,
onubBalance.pantry.locations, prepStreams(room))`, where `prepStreams(room)` (`sim/onub/Prep.ts`, implemented in the
pre-seed) returns `{ piles: seeds.get('piles'), thaw: seeds.get('thaw'), perk: seeds.get('perk') }` from
`room.seeds`. The pre-seed adds no call: no `resolvePrep` call site existed at 265bda9, the `endPrep` stub is a no-op,
and calling the throwing stub from it would break the tree. The full call was type-checked against the content types
in a scratch project outside the repo.

```ts
/** `balance.onub.json` `ruin`, as `resolvePrep` reads it. */
export interface OnubRuinRule {
  /** The ruin threshold for a party size `weightByCount` does not list. */
  weight: number;
  /** Party size (a `PLAYER_COUNTS` key) -> the ruin threshold at that size (GDD 3.11). */
  weightByCount?: Readonly<Record<string, number>> | undefined;
  /** What one good card takes off its station's net. */
  goodCancels: number;
}

/**
 * The streams `resolvePrep` draws from (`sim/seeds.ts`), one per kind of draw, so nothing secret shares a stream
 * with anything public: `piles` the public order of each pile, `thaw` which card a Thermostat Flip discards (never
 * shown before game over), `perk` the Pantry Location card the proofing visitors see (private to them).
 */
export interface OnubPrepStreams {
  piles: Rng;
  thaw: Rng;
  perk: Rng;
}

/**
 * Resolves every pile (GDD 3.11 "The crime scenes"), drawing in this order:
 * 1. per station in `stations` order: the pile is the card ids committed there, sorted by id, then `shuffle`d
 *    (`rngs.piles`), so its order says nothing about who committed which card or when;
 * 2. per station, for each `discardRandomOther` card in pile order that is still in the pile while another card
 *    is: one other card, uniform over the rest of the pile (`rngs.thaw`), moves to `lost`;
 * 3. per station: net = max(0, sabotage cards x `weight` - good cards x `rule.goodCancels`) over the cards left;
 *    `underMixed` when the station has `underMixBelow` and 0 < its visitors < `underMixBelow`;
 * 4. ruinWeight = the nets plus `underMixWeight` per flag; ruined when ruinWeight >=
 *    `rule.weightByCount[seats.length] ?? rule.weight`;
 * 5. for the first station with `perk`: when it had a visitor and no sabotage card was committed there, one
 *    Pantry Location position `k` uniform over `pantryLocs` (`rngs.perk`), and `perk.slot` is `pantry.loc.<k>`.
 * `seats` is every seat of the match (the party size is `seats.length`). Throws on a commit naming an unknown
 * station or card (the handler refused those).
 */
export function resolvePrep(
  commits: ReadonlyMap<string, OnubCommit>,
  seats: readonly string[],
  stations: readonly OnubStationLike[],
  cards: Readonly<Record<string, OnubCardLike | undefined>>,
  rule: OnubRuinRule,
  pantryLocs: number,
  rngs: OnubPrepStreams,
): PrepOutcome {
  void commits;
  void seats;
  void stations;
  void cards;
  void rule;
  void pantryLocs;
  void rngs;
  throw new Error('resolvePrep: not implemented (Session 5A)');
}
```

### 13.2 `@wdi/content`

`packages/content/data/balance.onub.json` (in the `lint-data.mjs` layout):

```json
  "targetLengthMin": { "min": 8, "max": 10, "gddRef": "3.11" },
```

```json
    "voteS": 20,
    "crustCountdownS": 3,
    "revealS": 30,
```

```json
  "ruin": {
    "weight": 3,
    "weightByCount": { "4": 3, "5": 3, "6": 4, "7": 5, "8": 5, "9": 5, "10": 5 },
    "goodCancels": 1,
    "gddRef": "3.11"
  },
```

`packages/content/src/schemas/onubBalance.ts`: in `timers`, after `voteS`,

```ts
    /** "Un, deux, trois, CRUST!": the opening countdown of the vote; CRUST never ends early before it has played. */
    crustCountdownS: Seconds,
```

and `ruin` becomes

```ts
  ruin: z.strictObject({
    /** The ruin threshold for a party size `weightByCount` does not list. */
    weight: Count,
    /** Party size -> the ruin threshold at that size (GDD 3.11); `resolvePrep` uses `weightByCount[n] ?? weight`. */
    weightByCount: z.record(z.string(), z.number().int().min(1)).optional(),
    goodCancels: z.number().int().nonnegative(),
    gddRef: GddRef,
  }),
```

`packages/content/src/validate.ts`, one `ranges` row in `checkOnub`:
`['timers.crustCountdownS (inside voteS)', { min: timers.crustCountdownS, max: timers.voteS }]`.

`packages/content/test/onub.test.ts`: the night helper moves to the top of the file, and three tests are new: "ruins
the dough at 3 points for 4-5 players, 4 at 6, 5 at 7-10", "keeps the whole match, before jitter, inside the lobby
chip at every count" (8.7 to 9.7 minutes inside 8-10) and "opens CRUST with a 3 s countdown inside its 20 s"
(appendix A shows the file in full).

### 13.3 The lines outside the two packages (landed with the amendment)

So the tree compiles and the narrator reaches the client:

| File | Edit |
|---|---|
| `apps/client/src/net/onub.ts` | `OnubBoardView` gains `/** The open night window's role id (the narrator's call, the same on every page); '' during fades. */ window: string;` after `cloche` |
| `apps/client/src/net/mock/onubMock.ts` | `MockOnubNightHalf` gains `/** The open window's role id (the narrator), '' during fades and outside the night. */ window(): string;`; `MockOnubFeed.board()` returns `{ ...this.prepHalf.board(), cloche: this.nightHalf.cloche(), window: this.nightHalf.window() }`; the prep half's `board()` comment names `cloche` and `window` |
| `apps/client/src/net/mock/onubPrepMock.ts` | the stub board gains `window: ''` |
| `apps/client/src/net/mock/onubNightMock.ts` | the stub gains `window: () => ''` (5D replaces the half) |
| `apps/server/src/sim/Onub.ts` | `resetOnubForLobby` gains `board.window = '';` |

### 13.4 What landed beside the amendment

- **Streams (X2).** `apps/server/src/sim/seeds.ts` and `packages/shared/src/rules/prng.ts` changed with the stream
  pre-seed of `deck-wire.md` section 2 (landed in the same step as the amendment):
  `sfc32` with four words per stream, `MatchSeeds.get(name, key?)`,
  `fixSeeds` in a test helper, and `StreamName` = `deal | traits | npcNames | script | piles | thaw | perk |
  prepTimeout | nightTimeout | npcTiming | npcPlay | mobs | nodes`. ONUB needs `thaw`, `perk` and the keyed
  `npcPlay:<seatId>` and `npcTiming:<seatId>` from it, and `prepStreams(room)` (`sim/onub/Prep.ts`) hands `piles`,
  `thaw` and `perk` to `resolvePrep`. `sfc32` discards its first 12 outputs after seeding, so the small words tests
  fix start well mixed.
- **DECISIONS rows**, recorded with the round-5 docs: F6 and F12 inside A50 (the round-5 contract row), and bug #21
  (ruling F16) as A51. The texts this contract proposed:
  - F6: "ONUB ruin threshold by party size (review ruling F6, 2026-10-17; owner of the call: the orchestrator).
    `ruin.weightByCount` is 3 at 4-5 players, 4 at 6 and 5 at 7-10, with `ruin.weight` 3 the fallback. This departs
    from the owner's '3+ ruins the dough' from 6 seats up: with 3, an all-in Team Mold ruins the dough at prep in
    44-64% of matches from 6 seats (contract section 11), and after a ruin no Baker card can win. The per-count
    threshold brings that to 21-29% at every size. Open: revisit with the soak's ruin rate per size and the first
    playtests."
  - F12: "ONUB target length 8-10 minutes (review ruling F12, 2026-10-17). `targetLengthMin` becomes {8, 10} (was
    9-12): the match runs 8.7 to 9.7 minutes plus jitter, and less when prep or CRUST ends early. The owner's
    5-minute Morning Rush (`timers.rushS` 300) is unchanged and stays the knob."
- **Docs.** GDD 3.11 is `docs/GDD.md` 3.11 (section 9). The narrator copy (`onub.narrator.*`), the `narrator`
  hook and the CRUST countdown lines are 5D's in `docs/UI.md` 14.14.

---

## Appendix A. ONUB v2 content schemas (pre-seed, packages/content)

**Landed in the pre-seed commit 265bda9** (`content.patch`, applied): sessions do not redo it. The review rulings F6,
F11 and F12 added three data rows, two zod fields, one cross-file check and three tests on top, which landed with the
amendment of section 13; they are shown in place below and listed in A.5, "Amendment after review".

Full replacement text for `packages/content/src/schemas/onubRoles.ts` and `packages/content/src/schemas/onubBalance.ts`,
the quick-mode block of `packages/content/src/validate.ts`, and the content tests that read the quick-mode data. With
them, `roles.onub.json` and `balance.onub.json` (in `packages/content/data/`, in the canonical layout of
`packages/content/scripts/lint-data.mjs`) parse, pass `assertValid`, and the whole `@wdi/content` suite passes (77
tests at 265bda9, 80 with the amendment, with `tsc --noEmit`, eslint and prettier clean).

`content.patch` (kept by the orchestrator) was the same change as a unified diff against `a0850ba` (`git apply --check`
passed):
the two schema files, `validate.ts`, `test/validate.test.ts`, `test/onub.test.ts` and the two data files.

`packages/content/src/index.ts` needs no change: it still imports `OnubRolesFile`, `OnubBalanceFile` and the
`OnubCountRow` type under the same names, and `onubFor(n)` still returns the `byCount` row (now `{deck, gddRef}`).
Every export of the two schema files is prefixed `Onub`, so `export *` from `index.ts` collides with nothing
(`WinnerRow` is now `OnubWinnerRow`; `OnubAct`, `OnubWindow` and `OnubCountRow` keep their names with new shapes).

What the shapes drop from round 4, for the compile cut in section 9: `roles.onub.json` `standIn` and
each role's `faction` and `winsWith` (replaced by `team`, mapped to a faction through `teams`); `balance.onub.json`
`deadLoaves`, `actRangeTiles`, `byCount[n].loaves`, `.planned` and `.discussionS` (the Rush is `timers.rushS` at
every count), `timers.duskS` and `.plateHoldS`, each act's `target`, `holdS` and `swap`, each window's `acts[]
{act, picks}` objects, `trace` and `traceText`, `vote.gamekeeperHops` (now `vote.critiqueHops`) and the round-4
winners flags. Fields kept with the same name and meaning: `cardLine`, each role's `name`, `nightAct`, `cardText`,
`wakes`, `ships`; `targetLengthMin`, `byCount[n].deck`, `timers.roleCardS`, `fadeS`, `windowJitterMaxS`, `dawnS`,
`voteS`, `revealS`, `sleeperPulseMinS`, `sleeperPulseMaxS`; `vote.skipAllowed`, `selfVoteAllowed`,
`endsWhenAllVoted`, `minVotesToTurnOut`, `tiesTurnOutAll`; `windows[].order`, `role`, `seconds`, `seeEachOther`,
`onlyIfAlone`, `onTimeout`.

### A.1 `packages/content/src/schemas/onubRoles.ts`

```ts
import { z } from 'zod';
import { Faction, GddRef, Id, Ships } from './common.js';

// ONUB v2 roles (GDD 3.11): the fifteen Role cards, the three teams and the ten night scenes.

/** Quick-mode act ids sent as `act.ability` (ARCHITECTURE 5.14), e.g. `onub.rob`. */
export const OnubActId = z.string().regex(/^onub\.[a-z][A-Za-z]*$/);

/** The three sides of a match. */
export const OnubTeamId = z.enum(['baker', 'mold', 'croissant']);
export type OnubTeamId = z.infer<typeof OnubTeamId>;

export const OnubTeam = z.strictObject({
  id: OnubTeamId,
  /** Shown on the role card in place of the faction (`RoleRevealPayload.teamName`). */
  name: z.string().min(1),
  /** The wire's `TeamId` for a card of this team (`RoleRevealPayload.team`, `Private.role.team`). */
  faction: Faction,
  goal: z.string().min(1),
});
export type OnubTeam = z.infer<typeof OnubTeam>;

/** A night role scene: the owner's art `onub_scene_<id>` and its caption. */
export const OnubScene = z.strictObject({ id: Id, name: z.string().min(1) });
export type OnubScene = z.infer<typeof OnubScene>;

export const OnubRole = z.strictObject({
  id: Id,
  /** The French card name with its article ("Le Chef de Cuisine"). */
  name: z.string().min(1),
  /** The English gloss printed under the name ("Executive Chef"). */
  gloss: z.string().min(1),
  team: OnubTeamId,
  /** A Mold Spore for the winners table (Le Champignon only). */
  spore: z.boolean(),
  /** The hand at prep holds the station's sabotage cards too (every Team Mold card). */
  sabotages: z.boolean(),
  /** Has a night window in `balance.onub.json` `windows`. */
  wakes: z.boolean(),
  /** Key of `scenes`: the room the role wakes in and the art on its card. */
  scene: Id,
  /** Allowed non-zero copy counts in a deck: [1, 2] for the Spore, [2] for the Commis, [1] for the rest. */
  copies: z.array(z.number().int().positive()).min(1),
  /** Every deck holds at least one copy. */
  required: z.boolean(),
  /** `dragVote`: when this final card goes in the oven, the seat it voted for goes in too (the Critique). */
  onOut: z.enum(['none', 'dragVote']),
  ships: Ships,
  /** The night act line of the role card (its goal row). */
  nightAct: z.string().min(1),
  cardText: z.string().min(1),
  gddRef: GddRef,
});
export type OnubRole = z.infer<typeof OnubRole>;

export const OnubRolesFile = z.strictObject({
  gddRef: GddRef,
  /** Printed on every quick-mode role card (`RoleRevealPayload.beware`). */
  cardLine: z.string().min(1),
  teams: z.strictObject({ baker: OnubTeam, mold: OnubTeam, croissant: OnubTeam }),
  scenes: z.record(Id, OnubScene),
  roles: z.record(Id, OnubRole),
});
export type OnubRolesFile = z.infer<typeof OnubRolesFile>;
```

### A.2 `packages/content/src/schemas/onubBalance.ts`

```ts
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
```

### A.3 `packages/content/src/validate.ts`

Replace the block that starts at `// Quick mode: decks, windows and acts.` and ends before `return errors;` in
`validateContent` with:

```ts
  // Quick mode (ONUB v2, GDD 3.11): roles, stations and cards, decks, windows and acts.
  checkOnub(onubRoles, onubBalance, err);
```

and add this function after `assertValid` (the type imports of `OnubBalanceFile` and `OnubRolesFile` at the top of the
file already exist; `sameMultiset` stays, the roster checks still use it):

```ts
/** The ONUB v2 cross-file rules: every id a record names exists, decks obey `copies`, windows and acts chain. */
function checkOnub(onubRoles: OnubRolesFile, onubBalance: OnubBalanceFile, err: (msg: string) => void): void {
  const { roles, scenes, teams } = onubRoles;
  const { stations, cards, acts, windows } = onubBalance;
  for (const [key, team] of Object.entries(teams)) {
    if (key !== team.id) err(`roles.onub.json teams: key "${key}" holds team "${team.id}"`);
  }
  for (const [key, scene] of Object.entries(scenes)) {
    if (key !== scene.id) err(`roles.onub.json scenes: key "${key}" holds scene "${scene.id}"`);
  }
  for (const [key, card] of Object.entries(cards)) {
    if (key !== card.id) err(`balance.onub.json cards: key "${key}" holds card "${card.id}"`);
  }

  // Roles.
  const windowRoles = windows.map((w) => w.role);
  for (const role of Object.values(roles)) {
    if (!(role.scene in scenes)) err(`onub role ${role.id}: unknown scene ${role.scene}`);
    if (role.spore && role.team !== 'mold') err(`onub role ${role.id}: a Spore is Team Mold`);
    if (role.sabotages !== (role.team === 'mold')) err(`onub role ${role.id}: sabotages iff Team Mold`);
    if (new Set(role.copies).size !== role.copies.length) err(`onub role ${role.id}: copies repeat`);
    if (role.wakes !== windowRoles.includes(role.id)) {
      err(`onub role ${role.id}: wakes=${role.wakes} but ${role.wakes ? 'has no' : 'has a'} window`);
    }
  }
  if (!Object.values(roles).some((r) => r.spore && r.required)) err('roles.onub.json: no required Spore');

  // Stations and their ingredient cards: each card in exactly one hand, of its own station and kind.
  const stationIds = stations.map((s) => s.id);
  if (new Set(stationIds).size !== stationIds.length) err('balance.onub.json: a station id repeats');
  const listed = new Map<string, number>();
  for (const s of stations) {
    if ((s.underMixBelow === undefined) !== (s.underMixWeight === undefined)) {
      err(`onub station ${s.id}: underMixBelow and underMixWeight go together`);
    }
    for (const [kind, ids] of [
      ['good', s.good],
      ['sabotage', s.sabotage],
    ] as const) {
      for (const id of ids) {
        listed.set(id, (listed.get(id) ?? 0) + 1);
        const card = cards[id];
        if (!card) err(`onub station ${s.id}: unknown card ${id}`);
        else if (card.station !== s.id || card.kind !== kind)
          err(`onub card ${id}: listed as ${s.id} ${kind}`);
      }
    }
  }
  for (const card of Object.values(cards)) {
    if (!stationIds.includes(card.station)) err(`onub card ${card.id}: unknown station ${card.station}`);
    if (listed.get(card.id) !== 1)
      err(`onub card ${card.id}: in ${listed.get(card.id) ?? 0} hands, expected 1`);
  }

  // Default decks: player count + Pantry roles, each role within its copies, every required role present.
  for (const n of PLAYER_COUNTS) {
    const deck = onubBalance.byCount[n].deck;
    const size = Number(n) + onubBalance.pantry.roles;
    if (deck.length !== size) err(`onub ${n}: deck has ${deck.length} cards, expected ${size}`);
    const counts = new Map<string, number>();
    for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, count] of counts) {
      const role = roles[id];
      if (!role) err(`onub ${n}: unknown role ${id}`);
      else if (role.ships !== 'V1') err(`onub ${n}: ${id} does not ship in V1`);
      else if (!role.copies.includes(count))
        err(`onub ${n}: ${count} x ${id}, allowed ${role.copies.join(' or ')}`);
    }
    for (const role of Object.values(roles)) {
      if (role.required && !counts.has(role.id)) err(`onub ${n}: deck lacks ${role.id}`);
    }
  }

  // Windows and acts: one window per waking role in order; every act is reached by a window or a `then`.
  if (new Set(windowRoles).size !== windowRoles.length) err('onub: a role has two night windows');
  const reached = new Set<string>();
  windows.forEach((w, i) => {
    if (w.order !== i + 1) err(`onub window ${w.role}: order ${w.order}, expected ${i + 1}`);
    if (!roles[w.role]) err(`onub window: unknown role ${w.role}`);
    for (const id of w.sees) if (!roles[id]) err(`onub window ${w.role}: sees unknown role ${id}`);
    if (w.onlyIfAlone && !w.seeEachOther) err(`onub window ${w.role}: onlyIfAlone needs seeEachOther`);
    if (w.onTimeout === 'seededPick' && w.acts.length !== 1)
      err(`onub window ${w.role}: a must-act has one act`);
    for (const id of w.acts) {
      const act = acts[id];
      if (!act) err(`onub window ${w.role}: unknown act ${id}`);
      else if (act.effect === 'swapWithPeeked') err(`onub window ${w.role}: ${id} is only a second step`);
      reached.add(id);
    }
  });
  for (const act of Object.values(acts)) {
    if (act.then === undefined) continue;
    const next = acts[act.then];
    if (!next) err(`onub act ${act.id}: unknown then ${act.then}`);
    else if (next.effect !== 'swapWithPeeked' || act.effect !== 'peek')
      err(`onub act ${act.id}: then needs peek -> swapWithPeeked`);
    reached.add(act.then);
  }
  for (const id of Object.keys(acts)) if (!reached.has(id)) err(`onub act ${id}: no window or step uses it`);

  // Ranges and the winners table.
  const winnerIds = onubBalance.winners.map((w) => w.id);
  if (new Set(winnerIds).size !== winnerIds.length) err('balance.onub.json: a winners row id repeats');
  const { npc, timers, targetLengthMin } = onubBalance;
  const ranges: [string, { min: number; max: number }][] = [
    ['npc.commitS', npc.commitS],
    ['npc.actFrac', npc.actFrac],
    ['npc.claimFrac', npc.claimFrac],
    ['npc.voteFrac', npc.voteFrac],
    ['timers.sleeperPulse', { min: timers.sleeperPulseMinS, max: timers.sleeperPulseMaxS }],
    ['timers.crustCountdownS (inside voteS)', { min: timers.crustCountdownS, max: timers.voteS }],
    ['targetLengthMin', targetLengthMin],
  ];
  for (const [name, r] of ranges) if (r.min > r.max) err(`balance.onub.json ${name}: min > max`);
}
```

### A.4 `packages/content/test`

`test/onub.test.ts` is replaced wholesale (the GDD 3.11 tables held against the data):

```ts
import { describe, expect, it } from 'vitest';
import { onubBalance, onubFor, onubRoles, PLAYER_COUNTS } from '../src/index.js';

// ONUB v2 (GDD 3.11): the tables of the GDD, held against roles.onub.json and balance.onub.json.

const counts = PLAYER_COUNTS.map(Number);

/** The night of the default deck for `n` players, in seconds: its windows plus a fade each, before jitter. */
function night(n: number): number {
  const deck = new Set(onubFor(n).deck);
  const ws = onubBalance.windows.filter((w) => deck.has(w.role));
  return ws.reduce((s, w) => s + w.seconds + onubBalance.timers.fadeS, 0);
}

/** The cards deck(n) holds beyond deck(n - 1). */
function added(n: number): string[] {
  const prev = [...onubFor(n - 1).deck];
  return onubFor(n).deck.filter((r) => {
    const i = prev.indexOf(r);
    if (i < 0) return true;
    prev.splice(i, 1);
    return false;
  });
}

describe('ONUB v2 decks (GDD 3.11)', () => {
  it('holds the player count plus the Pantry roles at every count', () => {
    for (const n of counts) expect(onubFor(n).deck, `${n}`).toHaveLength(n + onubBalance.pantry.roles);
  });

  it('follows the deck table', () => {
    expect([...onubFor(4).deck].sort()).toEqual(
      ['champignon', 'champignon', 'chef', 'aboyeur', 'sousChef', 'plongeur', 'inspecteur'].sort(),
    );
    expect(added(5)).toEqual(['croissant']);
    expect(added(6)).toEqual(['levain']);
    expect(added(7)).toEqual(['ratDeCave']);
    expect(added(8)).toEqual(['gardeManger']);
    expect(added(9)).toEqual(['boulanger']);
    expect(added(10)).toEqual(['tourrier']);
  });

  it('leaves the Apprenti, the Commis and the Critique to the deck editor', () => {
    for (const n of counts) {
      for (const id of ['apprenti', 'commis', 'critique']) expect(onubFor(n).deck).not.toContain(id);
    }
    for (const id of ['apprenti', 'commis', 'critique']) expect(onubRoles.roles[id]?.ships).toBe('V1');
  });
});

describe('ONUB v2 roles (GDD 3.11)', () => {
  it('has the fifteen roles', () => {
    expect(Object.keys(onubRoles.roles).sort()).toEqual(
      [
        'boulanger',
        'champignon',
        'levain',
        'apprenti',
        'ratDeCave',
        'commis',
        'chef',
        'aboyeur',
        'sousChef',
        'tourrier',
        'plongeur',
        'gardeManger',
        'inspecteur',
        'croissant',
        'critique',
      ].sort(),
    );
  });

  it('makes Le Champignon the only Spore and every Team Mold card a saboteur', () => {
    const roles = Object.values(onubRoles.roles);
    expect(roles.filter((r) => r.spore).map((r) => r.id)).toEqual(['champignon']);
    expect(
      roles
        .filter((r) => r.team === 'mold')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['apprenti', 'champignon', 'levain', 'ratDeCave'].sort());
    for (const r of roles) expect(r.sabotages, r.id).toBe(r.team === 'mold');
    expect(roles.filter((r) => r.team === 'croissant').map((r) => r.id)).toEqual(['croissant']);
    expect(roles.filter((r) => r.onOut === 'dragVote').map((r) => r.id)).toEqual(['critique']);
  });

  it('allows one or two Spores, two Commis or none, one of every other role', () => {
    for (const r of Object.values(onubRoles.roles)) {
      const expected = r.id === 'champignon' ? [1, 2] : r.id === 'commis' ? [2] : [1];
      expect(r.copies, r.id).toEqual(expected);
      expect(r.required, r.id).toBe(r.id === 'champignon');
    }
  });

  it('maps the teams onto the wire factions', () => {
    expect(onubRoles.teams.baker.faction).toBe('village');
    expect(onubRoles.teams.mold.faction).toBe('cabal');
    expect(onubRoles.teams.croissant.faction).toBe('neutral');
  });
});

describe('ONUB v2 stations and cards (GDD 3.11)', () => {
  it('has four stations in overview order, eight good and ten sabotage cards', () => {
    expect(onubBalance.stations.map((s) => s.id)).toEqual(['fridge', 'mixer', 'proofing', 'oven']);
    const cards = Object.values(onubBalance.cards);
    expect(cards.filter((c) => c.kind === 'good')).toHaveLength(8);
    expect(cards.filter((c) => c.kind === 'sabotage')).toHaveLength(10);
  });

  it('weighs the Oven double, flags a lone Mixer card and gives the Proofing Drawer its perk', () => {
    const at = (id: string) => onubBalance.stations.find((s) => s.id === id)!;
    expect(at('oven').weight).toBe(2);
    for (const id of ['fridge', 'mixer', 'proofing']) expect(at(id).weight).toBe(1);
    expect(at('mixer').underMixBelow).toBe(2);
    expect(at('mixer').underMixWeight).toBe(1);
    expect(at('proofing').perk).toBe('peekPantryLoc');
    expect(onubBalance.ruin).toMatchObject({ weight: 3, goodCancels: 1 });
  });

  it('ruins the dough at 3 points for 4-5 players, 4 at 6, 5 at 7-10', () => {
    expect(counts.map((n) => onubBalance.ruin.weightByCount?.[String(n)] ?? onubBalance.ruin.weight)).toEqual(
      [3, 3, 4, 5, 5, 5, 5],
    );
  });

  it('gives only the Thermostat Flip an effect', () => {
    const effects = Object.values(onubBalance.cards).filter((c) => c.effect !== 'none');
    expect(effects.map((c) => [c.id, c.station, c.effect])).toEqual([
      ['thermostat', 'fridge', 'discardRandomOther'],
    ]);
  });
});

describe('ONUB v2 night (GDD 3.11)', () => {
  it('wakes in the GDD order for the GDD seconds', () => {
    expect(onubBalance.windows.map((w) => [w.role, w.seconds])).toEqual([
      ['boulanger', 10],
      ['champignon', 12],
      ['levain', 8],
      ['apprenti', 10],
      ['ratDeCave', 10],
      ['commis', 8],
      ['chef', 12],
      ['aboyeur', 12],
      ['sousChef', 10],
      ['tourrier', 14],
      ['plongeur', 12],
      ['gardeManger', 8],
      ['inspecteur', 8],
    ]);
  });

  it('makes only the Tourrier and the Garde Manger act by seed on timeout', () => {
    const must = onubBalance.windows.filter((w) => w.onTimeout === 'seededPick').map((w) => w.role);
    expect(must).toEqual(['tourrier', 'gardeManger']);
  });

  it('runs the night lengths of GDD 3.11 with the default decks', () => {
    expect(counts.map(night)).toEqual([78, 78, 88, 100, 110, 122, 138]);
  });

  it('keeps the whole match, before jitter, inside the lobby chip at every count', () => {
    const t = onubBalance.timers;
    const minutes = (n: number) =>
      (t.roleCardS + t.prepS + t.prepRevealS + night(n) + t.dawnS + t.rushS + t.voteS + t.revealS) / 60;
    expect(onubBalance.targetLengthMin).toMatchObject({ min: 8, max: 10 });
    for (const n of counts) {
      expect(minutes(n), `${n}`).toBeGreaterThanOrEqual(onubBalance.targetLengthMin.min);
      expect(minutes(n), `${n}`).toBeLessThanOrEqual(onubBalance.targetLengthMin.max);
    }
  });
});

describe('ONUB v2 vote and winners (GDD 3.11)', () => {
  it('has no Skip, no self-vote and a Pantry target', () => {
    expect(onubBalance.vote).toMatchObject({
      skipAllowed: false,
      selfVoteAllowed: false,
      pantryTarget: true,
      minVotesToTurnOut: 2,
      tiesTurnOutAll: true,
      critiqueHops: 1,
    });
  });

  it('opens CRUST with a 3 s countdown inside its 20 s', () => {
    expect(onubBalance.timers.voteS).toBe(20);
    expect(onubBalance.timers.crustCountdownS).toBe(3);
  });

  it('ends with rows that catch every dawn', () => {
    const rows = onubBalance.winners;
    expect(rows.map((r) => r.id)).toEqual([
      'croissantAndBakers',
      'croissant',
      'ruined',
      'sporeOut',
      'sporesHide',
      'cleanTable',
      'moldOut',
      'wrongOven',
    ]);
    expect(rows.at(-3)?.when).toEqual({ anyoneOut: false });
    expect(rows.at(-1)?.when).toEqual({ anyoneOut: true });
  });
});
```

`test/validate.test.ts`, two cases change their expectations: "a quick-mode deck that is not N + 3" now expects
`'onub 5: deck has 7 cards, expected 8'`, and "a waking quick-mode role without a window" filters out the
`inspecteur` window and expects `'onub role inspecteur: wakes=true but has no window'`. `test/content.test.ts` passes
unchanged (every role keeps a `gddRef`, and no body, overlay, trait or scene object id contains an ONUB role id).

### A.5 Amendment after review (landed)

The content half of section 13. Every line is shown in place above; this is the list.

| Ruling | `balance.onub.json` | `onubBalance.ts` | `validate.ts` | `test/onub.test.ts` |
|---|---|---|---|---|
| F6 | `ruin.weightByCount` `{"4": 3, "5": 3, "6": 4, "7": 5, "8": 5, "9": 5, "10": 5}` beside `ruin.weight` 3 (the fallback) | `weightByCount: z.record(z.string(), z.number().int().min(1)).optional()` in `ruin` | none | "ruins the dough at 3 points for 4-5 players, 4 at 6, 5 at 7-10" |
| F11 | `timers.crustCountdownS` 3 | `crustCountdownS: Seconds` in `timers` | the countdown fits inside `voteS` (a `ranges` row) | "opens CRUST with a 3 s countdown inside its 20 s" |
| F12 | `targetLengthMin` `{min: 8, max: 10}` (was 9-12) | none | none | "keeps the whole match, before jitter, inside the lobby chip at every count" (8.7 to 9.7 min); the night helper moves to the top of the file |

With the amendment the `@wdi/content` suite runs 80 tests (77 at 265bda9); `tsc`, eslint, prettier and
`lint-data.mjs` are clean (checked on a worktree of 265bda9 on 2026-10-17). `index.ts` still needs no change. After the whole round-5
pre-seed (the deck, routine, world and style suites with it) the `@wdi/content` suite runs 134 tests.
