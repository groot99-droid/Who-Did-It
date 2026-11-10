import { balance, roles } from '@wdi/content';
import { ItemStack, type PlayerState, TaskEntry, Team, type TeamId, shuffle } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { ensureBody } from '../body/state';
import { mapScenesOf } from '../MapSites';
import { npcMemory } from '../npc/memory';
import { releaseClaims } from '../npc/routine';
import { publishLooks } from '../Covers';
import { simOf } from '../RoomSim';
import { resetProgress } from '../vendettas/progress';
import { setVendetta, vendettaOf } from '../vendettas/state';
import { taskPool } from '../Tasks';
import { countRow } from '../Flow';
import { profileOfRoom } from '../npc/routine';

/**
 * The seat handover (docs/story/README.md 2, GDD 3.34). Seats are bound to their clients by seat id, so a chapter
 * break moves the *card*, not the seat: the human's seat and the seat that holds the chapter's card exchange the
 * card-bound fields (card, kit, look, traits, name), the holder's brain starts over on the old card (it carries on
 * its routine from where it stands), the human's private view is cleared, and a dead human is made whole. Purse,
 * body and position stay with the seat.
 */

/**
 * The NPC seat that takes the old card when the new one is undealt (the deck holds more cards than the table has
 * seats): the first NPC seat in seat order that holds a Village card and no chapter's card, so a Killer never loses
 * its seat to the break; its own card leaves play. Null when there is none.
 */
function spareSeat(room: PartyRoom, humanId: string, keep: ReadonlySet<string>): string | null {
  for (const [id, player] of room.state.players) {
    const card = player.priv?.role.roleId ?? '';
    if (id === humanId || keep.has(card)) continue;
    if (roles.roles[card]?.faction === 'village') return id;
  }
  return null;
}

/** The seat other than `humanId` that holds `roleId`, or null when the card is undealt. */
export function holderOf(room: PartyRoom, humanId: string, roleId: string): string | null {
  for (const [id, player] of room.state.players)
    if (id !== humanId && player.priv?.role.roleId === roleId) return id;
  return null;
}

interface Card {
  roleId: string;
  team: number;
  slots: { defId: string; qty: number; slot: number }[];
  selected: number;
  look: string;
  height: number;
  scarf: number;
  hat: number;
  name: string;
}

function takeCard(player: PlayerState): Card {
  const priv = player.priv;
  return {
    roleId: priv.role.roleId,
    team: priv.role.team,
    slots: [...priv.inventory.slots].map((s) => ({ defId: s.defId, qty: s.qty, slot: s.slot })),
    selected: priv.inventory.selected,
    look: player.look,
    height: player.traits.height,
    scarf: player.traits.scarf,
    hat: player.traits.hat,
    name: player.name,
  };
}

function putCard(player: PlayerState, card: Card): void {
  const priv = player.priv;
  priv.role.roleId = card.roleId;
  priv.role.team = card.team;
  priv.role.evolvedFrom = '';
  priv.inventory.slots.clear();
  for (const s of card.slots) {
    const stack = new ItemStack();
    stack.defId = s.defId;
    stack.qty = s.qty;
    stack.slot = s.slot;
    priv.inventory.slots.push(stack);
  }
  priv.inventory.selected = card.selected;
  player.look = card.look;
  player.traits.height = card.height;
  player.traits.scarf = card.scarf;
  player.traits.hat = card.hat;
  player.name = card.name;
}

/** Empties everything a seat's own view holds that is not the card: notebook, ledger, quests, cooldowns, tasks. */
export function clearPrivateView(player: PlayerState): void {
  const priv = player.priv;
  priv.notebook.clear();
  priv.ledger.clear();
  priv.quests.clear();
  priv.tasks.clear();
  priv.cooldownEndTick.clear();
  priv.lensCharges = 0;
  priv.myVote = '';
  priv.coverLook = '';
  priv.mateLooks.clear();
  priv.petitionSigned = false;
  priv.huntScene = '';
}

/** A fresh task list for a human seat, as the deal draws it (`dealTasks`), on the `tasks` stream. */
function dealOwnTasks(room: PartyRoom, player: PlayerState): void {
  const pool = taskPool(mapScenesOf(room), profileOfRoom(room));
  const count = Math.min(countRow(room.state.players.size).tasksEach, pool.length);
  const faction = roles.roles[player.priv.role.roleId]?.faction;
  if (faction === undefined) return;
  const fake = faction !== 'village';
  if (fake && !balance.tasks.cabalFakeList) return;
  for (const taskId of shuffle(pool, room.seeds.get('tasks')).slice(0, count)) {
    const entry = new TaskEntry();
    entry.id = taskId;
    entry.done = false;
    entry.fake = fake;
    player.priv.tasks.push(entry);
  }
}

/** Cabal mates of every seat, from the cards now held (`startMatch`'s rule). */
function refreshMates(room: PartyRoom): void {
  const factionOf = (id: string) =>
    roles.roles[room.state.players.get(id)?.priv.role.roleId ?? '']?.faction as TeamId;
  const ids = [...room.state.players.keys()];
  for (const id of ids) {
    const faction = factionOf(id);
    const priv = room.state.players.get(id)?.priv;
    if (!priv) continue;
    priv.cabalMates.clear();
    if (faction !== undefined && roles.factions[faction]?.membersKnowEachOther)
      for (const o of ids) if (o !== id && factionOf(o) === faction) priv.cabalMates.push(o);
  }
}

/**
 * Moves `roleId` to the human seat. `look` overrides the card's look (a chapter's `look`). The old card goes to the
 * seat that held the new one, whose brain is reset; with no holder the old card leaves play. A dead human is made
 * whole in place. A vendetta travels with its card: the seat that takes the Killer card takes the holder's vendetta,
 * or `vendetta` when a Killer chapter names one (the Bandit's heist), with its progress started over. A chapter on
 * the card the human already holds (a second Killer chapter) swaps no card. Returns the seat that now holds the old
 * card, or null.
 */
export function switchRole(
  room: PartyRoom,
  humanId: string,
  roleId: string,
  look?: string,
  keep: ReadonlySet<string> = new Set(),
  vendetta?: string,
): string | null {
  const human = room.state.players.get(humanId);
  if (!human) throw new Error(`switchRole: no seat ${humanId}`);
  if (human.priv.role.roleId === roleId) {
    // The same card again: nothing changes hands, the view starts over, the chapter's vendetta is set.
    clearPrivateView(human);
    dealOwnTasks(room, human);
    if (look !== undefined) human.look = look;
    if (vendetta !== undefined) {
      setVendetta(room, humanId, vendetta);
      resetProgress(room, humanId);
    }
    reviveHuman(room, humanId);
    simOf(room).viewsDirty = true;
    return null;
  }
  const holderId = holderOf(room, humanId, roleId) ?? spareSeat(room, humanId, new Set([...keep, roleId]));
  const holder = holderId === null ? undefined : room.state.players.get(holderId);

  const mine = takeCard(human);
  const dealt = holderOf(room, humanId, roleId) !== null;
  const theirs =
    dealt && holder
      ? takeCard(holder)
      : { ...mine, roleId, team: Team[roles.roles[roleId]?.faction as TeamId] };
  if (!dealt) {
    theirs.slots = (roles.roles[roleId]?.startKit ?? []).map((k, i) => ({
      defId: k.item,
      qty: k.qty,
      slot: i,
    }));
    theirs.look = roles.roles[roleId]?.look ?? '';
  }
  putCard(human, theirs);
  if (holder) {
    putCard(holder, mine);
    clearPrivateView(holder);
  }
  // A vendetta stays with its card: the Killer card's holder hands its vendetta over with the card.
  const humanHeld = vendettaOf(room, humanId)?.id ?? null;
  const holderHeld = holderId === null ? null : (vendettaOf(room, holderId)?.id ?? null);
  if (dealt && holderId !== null) {
    setVendetta(room, humanId, holderHeld);
    setVendetta(room, holderId, humanHeld);
    resetProgress(room, humanId);
    resetProgress(room, holderId);
  } else {
    setVendetta(room, humanId, null);
    resetProgress(room, humanId);
  }
  if (vendetta !== undefined) setVendetta(room, humanId, vendetta);
  clearPrivateView(human);
  refreshMates(room);
  dealOwnTasks(room, human);
  publishLooks(room); // both seats walk as their new cards; the human's override follows
  if (look !== undefined) human.look = look;

  if (holderId !== null) {
    const mem = npcMemory(room);
    mem.brains.delete(holderId);
    releaseClaims(mem, holderId);
  }
  reviveHuman(room, humanId);
  simOf(room).viewsDirty = true;
  return holderId;
}

/** A dead human is made whole in place. */
function reviveHuman(room: PartyRoom, humanId: string): void {
  const human = room.state.players.get(humanId);
  const p = simOf(room).players.get(humanId);
  if (human && p?.dead) {
    p.dead = false;
    human.alive = true;
    ensureBody(room, humanId);
  }
}

// --- the cast (arc.md E2) -------------------------------------------------------------------------------------------

const holdsKnife = (card: string): boolean => roles.roles[card]?.abilities.includes('kill') === true;
const isCover = (card: string): boolean => roles.roles[card]?.cover === true;

/**
 * The look a newcomer on a cover card walks as: the look of the first card of the cast that is not a cover card, not
 * the one a Cabal mate already wears (a cover pick is never a mate's, `handleCoverPick`).
 */
function coverFor(room: PartyRoom, cast: readonly string[], seat: string): string {
  const mates = [...(room.state.players.get(seat)?.priv.cabalMates ?? [])];
  const taken = new Set(mates.map((m) => room.state.players.get(m)?.priv.coverLook));
  const looks = cast.filter((c) => !isCover(c)).map((c) => roles.roles[c]?.look ?? '');
  return looks.find((l) => l !== '' && !taken.has(l)) ?? looks[0] ?? '';
}

/** Puts `roleId` on an NPC seat as a newcomer off the morning train: its kit and view are the card's own. */
function seatNewcomer(room: PartyRoom, seat: string, roleId: string): void {
  const player = room.state.players.get(seat);
  const def = roles.roles[roleId];
  if (!player || !def) return;
  const priv = player.priv;
  priv.role.roleId = roleId;
  priv.role.team = Team[def.faction as TeamId];
  priv.role.evolvedFrom = '';
  priv.inventory.slots.clear();
  def.startKit.forEach((k, i) => {
    const stack = new ItemStack();
    stack.defId = k.item;
    stack.qty = k.qty;
    stack.slot = i;
    priv.inventory.slots.push(stack);
  });
  priv.inventory.selected = 0;
  clearPrivateView(player); // an NPC seat holds no task list (`dealTasks`): the newcomer's view is empty
  const mem = npcMemory(room);
  mem.brains.delete(seat);
  releaseClaims(mem, seat);
  reviveHuman(room, seat); // a dead seat is made whole where it lies: the newcomer is a different body
}

/**
 * Makes the table hold the chapter's cast (arc E2). Every card of `cast` that no seat holds is dealt to an NPC seat
 * whose card the cast does not name, dead seats first, then in seat order; a Knife holder never gives up its seat, and
 * the human's seat is the handover's. The card comes as a newcomer: the seat's kit and private view are the card's own, a cover card walks as another card of the cast, and the Cabal's mates are drawn again. Returns the seats
 * that changed, in order. A cast card with no seat to take it (more cards than free seats) stays undealt.
 */
export function castTable(room: PartyRoom, humanId: string, cast: readonly string[]): string[] {
  const named = new Set(cast);
  const held = new Set<string>();
  for (const player of room.state.players.values()) held.add(player.priv?.role.roleId ?? '');
  const free = [...room.state.players.entries()]
    .filter(
      ([id, p]) =>
        id !== humanId && !named.has(p.priv?.role.roleId ?? '') && !holdsKnife(p.priv?.role.roleId ?? ''),
    )
    .map(([id]) => id)
    .sort(
      (a, b) =>
        Number(simOf(room).players.get(b)?.dead === true) - Number(simOf(room).players.get(a)?.dead === true),
    );
  const changed: string[] = [];
  for (const card of cast) {
    const seat = free[0];
    if (held.has(card) || holdsKnife(card) || seat === undefined) continue;
    free.shift();
    seatNewcomer(room, seat, card);
    held.add(card);
    changed.push(seat);
  }
  if (changed.length === 0) return changed;
  refreshMates(room);
  for (const seat of changed) {
    const priv = room.state.players.get(seat)?.priv;
    if (priv && isCover(priv.role.roleId)) priv.coverLook = coverFor(room, cast, seat);
  }
  for (const seat of changed) {
    const player = room.state.players.get(seat);
    if (!player) continue;
    player.look = isCover(player.priv.role.roleId)
      ? player.priv.coverLook
      : (roles.roles[player.priv.role.roleId]?.look ?? '');
    for (const mate of player.priv.cabalMates) {
      const look = room.state.players.get(mate)?.priv.coverLook;
      if (look) player.priv.mateLooks.set(mate, look);
    }
  }
  simOf(room).viewsDirty = true;
  return changed;
}
