// TODO: replace this local copy with `import ... from "@wdi/shared/protocol"` once the
// server session's package merges (docs/SESSIONS.md, interface A -> B). Source of truth is
// docs/ARCHITECTURE.md 5.5; keep names and payload shapes identical until then.

/** Colyseus room name registered by the server (ARCHITECTURE 5.3). */
export const ROOM_NAME = "party";

export interface JoinOptions {
  name: string;
  build: string;
  deviceId: string;
}

/** Error codes from 5.5: 422 cannot, 423 locked, 424 cooldown, 425 wrong phase, 426 busy, 427 out of range, 428 closed. */
export type ErrorCode = 422 | 423 | 424 | 425 | 426 | 427 | 428;

export interface ErrorPayload {
  code: ErrorCode;
  msg: string;
}

export type HoldAction = "drag" | "collect" | "task" | "inspect" | "autopsy";

/** Client -> server messages (5.5). `lobby.start` is not in the table yet, see TODO below. */
export interface ClientMessages {
  "input.move": { seq: number; dx: number; dy: number; sprint: boolean; sneak: boolean };
  "act.interact": { targetId: string };
  "act.ability": { abilityId: string; targetId?: string };
  "act.hold": { action: HoldAction; targetId: string; on: boolean };
  "act.hide": { spotId: string };
  "act.check": { spotId: string };
  "act.burst": { spotId: string };
  "act.enterPortal": { portalId: string };
  "act.reportBody": { bodyId: string };
  "act.bell": Record<string, never>;
  "act.present": { entryId: string };
  "meeting.vote": { targetId: string | "skip" };
  "chat.say": { text: string };
  "chat.quick": { phraseId: string };
  "world.ping": { x: number; y: number };
  "role.ready": Record<string, never>;
  "net.ping": { t: number };
  // TODO(5.5): the table has no Start message; 5.3 says "Start: players.size >= 4, phase lobby,
  // leader only". `lobby.start` is a placeholder name to confirm with the server session.
  "lobby.start": Record<string, never>;
}

export interface RoleAbility {
  id: string;
  name: string;
  key: string;
  cooldown: number;
  uses: number | null;
}

export interface RoleInventoryItem {
  defId: string;
  qty: number;
  tooltip: string;
}

/** Only meaningful for Cabal; 5.5 lists `teammates[]` without an element shape, so ids and names are assumed. */
export interface Teammate {
  id: string;
  name: string;
}

export interface Traits {
  height: "S" | "M" | "T";
  scarf: "red" | "green" | "blue";
  hat: "cap" | "bowler" | "bare";
}

/** Private to the receiving client (5.5 `roleReveal`). Never stored, logged or sent anywhere. */
export interface RoleRevealPayload {
  roleId: string;
  team: "village" | "cabal" | "neutral";
  goal: string;
  abilities: RoleAbility[];
  inventory: RoleInventoryItem[];
  cardText: string;
  beware: string;
  teammates: Teammate[];
  traits: Traits;
}

export interface PhaseChangePayload {
  phase: number;
  endsTick: number;
}

export interface GameOverPayload {
  winner: number;
  roles: Record<string, string>;
  summary: string;
}

/** Server -> client messages (5.5). Private ones are only ever delivered to their owner. */
export interface ServerMessages {
  roleReveal: RoleRevealPayload;
  phaseChange: PhaseChangePayload;
  gameOver: GameOverPayload;
  error: ErrorPayload;
}

export type ClientMessageType = keyof ClientMessages;
export type ServerMessageType = keyof ServerMessages;

/** Public roster row; mirrors the public fields of `Player` in 5.4 (no `priv`, no `presence`). */
export interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
}

export const MIN_PLAYERS_TO_START = 4;
export const MAX_PLAYERS = 10;
export const NAME_MIN = 2;
export const NAME_MAX = 16;

/** The one message shown for every join failure (5.3). */
export const JOIN_FAILED_MESSAGE = "party not found or unavailable";
