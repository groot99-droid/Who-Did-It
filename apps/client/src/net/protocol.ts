// The wire protocol lives once, in @wdi/shared (docs/PROTOCOL.md is generated from it). This module
// re-exports it under the names the client uses, plus the roster row the lobby draws.
import {
  JOIN_ERROR_MESSAGE,
  MAX_PLAYERS as SHARED_MAX_PLAYERS,
  MIN_PLAYERS_TO_START as SHARED_MIN_PLAYERS,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  NpcLevel,
} from '@wdi/shared';
import type { S2CPayloads } from '@wdi/shared/protocol';

export {
  ROOM_NAME,
  type C2SPayloads as ClientMessages,
  type C2SType as ClientMessageType,
  type CreateOptions,
  type ErrorPayload,
  type JoinOptions,
  type PartyVisibility,
  type RoleRevealPayload,
  type S2CPayloads as ServerMessages,
  type S2CType as ServerMessageType,
  type TraitIds,
} from '@wdi/shared/protocol';

export type PhaseChangePayload = S2CPayloads['phaseChange'];
export type GameOverPayload = S2CPayloads['gameOver'];
export type SceneEnterPayload = S2CPayloads['sceneEnter'];

export const MIN_PLAYERS_TO_START = SHARED_MIN_PLAYERS;
export const MAX_PLAYERS = SHARED_MAX_PLAYERS;
export const NAME_MIN = NAME_MIN_LENGTH;
export const NAME_MAX = NAME_MAX_LENGTH;

/** The one message shown for every join failure (5.3). */
export const JOIN_FAILED_MESSAGE = JOIN_ERROR_MESSAGE;

/** Public roster row; mirrors the public fields of `Player` in 5.4 (no `priv`, no `presence`). */
export interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  /** The seat's profile code (GDD 3.21) when it sent one; the public handle behind "Add friend". */
  profile?: string;
}

/**
 * The lobby settings the server publishes (`state.settings`, GDD 3.12, 3.13); `npcSeats` is a count only.
 * `map` is the map id the match plays (`MAP_IDS` of `@wdi/content`).
 */
export type NpcLevelId = keyof typeof NpcLevel;
export interface LobbySettings {
  npcDifficulty: NpcLevelId;
  npcSeats: number;
  map: string;
}

/**
 * `Settings.map` of a new party: the schema default, the same id as `DEFAULT_MAP` in `@wdi/content` (a test pins
 * the two together). The client reads the content data files, not the content module, so it keeps this copy.
 */
export const DEFAULT_MAP_ID = 'hollowmere';

export const npcLevelId = (n: number): NpcLevelId =>
  (Object.keys(NpcLevel) as NpcLevelId[]).find((k) => NpcLevel[k] === n) ?? 'normal';
export { NpcLevel };
