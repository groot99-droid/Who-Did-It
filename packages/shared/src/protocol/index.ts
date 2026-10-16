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
  vote: 'meeting.vote',
  say: 'chat.say',
  quick: 'chat.quick',
  ping: 'world.ping',
  roleReady: 'role.ready',
  netPing: 'net.ping',
  lobbyStart: 'lobby.start',
  lobbyReady: 'lobby.ready',
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
} as const;

export type C2SType = (typeof C2S)[keyof typeof C2S];
export type S2CType = (typeof S2C)[keyof typeof S2C];

export type HoldAction = 'drag' | 'collect' | 'task' | 'inspect' | 'autopsy';
/** Why a meeting opened (GDD 3.3); `missing` is the roll-call of M4. */
export type MeetingReason = 'body' | 'bell' | 'missing';
/** How a player died; `vanished` is the disconnect death of GDD 3.8 (M7). */
export type DeathCause = 'knife' | 'ejected' | 'vanished';
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
}

export interface C2SPayloads {
  /** 20 Hz; one applied per tick, newest wins; the vector is normalised server-side. */
  'input.move': { seq: number; dx: number; dy: number; sprint: boolean; sneak: boolean };
  'act.interact': { targetId: string };
  'act.ability': { abilityId: string; targetId?: string; targetId2?: string };
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
  /** A living player's id, or `"skip"`; changeable until the vote closes (A30). */
  'meeting.vote': { targetId: string };
  'chat.say': { text: string };
  'chat.quick': { phraseId: string };
  'world.ping': { x: number; y: number };
  /** Deprecated alias of `lobby.ready {ready: true}`. */
  'role.ready': Record<string, never>;
  'net.ping': { t: number };
  /** Leader only, phase lobby, at least 1 human (GDD 3.12). Refused with error 422 otherwise. */
  'lobby.start': Record<string, never>;
  /** Lobby: the Ready tick. Role card: dismisses the card; the match begins when all are ready or 12 s pass. */
  'lobby.ready': { ready: boolean };
}

export interface S2CPayloads {
  /** Private. */
  roleReveal: RoleRevealPayload;
  /** Private. */
  sceneEnter: { sceneId: string; spawn: string; facing: string };
  /** Private. */
  clueFound: { entryId: string };
  /** Private: the player is now a ghost; `roles` lists every seat's role id (ghosts see all roles, GDD 3.7). */
  killed: { sceneId: string; cause: DeathCause; roles: Record<string, string> };
  /** Private: routed per recipient; `from` is a player id. */
  'chat.msg': { from: string; text: string; channel: ChatChannel };
  phaseChange: { phase: number; endsTick: number };
  meetingStart: { reason: MeetingReason; callerId: string; bodyOf?: string; missing: string[] };
  /** `tally` counts votes per target id and `"skip"`; voters are never named (GDD 3.8). */
  voteResult: { tally: Record<string, number>; ejectedId?: string; role?: string };
  gameOver: { winner: number; roles: Record<string, string>; summary: string };
  noise: { sceneId: string; x: number; y: number; kind: string };
  error: { code: ErrorCode; msg: string };
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
  'meeting.vote': 2,
  'chat.say': 2,
  'chat.quick': 2,
  'world.ping': 2,
  'lobby.start': 2,
  'lobby.ready': 2,
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
}
