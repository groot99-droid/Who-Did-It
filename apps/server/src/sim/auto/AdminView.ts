import type { Client } from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import { roles } from '@wdi/content';
import {
  ADMIN_S2C,
  type AdminMob,
  type AdminS2CPayloads,
  type AdminSeat,
  type InvariantFailure,
  Phase,
  type SimEventWire,
  TICK_RATE,
  VIEW_TAG,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { npcMemory } from '../npc/memory';
import { onSim } from '../events/bus';
import { simOf } from '../RoomSim';
import { SCENE_KEYS, sceneKey } from '../World';
import { autoOf } from './Auto';
import { clockOf, effectiveScale } from './clock';
import { runInvariants } from './invariants';

/**
 * The god view of the `admin` room (round 6, docs/round6/auto-admin.md 7 and 8): every scene, every seat with its
 * `presence` and `priv`, every avatar with its true seat. `isAdminClient` is the one line `reconcileViews`
 * (sim/Visibility.ts) asks before its own work; it is false in every `party` room, because only `AdminRoom` marks a
 * client. No new view tag: the admin client holds the tags a ghost holds and the two a seat holds on itself.
 */
const adminClients = new WeakMap<PartyRoom, string>();

/** What one admin view holds, so `reconcileAdminView` adds what is new and forgets what the sim deleted. */
interface Held {
  players: Set<object>;
  avatars: Set<object>;
}
const held = new WeakMap<StateView, Held>();

/** `AdminRoom.onJoin` marks the one client that takes the god view. */
export function markAdminClient(room: PartyRoom, sessionId: string): void {
  adminClients.set(room, sessionId);
}

export function clearAdminClient(room: PartyRoom): void {
  adminClients.delete(room);
}

export function isAdminClient(room: PartyRoom, sessionId: string): boolean {
  return adminClients.get(room) === sessionId;
}

/** A view that already holds everything the room has now. */
export function createAdminView(room: PartyRoom): StateView {
  const view = new StateView();
  held.set(view, { players: new Set(), avatars: new Set() });
  fill(room, view);
  return view;
}

/** Run with the other views (every 4th tick and on `viewsDirty`): adds new seats and avatars, keeps the rest. */
export function reconcileAdminView(room: PartyRoom, client: Client): void {
  const view = client.view;
  if (view) fill(room, view);
}

function fill(room: PartyRoom, view: StateView): void {
  const mine = held.get(view) ?? { players: new Set(), avatars: new Set() };
  held.set(view, mine);

  const players = new Set<object>();
  for (const player of room.state.players.values()) {
    players.add(player);
    if (mine.players.has(player)) continue;
    view.add(player);
    view.add(player, VIEW_TAG.presence);
    view.add(player, VIEW_TAG.priv);
    mine.players.add(player);
  }
  // A deleted seat leaves the view with its map entry (as a deleted avatar does in `reconcileAvatars`).
  for (const gone of [...mine.players]) if (!players.has(gone)) mine.players.delete(gone);

  const avatars = new Set<object>();
  for (const key of SCENE_KEYS) {
    const scene = room.state.scenes.get(key);
    if (!scene) continue;
    if (!view.has(scene)) view.add(scene);
    scene.avatars.forEach((avatar) => {
      avatars.add(avatar);
      if (mine.avatars.has(avatar)) return;
      view.add(avatar);
      view.add(avatar, VIEW_TAG.ghost);
      mine.avatars.add(avatar);
    });
  }
  for (const gone of [...mine.avatars]) if (!avatars.has(gone)) mine.avatars.delete(gone);
}

/** The kinds the round-6 emitters send (auto-admin.md 5); the feed names them and a new kind is added here. */
export const ADMIN_EVENT_KINDS = [
  'kill',
  'death',
  'clue',
  'meeting',
  'vote',
  'eject',
  'phase',
  'start',
  'end',
] as const;

/** Failures kept for the log pane until Reset; past it the oldest go (the page shows the newest). */
export const MAX_KEPT_FAILURES = 200;
/** Events sent in one `admin.event`; the rest of a burst waits for the next tick. */
export const MAX_EVENTS_PER_MESSAGE = 200;
/** Invariants run about once a second of sim time (`runInvariants` is read-only). */
const INVARIANT_EVERY_TICKS = TICK_RATE;

/** What the admin page shows beyond the schema, per room: the tick's events and the failures kept until Reset. */
interface Feed {
  events: SimEventWire[];
  failures: InvariantFailure[];
  seen: Set<string>;
  lastInvariantTick: number;
  sawStart: boolean;
}
const feeds = new WeakMap<PartyRoom, Feed>();

function feedOf(room: PartyRoom): Feed {
  let feed = feeds.get(room);
  if (!feed) {
    feed = { events: [], failures: [], seen: new Set(), lastInvariantTick: -Infinity, sawStart: false };
    feeds.set(room, feed);
    const f = feed;
    for (const kind of ADMIN_EVENT_KINDS) {
      onSim(room, kind, (ev) => {
        // A seat id or a scene id, never a handle (the log records seats, auto-admin.md 4).
        f.events.push({
          tick: ev.tick,
          kind: ev.kind,
          ...(ev.seat !== undefined ? { seat: ev.seat } : {}),
          ...(ev.sceneId !== undefined ? { sceneId: ev.sceneId } : {}),
          ...(ev.data !== undefined ? { data: ev.data } : {}),
        });
      });
    }
  }
  return feed;
}

/** `AdminRoom.onCreate`: starts listening to the bus before the first event. */
export function watchAdminFeed(room: PartyRoom): void {
  feedOf(room);
}

const seatSceneId = (idx: number): string => sceneKey(idx);

/** Every seat as the god view lists it: role and cover included, the brain for an NPC (auto-admin.md 6). */
export function adminSeats(room: PartyRoom): AdminSeat[] {
  const sim = simOf(room);
  const npc = npcMemory(room);
  const seats: AdminSeat[] = [];
  for (const [id, player] of room.state.players) {
    const p = sim.players.get(id);
    const roleId = player.priv.role.roleId;
    const def = roles.roles[roleId];
    const brain = npc.ids.has(id) ? npc.brains.get(id) : undefined;
    seats.push({
      id,
      name: player.name,
      roleId,
      look: player.look,
      ...(def?.cover === true && player.look !== '' && def.look && def.look !== player.look
        ? { coverOf: def.look }
        : {}),
      sceneId: p ? seatSceneId(p.sceneIdx) : '',
      x: p ? Math.round(p.x) : 0,
      y: p ? Math.round(p.y) : 0,
      dead: p?.dead ?? false,
      ...(brain
        ? {
            brain: {
              mode: brain.mode,
              goal: brain.act ? `${brain.act.kind}:${brain.act.stationId}` : '',
              striking: brain.striking,
              flee: brain.flee !== null,
            },
          }
        : {}),
    });
  }
  return seats;
}

/** The creatures of every scene (round 6, M5b); empty until the mobs exist. */
export function adminMobs(room: PartyRoom): AdminMob[] {
  const mobs: AdminMob[] = [];
  for (const key of SCENE_KEYS) {
    room.state.scenes
      .get(key)
      ?.mobs.forEach((mob, id) =>
        mobs.push({ id, kind: mob.kind, sceneId: key, x: mob.x, y: mob.y, state: String(mob.state) }),
      );
  }
  return mobs;
}

export function adminSnapshot(room: PartyRoom): AdminS2CPayloads['admin.snapshot'] {
  const clock = clockOf(room);
  const mobs = adminMobs(room);
  return {
    tick: room.state.tick,
    phase: room.state.phase,
    scale: clock.scale,
    paused: clock.paused,
    effectiveScale: effectiveScale(clock),
    seats: adminSeats(room),
    ...(mobs.length > 0 ? { mobs } : {}),
    invariants: feedOf(room).failures,
  };
}

/** Every key of a failure that makes it the same one: a standing failure is sent once, not once a second. */
const failureKey = (f: InvariantFailure): string => `${f.name}|${f.detail}`;

/** Runs the registered invariants when due; returns the failures that were not seen before. */
function checkInvariants(room: PartyRoom, feed: Feed): InvariantFailure[] {
  const tick = room.state.tick;
  if (tick - feed.lastInvariantTick < INVARIANT_EVERY_TICKS) return [];
  feed.lastInvariantTick = tick;
  let found: InvariantFailure[];
  try {
    found = runInvariants(room);
  } catch (e) {
    found = [{ name: 'invariant-error', tick, detail: e instanceof Error ? e.message : String(e) }];
  }
  const fresh: InvariantFailure[] = [];
  for (const failure of found) {
    const key = failureKey(failure);
    if (feed.seen.has(key)) continue;
    feed.seen.add(key);
    feed.failures.push(failure);
    fresh.push(failure);
  }
  if (feed.failures.length > MAX_KEPT_FAILURES)
    feed.failures.splice(0, feed.failures.length - MAX_KEPT_FAILURES);
  return fresh;
}

/**
 * After each tick of the `AdminRoom`: the new invariant failures, the tick's events, then the snapshot, to the admin
 * client only. Failures stay on the snapshot until Reset (the auto state's `started` goes back to false).
 */
export function publishAdmin(room: PartyRoom, client: Client): void {
  const feed = feedOf(room);
  const started = autoOf(room)?.started ?? false;
  if (started) feed.sawStart = true;
  else if (feed.sawStart && room.state.phase === Phase.lobby) {
    feed.sawStart = false;
    feed.failures.length = 0;
    feed.seen.clear();
  }
  for (const failure of checkInvariants(room, feed)) client.send(ADMIN_S2C.invariant, failure);
  if (feed.events.length > 0) {
    client.send(ADMIN_S2C.event, { events: feed.events.splice(0, MAX_EVENTS_PER_MESSAGE) });
  }
  client.send(ADMIN_S2C.snapshot, adminSnapshot(room));
}
