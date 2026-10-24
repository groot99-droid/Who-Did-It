import { type Profile, type SceneId, balance, profileFor, roles, scenes, tasks } from '@wdi/content';
import { MAX_PLAYERS, MIN_PLAYERS_TO_START, TaskEntry, shuffle } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { countRow } from './Flow';
import { mapScenesOf } from './MapSites';
import { npcMemory } from './npc/memory';
import { profileOpen } from './World';

/**
 * The task deal (round 7, 7M; GDD 3.5, DECISIONS A133). At `startMatch`, after the cards, every human seat is dealt
 * its list: a Village seat `byCount.tasksEach` real tasks, a Cabal or neutral seat as many fake ones (alibi theatre,
 * `tasks.cabalFakeList`), both drawn without replacement from the same pool on the `tasks` stream, which nothing public
 * shares. An NPC seat is dealt none: its brain plays no mini-game, and a list never worked would cap the bar below
 * 100 for the match. The lists live in `Private.tasks`, each seat's own view; the bar starts at nothing.
 */

interface Node {
  scene: string;
  prop: string;
}

/** Whether `node` stands in this match: its scene on the map and open at the profile, its prop present there. */
function nodeOpen(node: Node, map: ReadonlySet<string>, profile: Profile): boolean {
  const scene = scenes[node.scene as SceneId];
  const prop = scene?.props.find((q) => q.id === node.prop);
  if (!scene || !prop || !map.has(node.scene)) return false;
  return profileOpen(scene.profile, profile) && (!prop.profiles || prop.profiles.includes(profile));
}

/**
 * The pool a match deals from (GDD 3.5): every task whose source (if any) and at least one target stand on the map at
 * the profile, in `tasks.json` order; the co-op task counts like a fetch one (PR 4). A map without them (Blackpine
 * today) has an empty pool and deals nothing.
 */
export function taskPool(mapScenes: readonly string[], profile: Profile): string[] {
  const map = new Set<string>(mapScenes);
  return Object.values(tasks.tasks)
    .filter(
      (t) =>
        (t.source === undefined || nodeOpen(t.source, map, profile)) &&
        t.targets.some((n) => nodeOpen(n, map, profile)),
    )
    .map((t) => t.id);
}

/** The profile the match will place at (`placeNewPlayers` fixes the same one from the same count). */
const profileOfRoom = (room: PartyRoom): Profile =>
  profileFor(Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS_TO_START, room.state.players.size)));

/**
 * Deals every seat its list from `dealt` (seat -> card), in roster order, on the `tasks` stream. Call site:
 * `handlers/lobby.ts startMatch`, after `assignCovers`. Clears whatever list a seat held.
 */
export function dealTasks(room: PartyRoom, dealt: ReadonlyMap<string, string>): void {
  const seats = room.state.players.size;
  const pool = taskPool(mapScenesOf(room), profileOfRoom(room));
  const count = Math.min(countRow(seats).tasksEach, pool.length);
  const rng = room.seeds.get('tasks');
  room.state.taskBar = 0;
  for (const [id, player] of room.state.players) {
    const priv = player.priv;
    if (!priv) continue;
    priv.tasks.clear();
    // An NPC seat (`isNpcSeat` of `sim/Npc.ts`, read here from the memory so this module adds no import edge through
    // `npc/meeting`; `lastShot.test.ts` mocks that module and its order matters).
    if (npcMemory(room).ids.has(id)) continue;
    const faction = roles.roles[dealt.get(id) ?? '']?.faction;
    if (faction === undefined) continue;
    const fake = faction !== 'village';
    if (fake && !balance.tasks.cabalFakeList) continue;
    for (const taskId of shuffle(pool, rng).slice(0, count)) {
      const entry = new TaskEntry();
      entry.id = taskId;
      entry.done = false;
      entry.fake = fake;
      priv.tasks.push(entry);
    }
  }
}
