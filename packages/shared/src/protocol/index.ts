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
  // Not in 5.5 yet; added with the lobby (ARCHITECTURE 5.3: leader-only Start, advisory Ready).
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

export interface C2SPayloads {
  'input.move': { seq: number; dx: number; dy: number; sprint: boolean; sneak: boolean };
  'act.interact': { targetId: string };
  'act.ability': { abilityId: string; targetId?: string; targetId2?: string };
  'act.hold': { action: HoldAction; targetId: string; on: boolean };
  'act.hide': { spotId: string };
  'act.check': { spotId: string };
  'act.burst': { spotId: string };
  'act.enterPortal': { portalId: string };
  'act.reportBody': { bodyId: string };
  'act.bell': Record<string, never>;
  'act.present': { entryId: string };
  'meeting.vote': { targetId: string };
  'chat.say': { text: string };
  'chat.quick': { phraseId: string };
  'world.ping': { x: number; y: number };
  'role.ready': Record<string, never>;
  'net.ping': { t: number };
  'lobby.start': Record<string, never>;
  'lobby.ready': { ready: boolean };
}

export interface RoleRevealPayload {
  roleId: string;
  team: 'village' | 'cabal' | 'neutral';
  goal: string;
  abilities: { id: string; name: string; key: string; cooldown: number; uses: number }[];
  inventory: { defId: string; qty: number; tooltip: string }[];
  cardText: string;
  beware: string;
  teammates: string[];
  traits: { height: number; scarf: number; hat: number };
}

export interface S2CPayloads {
  roleReveal: RoleRevealPayload;
  sceneEnter: { sceneId: string; spawn: string; facing: string };
  clueFound: { entryId: string };
  killed: { sceneId: string };
  'chat.msg': { from: string; text: string; channel: string };
  phaseChange: { phase: number; endsTick: number };
  meetingStart: { reason: string; callerId: string; bodyOf?: string; missing: string[] };
  voteResult: { tally: Record<string, number>; ejectedId?: string; role?: string };
  gameOver: { winner: number; roles: Record<string, string>; summary: string };
  noise: { sceneId: string; x: number; y: number; kind: string };
  error: { code: ErrorCode; msg: string };
}

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
