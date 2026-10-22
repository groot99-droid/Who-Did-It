import type { Client } from '@colyseus/core';
import { StateView } from '@colyseus/schema';
import { VIEW_TAG } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { SCENE_KEYS } from '../World';

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
