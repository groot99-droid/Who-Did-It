import { balance, quests, scenes } from '@wdi/content';
import { QuestState, TILE_PX, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { count, exchange } from './Inventory';
import { type PlayerSim, simOf } from './RoomSim';
import { CONTRACT_QUEST, acceptContract } from './vendettas/contract';
import { isVerbPhase, reject, sceneKey, tileCentre } from './World';
import { refusal, type Refusal } from './refusal';

/**
 * Quests (round 6, M5b, GDD 3.16; docs/round6/m5b-data.md 2.3): givers are scene statics; `quest.accept` and
 * `quest.turnIn` go through the command queue; the own `Private.quests` holds the state; rewards go through
 * `sim/Inventory.ts`. A `contract` quest row refuses; the Hitman's mail (`contract`, round 7, 7H) is accepted
 * from anywhere by `sim/vendettas/contract.ts`.
 * Session 6H.
 */

// ---- Quests ----

/** The units a quest wants in all, and how many of them the seat carries now (each want capped at its quantity). */
function wantProgress(player: PlayerState, questId: string): { have: number; total: number } {
  const q = quests.quests[questId];
  let have = 0;
  let total = 0;
  for (const w of q?.wants ?? []) {
    total += w.qty;
    have += Math.min(count(player, w.item), w.qty);
  }
  return { have, total };
}

const stateOf = (player: PlayerState, questId: string): InstanceType<typeof QuestState> | undefined =>
  player.priv.quests.find((s) => s.id === questId);

/** Why this seat cannot speak to a giver now, or null: alive, placed, in the world, in a verb phase. */
function speakProblem(room: PartyRoom, p: PlayerSim | undefined): Refusal | null {
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  if (!p || p.dead || !p.placed) return refusal('NOT_IN_PLAY');
  if (room.state.tick < p.busyUntilTick) return refusal('BUSY');
  return null;
}

/** True when a giver of `npc` stands in the seat's scene within the verb reach. */
function giverInReach(p: PlayerSim, npc: string): boolean {
  const reach = balance.doors.reachTiles * TILE_PX;
  return (scenes[sceneKey(p.sceneIdx)]?.givers ?? []).some(
    (g) =>
      g.npc === npc && Math.hypot(p.x - tileCentre(g.x, TILE_PX), p.y - tileCentre(g.y, TILE_PX)) <= reach,
  );
}

/** Looks the quest and its giver up for a command, refusing on the first problem; null when refused. */
function questFor(room: PartyRoom, sessionId: string, payload: Record<string, unknown>) {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  if (!player || !p) return null;
  const refuse = (problem: Refusal) => {
    reject(room, sessionId, problem);
    return null;
  };
  const id = payload.questId;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return refuse(refusal('BAD_REQUEST'));
  const quest = quests.quests[id];
  if (!quest || quest.kind !== 'fetch') return refuse(refusal('BAD_REQUEST'));
  const problem = speakProblem(room, p);
  if (problem) return refuse(problem);
  if (!giverInReach(p, quest.giver)) return refuse(refusal('TOO_FAR', { of: 'person' }));
  return { player, quest };
}

/** Step stage after `runMobs` (locked call site in `sim/Step.ts`): progress follows the inventory. */
export function runQuests(room: PartyRoom): void {
  for (const player of room.state.players.values()) {
    const list = player.priv?.quests;
    if (!list || list.length === 0) continue;
    for (const s of list) {
      if (s.done) continue;
      const { have, total } = wantProgress(player, s.id);
      const progress = Math.min(have, total, 255);
      if (s.progress !== progress) s.progress = progress;
    }
  }
}

/** `quest.accept {questId}` (locked call site in `sim/Commands.ts`): at its giver, at most `quests.maxActive`, once. */
export function handleQuestAccept(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  if (payload.questId === CONTRACT_QUEST) return acceptContract(room, sessionId);
  const found = questFor(room, sessionId, payload);
  if (!found) return;
  const { player, quest } = found;
  if (stateOf(player, quest.id)) {
    reject(room, sessionId, 'TASK_TAKEN');
    return;
  }
  const active = player.priv.quests.filter((s) => !s.done).length;
  if (active >= balance.quests.maxActive) {
    reject(room, sessionId, 'TOO_MANY_QUESTS');
    return;
  }
  const state = new QuestState();
  state.id = quest.id;
  state.progress = Math.min(wantProgress(player, quest.id).have, 255);
  state.done = false;
  player.priv.quests.push(state);
}

/**
 * `quest.turnIn {questId}` (locked call site in `sim/Commands.ts`): takes the wanted items and gives the reward
 * through the inventory, or refuses and changes nothing (missing items, or no room for the reward).
 */
export function handleQuestTurnIn(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  const found = questFor(room, sessionId, payload);
  if (!found) return;
  const { player, quest } = found;
  const state = stateOf(player, quest.id);
  if (!state || state.done) {
    reject(room, sessionId, 'BAD_REQUEST');
    return;
  }
  if (quest.wants.some((w) => count(player, w.item) < w.qty)) {
    reject(room, sessionId, 'NEED_MATERIALS');
    return;
  }
  if (!exchange(player, quest.wants, quest.reward)) {
    reject(room, sessionId, 'PACK_FULL');
    return;
  }
  state.done = true;
  state.progress = Math.min(
    quest.wants.reduce((n, w) => n + w.qty, 0),
    255,
  );
}
