import { balance, items, quests, scenes } from '@wdi/content';
import { ErrorCode, ItemStack, Phase, QuestState, TILE_PX, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { type PlayerSim, simOf } from './RoomSim';
import { isLoft, isVerbPhase, reject, sceneKey, tileCentre } from './World';

/**
 * Quests (round 6, M5b, GDD 3.16; docs/round6/m5b-data.md 2.3): givers are scene statics; `quest.accept` and
 * `quest.turnIn` go through the command queue; the own `Private.quests` holds the state; rewards go through
 * `sim/Inventory.ts`. A `contract` quest (round 7) refuses. Session 6H.
 */

// ---- Stand-in for 6F's `sim/Inventory.ts` (same names). Delete this block and import `addStack` and `take` from
// './Inventory' when 6F lands; nothing below depends on the stand-in's body. ----

const stackLimit = (defId: string): number =>
  items.items[defId]?.kind === 'material' ? balance.resources.stackMax : 1;

/** How many of `defId` the seat carries. */
function count(player: PlayerState, defId: string): number {
  let n = 0;
  for (const s of player.priv.inventory.slots) if (s.defId === defId) n += s.qty;
  return n;
}

/** Adds `qty` of `defId`, topping up stacks first; false (and nothing added) when it does not fit. */
function addStack(player: PlayerState, defId: string, qty: number): boolean {
  const slots = player.priv.inventory.slots;
  const limit = stackLimit(defId);
  let room = 0;
  for (const s of slots) if (s.defId === defId) room += Math.max(0, limit - s.qty);
  const free = Math.max(0, items.inventorySlots - slots.length);
  if (room + free * limit < qty) return false;
  let left = qty;
  for (const s of slots) {
    if (s.defId !== defId || left === 0) continue;
    const put = Math.min(left, limit - s.qty);
    s.qty += put;
    left -= put;
  }
  while (left > 0) {
    const put = Math.min(left, limit);
    const stack = new ItemStack();
    stack.defId = defId;
    stack.qty = put;
    slots.push(stack);
    left -= put;
  }
  return true;
}

/** Removes `qty` of `defId`; false (and nothing removed) when the seat carries fewer. */
function take(player: PlayerState, defId: string, qty: number): boolean {
  if (count(player, defId) < qty) return false;
  const slots = player.priv.inventory.slots;
  let left = qty;
  for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
    const s = slots[i]!;
    if (s.defId !== defId) continue;
    const out = Math.min(left, s.qty);
    s.qty -= out;
    left -= out;
    if (s.qty === 0) slots.splice(i, 1);
  }
  return true;
}

/** The slots as plain rows, to put back if a turn-in cannot finish. */
const snapshot = (player: PlayerState): { defId: string; qty: number }[] =>
  player.priv.inventory.slots.map((s) => ({ defId: s.defId, qty: s.qty }));

function restore(player: PlayerState, rows: { defId: string; qty: number }[]): void {
  const slots = player.priv.inventory.slots;
  slots.clear();
  for (const r of rows) {
    const stack = new ItemStack();
    stack.defId = r.defId;
    stack.qty = r.qty;
    slots.push(stack);
  }
}

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
function speakProblem(room: PartyRoom, p: PlayerSim | undefined): { code: ErrorCode; msg: string } | null {
  if (!isVerbPhase(room.state.phase)) return { code: ErrorCode.wrongPhase, msg: 'not now' };
  if (!p || p.dead || !p.placed || isLoft(p.sceneIdx)) return { code: ErrorCode.cannot, msg: 'not now' };
  if (room.state.tick < p.busyUntilTick) return { code: ErrorCode.busy, msg: 'busy' };
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
  const refuse = (code: ErrorCode, msg: string) => {
    reject(room, sessionId, code, msg);
    return null;
  };
  const id = payload.questId;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64)
    return refuse(ErrorCode.cannot, 'cannot do that');
  const quest = quests.quests[id];
  if (!quest || quest.kind !== 'fetch') return refuse(ErrorCode.cannot, 'cannot do that');
  const problem = speakProblem(room, p);
  if (problem) return refuse(problem.code, problem.msg);
  if (!giverInReach(p, quest.giver)) return refuse(ErrorCode.outOfRange, 'too far');
  return { player, quest };
}

/** A new match starts clean: the lobby and the role card hold no quest (the reset in `Win.ts` is not ours to edit). */
const BEFORE_PLAY: ReadonlySet<number> = new Set([Phase.lobby, Phase.roleReveal]);

/** Step stage after `runMobs` (locked call site in `sim/Step.ts`): progress follows the inventory. */
export function runQuests(room: PartyRoom): void {
  const clear = BEFORE_PLAY.has(room.state.phase);
  for (const player of room.state.players.values()) {
    const list = player.priv?.quests;
    if (!list || list.length === 0) continue;
    if (clear) {
      list.clear();
      continue;
    }
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
  const found = questFor(room, sessionId, payload);
  if (!found) return;
  const { player, quest } = found;
  if (stateOf(player, quest.id)) {
    reject(room, sessionId, ErrorCode.cannot, 'already taken');
    return;
  }
  const active = player.priv.quests.filter((s) => !s.done).length;
  if (active >= balance.quests.maxActive) {
    reject(room, sessionId, ErrorCode.cannot, 'too many quests');
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
    reject(room, sessionId, ErrorCode.cannot, 'not taken');
    return;
  }
  if (quest.wants.some((w) => count(player, w.item) < w.qty)) {
    reject(room, sessionId, ErrorCode.cannot, 'you lack what is wanted');
    return;
  }
  const before = snapshot(player);
  for (const w of quest.wants) take(player, w.item, w.qty);
  if (!quest.reward.every((r) => addStack(player, r.item, r.qty))) {
    restore(player, before);
    reject(room, sessionId, ErrorCode.cannot, 'no room for the reward');
    return;
  }
  state.done = true;
  state.progress = Math.min(
    quest.wants.reduce((n, w) => n + w.qty, 0),
    255,
  );
}
