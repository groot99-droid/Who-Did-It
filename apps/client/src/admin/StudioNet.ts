// Round 9 (9T, docs/round9/admin-studio.md 1): `client.create('studio', { build, token })` with the same admin token
// as `admin` (sessionStorage['wdi:adminToken'], captured by `captureToken`), the `studio.*` messages in and out.
import { Client, type Room } from '@colyseus/sdk';
import mitt, { type Emitter } from 'mitt';
import {
  STUDIO_C2S,
  STUDIO_S2C,
  type StudioC2SPayloads,
  type StudioC2SType,
  type StudioJoinOptions,
  type StudioS2CPayloads,
} from '@wdi/shared/protocol';
import { BUILD_VERSION, SERVER_URL } from '../health';

export const STUDIO_ROOM_NAME = 'studio';

export type StudioSnapshot = StudioS2CPayloads['studio.snapshot'];

export type StudioLinkEvents = {
  snapshot: StudioSnapshot;
  log: string[];
  /** A refused command: the room's `error` message (code 422 and a short `msg`). */
  refused: string;
  /** The connection is gone (a refused join, a drop, or a leave); the page asks for a new sign-in. */
  closed: { reason: string };
};

/** What the page depends on; `connectStudio` and `mockStudio` implement it. */
export interface StudioLink {
  /** The room's id, which `POST /studio/draft` names so the draft reaches this connection's room. */
  readonly roomId: string;
  readonly bus: Emitter<StudioLinkEvents>;
  send<K extends StudioC2SType>(type: K, payload: StudioC2SPayloads[K]): void;
  close(): void;
}

/** Joins the studio room with the token and wires the server messages onto the link's bus. */
export async function connectStudio(
  token: string,
  deps: { serverUrl?: string; build?: string; client?: Pick<Client, 'create'> } = {},
): Promise<StudioLink> {
  const client = deps.client ?? new Client(deps.serverUrl ?? SERVER_URL);
  const options: StudioJoinOptions = { build: deps.build ?? BUILD_VERSION, token };
  const room: Room = await client.create(STUDIO_ROOM_NAME, options);
  const bus = mitt<StudioLinkEvents>();
  room.onMessage(STUDIO_S2C.snapshot, (m: StudioSnapshot) => bus.emit('snapshot', m));
  room.onMessage(STUDIO_S2C.log, (m: StudioS2CPayloads['studio.log']) => bus.emit('log', m.lines));
  room.onMessage('error', (m: { msg?: string }) => bus.emit('refused', m.msg ?? ''));
  room.onLeave((code) => bus.emit('closed', { reason: String(code) }));
  return {
    roomId: room.roomId,
    bus,
    send: (type, payload) => room.send(type, payload),
    close: () => void room.leave(true),
  };
}

export { STUDIO_C2S };
