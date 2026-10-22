// Round 6, Session 6D (docs/round6/auto-admin.md 8): `client.create('admin', { build, token })` with the token of
// `sessionStorage['wdi:adminToken']`, the `admin.*` messages in and out. The token arrives as `#/admin?token=...`
// after the GitHub callback (seams.md 7) and is moved into sessionStorage with the hash scrubbed.
import { Client, type Room } from '@colyseus/sdk';
import mitt, { type Emitter } from 'mitt';
import {
  ADMIN_C2S,
  ADMIN_S2C,
  type AdminC2SPayloads,
  type AdminC2SType,
  type AdminJoinOptions,
  type AdminS2CPayloads,
  type InvariantFailure,
  type SimEventWire,
} from '@wdi/shared/protocol';
import { BUILD_VERSION, SERVER_URL } from '../health';

export const ADMIN_TOKEN_KEY = 'wdi:adminToken';
export const ADMIN_ROOM_NAME = 'admin';

export type AdminSnapshot = AdminS2CPayloads['admin.snapshot'];

export type AdminLinkEvents = {
  snapshot: AdminSnapshot;
  event: SimEventWire[];
  invariant: InvariantFailure;
  /** The connection is gone (a refused join, a drop, or a leave); the page asks for a new sign-in. */
  closed: { reason: string };
};

/** What the page depends on; `connectAdmin` and `mockAdmin` implement it. */
export interface AdminLink {
  readonly bus: Emitter<AdminLinkEvents>;
  send<K extends AdminC2SType>(type: K, payload: AdminC2SPayloads[K]): void;
  close(): void;
}

/** The slice of `Storage` the token uses, so a test passes a plain object. */
export type TokenStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Pulls `token` out of `#/admin?token=...`; null for any other hash. */
export function tokenFromHash(hash: string): string | null {
  const m = /^#\/?admin\?(.*)$/.exec(hash);
  if (m === null) return null;
  const token = new URLSearchParams(m[1]).get('token');
  return token !== null && token !== '' ? token : null;
}

/**
 * Moves a callback token from the hash into the store and returns whatever the store now holds. `scrub` rewrites the
 * hash to `#/admin` (the caller passes `setRoute('admin')`), so the token never stays in the address bar or history.
 */
export function captureToken(hash: string, store: TokenStore, scrub: () => void): string | null {
  const fresh = tokenFromHash(hash);
  if (fresh !== null) {
    try {
      store.setItem(ADMIN_TOKEN_KEY, fresh);
    } catch {
      // Storage may be blocked; the token is then good for this page load only.
    }
    scrub();
    return fresh;
  }
  try {
    return store.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearToken(store: TokenStore): void {
  try {
    store.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Where the "Sign in with GitHub" button goes (the server redirects back to `#/admin?token=...`). */
export const loginUrl = (serverUrl: string = SERVER_URL): string => `${serverUrl}/auth/github/login`;

/** Joins the admin room with the token and wires the three server messages onto the link's bus. */
export async function connectAdmin(
  token: string,
  deps: { serverUrl?: string; build?: string; client?: Pick<Client, 'create'> } = {},
): Promise<AdminLink> {
  const client = deps.client ?? new Client(deps.serverUrl ?? SERVER_URL);
  const options: AdminJoinOptions = { build: deps.build ?? BUILD_VERSION, token };
  const room: Room = await client.create(ADMIN_ROOM_NAME, options);
  const bus = mitt<AdminLinkEvents>();
  room.onMessage(ADMIN_S2C.snapshot, (m: AdminSnapshot) => bus.emit('snapshot', m));
  room.onMessage(ADMIN_S2C.event, (m: AdminS2CPayloads['admin.event']) => bus.emit('event', m.events));
  room.onMessage(ADMIN_S2C.invariant, (m: InvariantFailure) => bus.emit('invariant', m));
  room.onLeave((code) => bus.emit('closed', { reason: String(code) }));
  return {
    bus,
    send: (type, payload) => room.send(type, payload),
    close: () => void room.leave(true),
  };
}

export { ADMIN_C2S };
