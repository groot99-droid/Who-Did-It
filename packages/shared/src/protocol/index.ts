// Message names, payloads and error codes of docs/ARCHITECTURE.md 5.5.

export const C2S = {
  move: 'input.move',
  interact: 'act.interact',
  ability: 'act.ability',
  hold: 'act.hold',
  hide: 'act.hide',
  check: 'act.check',
  burst: 'act.burst',
  enterPortal: 'act.enterPortal',
  reportBody: 'act.reportBody',
  bell: 'act.bell',
  present: 'act.present',
  /** Round 6 (M5b, GDD 3.15): light or put out the carried light; `sim/mobs/light.ts` (6G) handles it. */
  light: 'act.light',
  vote: 'meeting.vote',
  say: 'chat.say',
  quick: 'chat.quick',
  ping: 'world.ping',
  roleReady: 'role.ready',
  netPing: 'net.ping',
  lobbyStart: 'lobby.start',
  lobbyReady: 'lobby.ready',
  lobbySettings: 'lobby.settings',
  lobbyAddNpc: 'lobby.addNpc',
  lobbyRemoveNpc: 'lobby.removeNpc',
  claim: 'meeting.claim',
  /** Main mode, role card, a cover role: the look it will walk as (GDD 3.17). */
  coverPick: 'role.cover',
  /** Round 6 (M5b, GDD 3.16): accept a quest from the giver in reach; Session 6H reads it. */
  questAccept: 'quest.accept',
  /** Round 6 (M5b, GDD 3.16): turn a quest in at its giver; Session 6H reads it. */
  questTurnIn: 'quest.turnIn',
  /** Round 6 (M5b, GDD 3.16): the answer to a `minigameStart`; Session 6H reads it. */
  minigameResult: 'minigame.result',
} as const;

export const S2C = {
  roleReveal: 'roleReveal',
  sceneEnter: 'sceneEnter',
  clueFound: 'clueFound',
  killed: 'killed',
  chatMsg: 'chat.msg',
  phaseChange: 'phaseChange',
  meetingStart: 'meetingStart',
  voteResult: 'voteResult',
  gameOver: 'gameOver',
  noise: 'noise',
  error: 'error',
  nightWake: 'nightWake',
  nightReveal: 'nightReveal',
  nightSleep: 'nightSleep',
  vfx: 'vfx',
  aim: 'aim',
  shot: 'shot',
  inherit: 'inherit',
  /** Round 6 (M5c, GDD 3.18): play a cutscene; sent by Session 6J, nothing sends it before. */
  cutscene: 'cutscene',
  /** Round 6 (M5b, GDD 3.16): a station task's mini-game; sent by Session 6H, nothing sends it before. */
  minigameStart: 'minigameStart',
} as const;

export type C2SType = (typeof C2S)[keyof typeof C2S];
export type S2CType = (typeof S2C)[keyof typeof S2C];

/** `gather` and `craft` are round 6 (M5b, GDD 3.14); the server refuses them until Session 6F lands. */
export type HoldAction = 'drag' | 'collect' | 'task' | 'inspect' | 'autopsy' | 'gather' | 'craft';
/** The main-mode mini-game kinds (GDD 3.16): the four of ONUB v2's Evening Prep, reused at task stations. */
export type MinigameKind = 'crates' | 'pour' | 'slide' | 'stoke';
/**
 * Why a meeting opened (GDD 3.3); `missing` is the roll-call of M4; `dawn` is the quick-mode meeting (3.11);
 * `final` is the forced meeting after the Final Night hunt.
 */
export type MeetingReason = 'body' | 'bell' | 'missing' | 'dawn' | 'final';
/**
 * How a player died; `vanished` is the disconnect death of GDD 3.8 (M7); `poison` is Nightshade, `shot` the
 * Gamekeeper's Last Shot (GDD 3.2); `wolf` is a mob kill in the dark (GDD 3.15, round 6, Session 6G).
 */
export type DeathCause = 'knife' | 'ejected' | 'vanished' | 'poison' | 'shot' | 'wolf';
/** Chat channels the server derives (GDD 3.5); the client never chooses one. */
export type ChatChannel = 'meeting' | 'ghost' | 'cabal' | 'system';

/** Colyseus room name registered by the server (ARCHITECTURE 5.3). */
export const ROOM_NAME = 'party';

/** Faction ids as `roles.json` `factions` names them. */
export type TeamId = 'village' | 'cabal' | 'neutral';
/** Trait value ids exactly as `traits.json` defines them, in schema index order (GDD 3.1). */
export type HeightId = 'short' | 'mid' | 'tall';
export type ScarfId = 'red' | 'green' | 'blue';
export type HatId = 'cap' | 'bowler' | 'bare';
export const TRAIT_IDS = {
  height: ['short', 'mid', 'tall'],
  scarf: ['red', 'green', 'blue'],
  hat: ['cap', 'bowler', 'bare'],
} as const satisfies Record<string, readonly string[]>;

export interface TraitIds {
  height: HeightId;
  scarf: ScarfId;
  hat: HatId;
}

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

/** Card keys for the ability rows in card order. A UI binding, not a rules number. */
export const ABILITY_KEYS = ['Q', 'R', 'F'] as const;

export interface RoleRevealAbility {
  /** Ability id from `abilities.json`. */
  id: string;
  name: string;
  key: string;
  /** Seconds; 0 when the ability has no cooldown. For Kill it is the cooldown of this party size. */
  cooldown: number;
  /** Uses per match, or null when unlimited. */
  uses: number | null;
}

export interface RoleRevealItem {
  /** Item id from `items.json`. */
  defId: string;
  name: string;
  qty: number;
  tooltip: string;
}

export interface RoleRevealTeammate {
  id: string;
  name: string;
}

/** Private: delivered only to its owner (ARCHITECTURE 5.4). `teammates` is empty outside the Cabal. */
export interface RoleRevealPayload {
  roleId: string;
  team: TeamId;
  goal: string;
  abilities: RoleRevealAbility[];
  inventory: RoleRevealItem[];
  cardText: string;
  beware: string;
  teammates: RoleRevealTeammate[];
  traits: TraitIds;
  /** Quick mode: the card's team name (`roles.onub.json` `teams[team].name`), shown in place of the faction. */
  teamName?: string;
  /** Main mode only. The match's deck, card role ids in deck order; identical for every seat (GDD 3.1). */
  deck?: string[];
  /** Main mode only. The look this seat walks as: its card's, or a cover role's first hint (GDD 3.17). */
  look?: string;
  /**
   * Main mode only. Manifest key of this seat's card portrait (`portrait_<card's look>`; a cover role's own card
   * art).
   */
  portrait?: string;
  /**
   * Main mode only, cover roles only: the hints, undealt card role ids, first hint first (GDD 3.17, `coverHints`
   * in `rules/deck.ts`). Absent for every other seat.
   */
  coverHints?: string[];
}

export interface C2SPayloads {
  /** 20 Hz; one applied per tick, newest wins; the vector is normalised server-side. */
  'input.move': { seq: number; dx: number; dy: number; sprint: boolean; sneak: boolean };
  'act.interact': { targetId: string };
  /**
   * Main mode: `targetId` names the target per the ability's `target`: `player` (Kill, Bandage) an avatar handle,
   * `seat` (Impersonate, the night powers, Last Shot) a seat id. Quick mode: `targets` names every pick, in order:
   * `[stationId, cardId]` for `onub.prep`, card slots for a night act (none for `onub.inspect`).
   */
  'act.ability': { abilityId: string; targetId?: string; targets?: string[] };
  /** Re-validated every tick. */
  'act.hold': { action: HoldAction; targetId: string; on: boolean };
  'act.hide': { spotId: string };
  'act.check': { spotId: string };
  'act.burst': { spotId: string };
  /** Request / response. */
  'act.enterPortal': { portalId: string };
  'act.reportBody': { bodyId: string };
  'act.bell': Record<string, never>;
  'act.present': { entryId: string };
  /** Round 6: `on` lights the carried Lantern or Torch, or puts it out; refused 422 without one. */
  'act.light': { on: boolean };
  /** A living player's id, or `"skip"`; quick mode: another seat's id or `"pantry"`, never `"skip"`. Changeable until the vote closes (A30). */
  'meeting.vote': { targetId: string };
  'chat.say': { text: string };
  'chat.quick': { phraseId: string };
  'world.ping': { x: number; y: number };
  /** Deprecated alias of `lobby.ready {ready: true}`. */
  'role.ready': Record<string, never>;
  'net.ping': { t: number };
  /** Leader only, phase lobby, at least 1 human (GDD 3.12). Refused with error 422 otherwise. */
  'lobby.start': Record<string, never>;
  /**
   * Lobby: the Ready tick. Role card: dismisses the card; the match begins when all are ready or
   * `phases.roleRevealS` passes.
   */
  'lobby.ready': { ready: boolean };
  /**
   * Leader only, phase lobby: `mode` is a `GameMode`, `npcDifficulty` an `NpcLevel` (A39); `onubDeck` a custom
   * quick-mode deck (role ids, `[]` for the default), checked by `onubDeckProblem` without the size (GDD 3.11);
   * `map` a map id of `MAP_IDS` (GDD 3.13; ignored until Session 5J reads it). All or nothing; refused 422 / 425.
   */
  'lobby.settings': { mode?: number; npcDifficulty?: number; onubDeck?: string[]; map?: string };
  /** Leader only, phase lobby: one NPC seat up to `players.max` (GDD 3.12). */
  'lobby.addNpc': Record<string, never>;
  /** Leader only, phase lobby: removes the most recently added NPC seat; none left is 422. No id, so it never tells a seat apart (A39). */
  'lobby.removeNpc': Record<string, never>;
  /** Quick mode, a seat in play in the Rush or CRUST: replaces the seat's claim (GDD 3.11). */
  'meeting.claim': OnubClaimPayload;
  /**
   * Main mode, role card only, a cover role: picks the look it will walk as (a look of a non-cover card of the
   * deck); changeable until the card closes (GDD 3.17). Refused 425 outside the card, 422 otherwise.
   */
  'role.cover': { lookId: string };
  /** Round 6 (M5b, GDD 3.16): a `quests.json` id whose giver stands in reach. Refused 422 until Session 6H lands. */
  'quest.accept': { questId: string };
  /** Round 6 (M5b, GDD 3.16): an accepted quest whose wants the inventory holds, at its giver. Refused 422 until 6H. */
  'quest.turnIn': { questId: string };
  /**
   * Round 6 (M5b, GDD 3.16): the answer to the `minigameStart` of `taskId`; the server checks it against the
   * solution it kept and completes the task. Refused 422 until Session 6H lands.
   */
  'minigame.result': { taskId: string; answer: unknown };
}

export interface S2CPayloads {
  /** Private. */
  roleReveal: RoleRevealPayload;
  /** Private. */
  sceneEnter: { sceneId: string; spawn: string; facing: string };
  /** Private. */
  clueFound: { entryId: string };
  /** Private: the player is now a ghost; `roles` lists every seat's role id (ghosts see all roles, GDD 3.7). */
  killed: { sceneId: string; cause: DeathCause; roles: Record<string, string>; cutsceneId?: string };
  /** Private: routed per recipient; `from` is a player id. */
  'chat.msg': { from: string; text: string; channel: ChatChannel };
  phaseChange: { phase: number; endsTick: number };
  meetingStart: { reason: MeetingReason; callerId: string; bodyOf?: string; missing: string[] };
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
   * `roles` are the final roles; `onub` is present in quick mode only (GDD 3.11). Main mode: `alsoWon` lists an
   * ejected Drifter among the winners, `undealt` the cards nobody held (GDD 3.1, 3.8).
   */
  gameOver: {
    winner: number;
    roles: Record<string, string>;
    summary: string;
    onub?: OnubGameOver;
    alsoWon?: string[];
    undealt?: string[];
  };
  noise: { sceneId: string; x: number; y: number; kind: string };
  error: { code: ErrorCode; msg: string };
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
  /**
   * To every client whose view holds that scene: the puff of a disguise a Knife strike dropped, at (x, y). Names no
   * handle or seat. Sent only from `handleKill` (GDD 3.17).
   */
  vfx: { sceneId: string; x: number; y: number; kind: 'disguise' };
  /** Private, a dying Gamekeeper: pick a seat with `act.ability {abilityId: 'lastShot'}` before `endsTick` (GDD 3.2). */
  aim: { endsTick: number };
  /** Private, an Accomplice: the Knife passed to you (GDD 3.2 Inherit); nothing public changes. */
  inherit: Record<string, never>;
  /** Public, only during a reveal: the ejected Gamekeeper shot `targetId`, whose role was `role` (GDD 3.2). */
  shot: { fromId: string; targetId: string; role: string };
  /**
   * Round 6 (M5c, GDD 3.18): play the cutscene `id` of `packages/content/data/cutscenes/`. Broadcast once for a
   * map's opening at `beginPlay`; `scope: 'all'` marks a memorial every client plays (round 7). The server never
   * waits for a client to finish it. A death's cutscene travels on `killed.cutsceneId` instead.
   */
  cutscene: { id: string; scope?: 'all' };
  /**
   * Private, round 6 (M5b, GDD 3.16): a station task's hold opened its mini-game; `public` is the puzzle without
   * its solution (`rules/minigames.ts generate`). Answered with `minigame.result`.
   */
  minigameStart: { taskId: string; kind: MinigameKind; public: unknown };
}

export type ErrorPayload = S2CPayloads['error'];

/** Per-type rate limits in messages per second (5.5 "Limit" column). */
export const RATE_LIMITS: Partial<Record<C2SType, number>> = {
  'input.move': 25,
  'act.interact': 5,
  'act.ability': 5,
  'act.hold': 5,
  'act.hide': 5,
  'act.check': 5,
  'act.burst': 5,
  'act.enterPortal': 2,
  'act.reportBody': 2,
  'act.bell': 2,
  'act.present': 2,
  'act.light': 5,
  'meeting.vote': 2,
  'chat.say': 2,
  'chat.quick': 2,
  'world.ping': 2,
  'lobby.start': 2,
  'lobby.ready': 2,
  'lobby.settings': 2,
  'lobby.addNpc': 2,
  'lobby.removeNpc': 2,
  'meeting.claim': 2,
  'role.cover': 4,
  'quest.accept': 2,
  'quest.turnIn': 2,
  'minigame.result': 2,
};

export const ErrorCode = {
  cannot: 422,
  locked: 423,
  cooldown: 424,
  wrongPhase: 425,
  busy: 426,
  outOfRange: 427,
  closed: 428,
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Every joinById failure (missing, locked, full, version mismatch) returns exactly this (5.3). */
export const JOIN_ERROR_CODE = 404;
export const JOIN_ERROR_MESSAGE = 'party not found or unavailable';

/** Options a client passes to `create("party", ...)` and `joinById(code, ...)`. */
export interface JoinOptions {
  name: string;
  build: string;
  deviceId: string;
  /** Round 7 (GDD 3.21): the device's profile code; absent for a device without a profile and for the bots. */
  profile?: string;
}

/** Party visibility chosen at Create (GDD 3.21). */
export type PartyVisibility = 'open' | 'private';

/**
 * One row of `GET /parties` (GDD 3.21): a lobby-phase, unlocked room. `players` counts the seats taken, `mode` is
 * `Settings.mode` and `map` a `MAP_IDS` entry. No seat id, device id, role or invited list ever appears.
 */
export interface PartyListing {
  code: string;
  leader: string;
  players: number;
  max: number;
  mode: number;
  map: string;
  visibility: PartyVisibility;
}

/** Options for `create("party", ...)` only; `joinById` keeps `JoinOptions`. */
export interface CreateOptions extends JoinOptions {
  visibility: PartyVisibility;
  /** Profile codes the leader invited, capped by balance.json `party.invitedMax`; ignored for an open party. */
  invited?: string[];
}

// Round 6: the admin wire (docs/round6/auto-admin.md 6), accepted by the `admin` room only.
export * from './admin';
