import { balance, economy, looks, scenes } from '@wdi/content';
import { NoteKind, NotebookEntry, NotebookStatus, Phase, S2C, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { mapScenesOf } from '../MapSites';
import { simOf } from '../RoomSim';
import { isVerbPhase, sceneIndex, sceneKey, tileCentre } from '../World';

/**
 * Rumours (round 8, GDD 3.23, docs/round8/economy.md 3), Session 8D. The rumour ledger samples, every
 * `notices.sampleS`, which drawn looks stand in a scene that holds at least two figures: a figure is only ever
 * written down where someone else could have seen it. The Train's delivery fills the mailbag with
 * `notices.slipsPerBag` ledger slips from the sightings since the last bag, night first, one per look; whoever
 * collects it (`act.hold {action: 'mailbag'}`) receives them as Blackmail Notices, private Notebook entries of
 * `NoteKind.notice` whose `of` is the look the slip names (never a seat, never a card). A notice is shown at a
 * meeting, burnt, or fenced; one left a whole day cycle is printed by the Gazette at the next meeting. Room memory
 * keyed by the match's `MatchSeeds`; nothing here draws a random number.
 */

/** One thing an observer could have seen: a figure in a look, in a scene, in a part of the day. */
export interface Sighting {
  look: string;
  sceneIdx: number;
  phase: number;
  round: number;
  tick: number;
}

/** A notice in some seat's Notebook: the slip it was made from, its holder, and the round it was made in. */
export interface Notice extends Sighting {
  id: string;
  holder: string;
  madeRound: number;
}

interface Ledger {
  sightings: Sighting[];
  nextSampleTick: number;
  /** The slips waiting in the mailbag, or null while it is empty. */
  bag: Sighting[] | null;
  notices: Map<string, Notice>;
  seq: number;
}

const ledgers = new WeakMap<object, Ledger>();

export function ledgerOf(room: PartyRoom): Ledger {
  let l = ledgers.get(room.seeds);
  if (!l) {
    l = { sightings: [], nextSampleTick: 0, bag: null, notices: new Map(), seq: 0 };
    ledgers.set(room.seeds, l);
  }
  return l;
}

/** The bag carries spare slips for a collector with the `slipsExtra` perk (GDD 3.23). */
const RESERVE = Math.max(
  0,
  ...Object.values(economy.hq.stations).flatMap((s) => s.tiers.map((t) => t.perks.slipsExtra ?? 0)),
);
/** Sightings kept between bags; the oldest go first. */
const KEEP = 64;
const PHASE_WORD: Record<number, string> = {
  [Phase.grace]: 'by day',
  [Phase.day]: 'by day',
  [Phase.dusk]: 'at dusk',
  [Phase.night]: 'at night',
  [Phase.finalNight]: 'on the last night',
};
const isDark = (phase: number) => phase === Phase.night || phase === Phase.finalNight;

/**
 * The drawn look of every placed living figure, by scene index. A jail scene is left out (round 10, B5c, seams.md 3
 * row 19): the figures in the cell are seen by their cellmates only, so no notice, Gazette line or tip names the cell.
 */
function figuresByScene(room: PartyRoom): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const [idx, key] of scenesWithAvatars(room)) {
    if (scenes[key].kind === 'jail') continue;
    const looksHere: string[] = [];
    room.state.scenes.get(key)?.avatars.forEach((a) => {
      const look = room.state.players.get(a.lookOf)?.look ?? '';
      if (look !== '') looksHere.push(look);
    });
    if (looksHere.length > 0) out.set(idx, looksHere);
  }
  return out;
}

function scenesWithAvatars(room: PartyRoom): Array<[number, ReturnType<typeof sceneKey>]> {
  const idx = new Set<number>();
  for (const p of simOf(room).players.values()) if (p.placed && !p.dead) idx.add(p.sceneIdx);
  return [...idx].sort((a, b) => a - b).map((i) => [i, sceneKey(i)]);
}

/** Step stage (inside `runEconomy`): samples the sightings while the world runs. */
export function runRumours(room: PartyRoom): void {
  const { phase, tick, round } = room.state;
  if (!isVerbPhase(phase) || PHASE_WORD[phase] === undefined) return;
  const ledger = ledgerOf(room);
  if (tick < ledger.nextSampleTick) return;
  ledger.nextSampleTick = tick + Math.max(1, Math.round(economy.notices.sampleS * balance.tickHz));
  for (const [sceneIdx, here] of figuresByScene(room)) {
    if (here.length < 2) continue;
    for (const look of new Set(here)) ledger.sightings.push({ look, sceneIdx, phase, round, tick });
  }
  if (ledger.sightings.length > KEEP) ledger.sightings.splice(0, ledger.sightings.length - KEEP);
}

/** The bus's `train.delivery`: the mailbag fills with the day's slips (replacing an uncollected bag). */
export function onDeliveryRumours(room: PartyRoom): void {
  if (!mailbagOf(room)) return;
  const ledger = ledgerOf(room);
  const ordered = [...ledger.sightings].sort(
    (a, b) => Number(isDark(b.phase)) - Number(isDark(a.phase)) || b.tick - a.tick,
  );
  const slips: Sighting[] = [];
  for (const s of ordered) {
    if (slips.length >= economy.notices.slipsPerBag + RESERVE) break;
    if (!slips.some((t) => t.look === s.look)) slips.push(s);
  }
  ledger.sightings = [];
  ledger.bag = slips.length > 0 ? slips : null;
}

/** The mailbag prop of the room's map (on the hub, by the Train's platform), when it has one. */
export function mailbagOf(room: PartyRoom): { sceneIdx: number; x: number; y: number; id: string } | null {
  for (const sceneId of mapScenesOf(room)) {
    const prop = scenes[sceneId].props.find((p) => economy.notices.mailbags.includes(p.id));
    if (!prop) continue;
    const x = tileCentre(prop.x, TILE_PX);
    return { sceneIdx: sceneIndex(sceneId), x, y: tileCentre(prop.y, TILE_PX), id: prop.id };
  }
  return null;
}

/** Whether the mailbag holds slips waiting for a collector. */
export const bagFull = (room: PartyRoom): boolean => ledgerOf(room).bag !== null;

/**
 * The collector receives `notices.slipsPerBag` slips plus `extra` (an HQ perk) as notices, up to `maxHeld` held at
 * once; the bag is empty afterwards, whatever it could not carry.
 */
export function collectMailbag(room: PartyRoom, seat: string, maxHeld: number, extra = 0): number {
  const ledger = ledgerOf(room);
  const player = room.state.players.get(seat);
  if (!ledger.bag || !player?.priv) return 0;
  const free = Math.max(0, maxHeld - heldBy(room, seat).length);
  const take = ledger.bag.slice(0, Math.min(free, economy.notices.slipsPerBag + extra));
  ledger.bag = null;
  for (const slip of take) {
    const id = `notice_${++ledger.seq}`;
    ledger.notices.set(id, { ...slip, id, holder: seat, madeRound: room.state.round });
    const entry = new NotebookEntry();
    entry.id = id;
    entry.clueKind = 0;
    entry.value = slip.phase;
    entry.sceneId = slip.sceneIdx;
    entry.tick = slip.tick;
    entry.status = NotebookStatus.verified;
    entry.note = NoteKind.notice;
    entry.of = slip.look;
    player.priv.notebook.push(entry);
    emitSim(room, { tick: room.state.tick, kind: 'notice.made', seat, data: { noticeId: id } });
  }
  return take.length;
}

/** The notices a seat holds, oldest first. */
export function heldBy(room: PartyRoom, seat: string): Notice[] {
  return [...ledgerOf(room).notices.values()].filter((n) => n.holder === seat);
}

/** Takes a notice out of the ledger and out of its holder's Notebook. */
export function dropNotice(room: PartyRoom, id: string): Notice | null {
  const ledger = ledgerOf(room);
  const notice = ledger.notices.get(id);
  if (!notice) return null;
  ledger.notices.delete(id);
  const book = room.state.players.get(notice.holder)?.priv?.notebook;
  const at = book?.findIndex((e) => e.id === id) ?? -1;
  if (book && at >= 0) book.splice(at, 1);
  return notice;
}

/** The line a notice reads out (UI.md 14.35): what was seen, never who. */
export function noticeLine(n: Sighting): string {
  const look = looks.looks[n.look]?.name ?? 'a stranger';
  const place = scenes[sceneKey(n.sceneIdx)]?.name ?? 'somewhere';
  return `A figure in ${look}'s look was in ${place} ${PHASE_WORD[n.phase] ?? 'by day'}.`;
}

/** Sends a system line to every seat's log. */
export function systemLine(room: PartyRoom, text: string): void {
  for (const client of room.clients) client.send(S2C.chatMsg, { from: '', text, channel: 'system' });
}

/**
 * Meeting start (locked hook): every notice made `notices.gazetteAfterRounds` rounds ago or earlier, neither shown
 * nor cleansed, is printed for everyone and leaves its holder's Notebook.
 */
export function gazette(room: PartyRoom): void {
  const due = economy.notices.gazetteAfterRounds;
  for (const n of [...ledgerOf(room).notices.values()]) {
    if (room.state.round - n.madeRound < due) continue;
    dropNotice(room, n.id);
    systemLine(room, `The Gazette prints: ${noticeLine(n)}`);
    emitSim(room, { tick: room.state.tick, kind: 'notice.gazette', data: { noticeId: n.id } });
  }
}
