import { Decoder, type Encoder, type StateView } from '@colyseus/schema';
import { GameState, type GameStateType, type InvariantFailure } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { StatusBit } from '../constants';
import { simOf } from '../RoomSim';
import { NEAR_PX, addShadowViewer, clearShadowViewers, createPlayerView } from '../Visibility';
import { registerInvariant } from './invariants';

/**
 * Round 10, x14 (A453, GDD 3.19 "Decoded views"): the decoded-view invariant of `pnpm auto -- --views`. Every seat
 * of an auto match gets a shadow view, built by `createPlayerView` and reconciled with the clients' rule
 * (`Visibility.ts`), and a `Decoder` over a fresh `GameState` that reads what the room's own `Encoder` writes for
 * that view: the first frame through `encodeAll` and `encodeAllView`, then every patch through `encode` and
 * `encodeView`, exactly the two paths `SchemaSerializer` takes for a client. The decoded state is what a client at
 * that seat would hold. Off by default: with the flag off nothing here is attached, and the default run's speed does
 * not change. The shadow reads the room's state and its encoder; it never touches the sim, a view of a client or
 * any random stream.
 */
interface Shadow {
  sessionId: string;
  view: StateView;
  decoder: Decoder<GameStateType>;
}

/** The room's own encoder (`Room.setSerializer` installs the schema serializer that owns it, as a private field). */
type RoomWithEncoder = { _serializer: { encoder: Encoder } };

export class ShadowViews {
  readonly shadows: Shadow[] = [];
  /** The server tick of the last frame the shadows decoded. */
  encodedTick = -1;
  /** Avatar comparisons made so far, so a clean run shows it compared something. */
  checks = 0;
  private first = true;
  private fullBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(1 << 16);

  constructor(private readonly room: PartyRoom) {}

  private get encoder(): Encoder {
    return (this.room as unknown as RoomWithEncoder)._serializer.encoder;
  }

  /**
   * Encodes the room's pending changes for every shadow and decodes them, as `broadcastPatch` would for the clients:
   * the shared part once, then each view's part. The encoder's change list is left for the room to discard.
   */
  encodeTick(): void {
    const { encoder } = this;
    if (this.first) {
      this.first = false;
      const it = { offset: 1 };
      this.fullBuffer = encoder.encodeAll(it, this.fullBuffer);
      const shared = it.offset;
      for (const shadow of this.shadows) {
        const frame = encoder.encodeAllView(shadow.view, shared, { offset: shared }, this.fullBuffer);
        shadow.decoder.decode(frame, { offset: 1 });
      }
    } else if (encoder.hasChanges) {
      const it = { offset: 1 };
      encoder.encode(it);
      const shared = it.offset;
      for (const shadow of this.shadows) {
        const frame = encoder.encodeView(shadow.view, shared, { offset: shared });
        shadow.decoder.decode(frame, { offset: 1 });
      }
    } else {
      for (const shadow of this.shadows) {
        if (shadow.view.changes.size === 0) continue;
        const frame = encoder.encodeView(shadow.view, 1, { offset: 1 });
        shadow.decoder.decode(frame, { offset: 1 });
      }
    }
    this.encodedTick = this.room.state.tick;
  }

  /**
   * The invariant, both directions: every avatar a seat's decoded state holds exists on the server at the same `x`
   * and `y` and its view still marks it visible; every avatar the view marks visible is in the decoded state. Then
   * A170's rule on the decoded state of a living seat: no other seat's `priv` or `presence`, no `seat` on an avatar,
   * no Blood out of range, and no secret field outside the seat's own entry.
   */
  check(): InvariantFailure | null {
    const { room } = this;
    const tick = room.state.tick;
    const fail = (detail: string): InvariantFailure => ({ name: '', tick, detail });
    for (const { sessionId, view, decoder } of this.shadows) {
      const decoded = decoder.state;
      if (decoded.tick !== tick)
        return fail(`seat ${sessionId} decoded tick ${decoded.tick} at tick ${tick}`);
      for (const [sceneId, scene] of decoded.scenes) {
        for (const [handle, avatar] of scene.avatars) {
          const server = room.state.scenes.get(sceneId)?.avatars.get(handle);
          if (!server)
            return fail(`seat ${sessionId} decoded avatar ${handle} in ${sceneId}, which the server has not`);
          if (!view.has(server))
            return fail(
              `seat ${sessionId} decoded avatar ${handle} in ${sceneId}, which its view no longer shows`,
            );
          if (server.x !== avatar.x || server.y !== avatar.y)
            return fail(
              `seat ${sessionId} decoded avatar ${handle} at ${avatar.x},${avatar.y}, the server at ${server.x},${server.y}`,
            );
          this.checks++;
        }
      }
      for (const [sceneId, scene] of room.state.scenes) {
        for (const [handle, avatar] of scene.avatars) {
          if (!view.has(avatar)) continue;
          if (!decoded.scenes.get(sceneId)?.avatars.has(handle))
            return fail(`seat ${sessionId} shows avatar ${handle} in ${sceneId}, which it has not decoded`);
        }
      }
      const leak = secretLeak(room, sessionId, decoded);
      if (leak !== null) return fail(leak);
    }
    return null;
  }

  dispose(): void {
    for (const shadow of this.shadows) shadow.view.dispose();
    this.shadows.length = 0;
    clearShadowViewers(this.room);
    shadowViews.delete(this.room);
  }
}

/** The keys of `leak.test.ts` (A170): a secret field, and a field that names a seat. */
export const SECRET_KEYS = new Set([
  'roleId',
  'role',
  'team',
  'cover',
  'coverId',
  'cooldowns',
  'priv',
  'notebook',
]);

/** A170's rule on one living seat's decoded state; null when it holds. */
function secretLeak(room: PartyRoom, sessionId: string, decoded: GameStateType): string | null {
  const viewerSim = simOf(room).players.get(sessionId);
  if (!viewerSim || viewerSim.dead) return null; // a ghost sees every seat (GDD 3.17)
  for (const [id, player] of decoded.players) {
    if (id === sessionId) continue;
    if (player.priv !== undefined) return `living seat ${sessionId} decoded the priv of ${id}`;
    if (player.presence !== undefined) return `living seat ${sessionId} decoded the presence of ${id}`;
  }
  for (const [sceneId, scene] of decoded.scenes) {
    for (const [handle, avatar] of scene.avatars) {
      // A tagged field a view never received decodes as `undefined`, not as its default (so `leak.test.ts` too).
      if (avatar.seat) return `living seat ${sessionId} decoded the seat of avatar ${handle} in ${sceneId}`;
      const far = Math.hypot(avatar.x - viewerSim.x, avatar.y - viewerSim.y) > NEAR_PX;
      if (far && ((avatar.nearBits ?? 0) | avatar.statusBits) & StatusBit.bloody)
        return `living seat ${sessionId} decoded Blood on avatar ${handle} in ${sceneId} out of range`;
    }
  }
  return secretKeyOutside(decoded.toJSON(), `players.${sessionId}`, '');
}

/** The path of the first secret key in `value` that is not under `own`; null when there is none. */
function secretKeyOutside(value: unknown, own: string, path: string): string | null {
  if (value === null || typeof value !== 'object') return null;
  if (path === own) return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const at = path === '' ? key : `${path}.${key}`;
    if (
      SECRET_KEYS.has(key) &&
      child !== undefined &&
      child !== null &&
      at !== own &&
      !at.startsWith(`${own}.`)
    )
      return `secret field ${at} decoded`;
    const found = secretKeyOutside(child, own, at);
    if (found !== null) return found;
  }
  return null;
}

const shadowViews = new WeakMap<PartyRoom, ShadowViews>();
let registered = false;

/** The shadows of `room`, when the harness attached them. */
export const shadowViewsOf = (room: PartyRoom): ShadowViews | undefined => shadowViews.get(room);

/**
 * Attaches a shadow view and decoder to every seat of `room` (after `enableAuto`, before the first step) and makes
 * the room's `broadcastPatch` feed them before it runs: a frame is decoded on every tick the room would have patched.
 */
export function attachShadowViews(room: PartyRoom): ShadowViews {
  const existing = shadowViews.get(room);
  if (existing) return existing;
  // Round 10, x14 (A453): the check joins the other invariants the first time shadows attach (`--views`), never on
  // import, so the default registry stays the list of auto-admin.md 5 and `invariants.test.ts`.
  if (!registered) {
    registered = true;
    registerInvariant('decodedViews', (r) => shadowViewsOf(r)?.check() ?? null);
  }
  const shadows = new ShadowViews(room);
  for (const sessionId of room.state.players.keys()) {
    const view = createPlayerView(room, sessionId);
    addShadowViewer(room, { sessionId, view });
    shadows.shadows.push({ sessionId, view, decoder: new Decoder(new GameState()) });
  }
  const broadcastPatch = room.broadcastPatch.bind(room);
  room.broadcastPatch = () => {
    if (shadowViews.get(room) === shadows) shadows.encodeTick();
    return broadcastPatch();
  };
  shadowViews.set(room, shadows);
  return shadows;
}
