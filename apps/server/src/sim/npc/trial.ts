import { balance, roles } from '@wdi/content';
import { EntryWeight, type PlayerState, TribunalStep } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { endTrialOpen, handleFile } from '../law/EndTrial';
import { isJailed } from '../law/Jail';
import { attachable, backedEntry } from '../law/Petition';
import {
  clueKey,
  handlePresent,
  presentedBy,
  presentedWeight,
  scaleKeys,
  tribunalOpen,
} from '../law/Tribunal';
import type { PlayerSim } from '../RoomSim';
import { isOnLine } from '../Train';
import { type Brain, trialChanceRng, trialTickRng } from './memory';
import { npcVoteTarget } from './meeting';

/**
 * NPC seats present and file (round 10, B6d2; GDD 3.12, seams.md 3 row 35). Every NPC seat, whatever its card or
 * Notebook, draws a tick over `npc.trial.windowFrac` of each Tribunal step or of the end trial's filing and a chance
 * roll, each from its own stream (`trialTick:<seat>`, `trialChance:<seat>`), so the draws never depend on what the
 * seat holds. At its tick, with `presentChance` (Tribunal) or `fileChance` (end trial), it does what a human can do
 * through the same handler: present its backed entries against the accused, or file a murder charge against the seat
 * its vote rule would pick. A seat with no backed entry does nothing, and nothing waits on it.
 */

const factionOf = (room: PartyRoom, id: string): string =>
  roles.roles[room.state.players.get(id)?.priv.role.roleId ?? '']?.faction ?? 'village';

/** The seat's backed Notebook entries that weigh `want` against `accused`, off the scales, in Notebook order. */
function backedAgainst(room: PartyRoom, player: PlayerState, accused: string, want: number) {
  const taken = scaleKeys(room);
  return player.priv.notebook.filter(
    (e) =>
      attachable(e) &&
      backedEntry(e) &&
      !taken.has(clueKey(e.clueKind, e.sceneId, e.value)) &&
      presentedWeight(room, player.id, e, accused) === want,
  );
}

export function runTrialNpc(room: PartyRoom, brain: Brain, player: PlayerState, p: PlayerSim): void {
  const t = room.state.tribunal;
  const filing = endTrialOpen(room) && t.step === TribunalStep.filing;
  const presenting = tribunalOpen(room) && (t.step === TribunalStep.case || t.step === TribunalStep.defence);
  if (!filing && !presenting) return;
  const id = player.id;
  const key = `${filing ? 'file' : 'present'}:${t.step}:${t.untilTick}`;
  if (brain.trialKey !== key) {
    // Card-blind: both draws are made for the step by every seat, living or not, before anything is looked at.
    const f = balance.npc.trial.windowFrac;
    const tick = room.state.tick;
    const span = Math.max(0, t.untilTick - tick);
    brain.trialKey = key;
    brain.trialAtTick = tick + Math.round(span * (f.min + trialTickRng(room, id)() * (f.max - f.min)));
    brain.trialRoll = trialChanceRng(room, id)();
    brain.trialActed = false;
  }
  if (brain.trialActed || room.state.tick < brain.trialAtTick) return;
  brain.trialActed = true;
  if (p.dead || isOnLine(room, id)) return;
  const chance = filing ? balance.npc.trial.fileChance : balance.npc.trial.presentChance;
  if (brain.trialRoll >= chance) return;

  const cap = balance.meeting.presentPerPlayer;
  if (filing) {
    if (isJailed(room, id)) return;
    const accused = npcVoteTarget(room, id, undefined, true);
    if (accused === null) return;
    const entries = backedAgainst(room, player, accused, EntryWeight.match).slice(0, cap);
    if (entries.length === 0) return;
    handleFile(room, id, { accused, charge: 'murder', entries: entries.map((e) => e.id) });
    return;
  }
  // The case: a witness presents what fits the accused; the defence: the accused presents what clears it.
  const accusedSelf = id === t.accused;
  if (accusedSelf !== (t.step === TribunalStep.defence)) return;
  if (!accusedSelf && isJailed(room, id)) return;
  if (!accusedSelf && factionOf(room, id) === 'cabal' && factionOf(room, t.accused) === 'cabal') return;
  const want = accusedSelf ? EntryWeight.exclusion : EntryWeight.match;
  const left = cap - presentedBy(room, id);
  for (const e of backedAgainst(room, player, t.accused, want).slice(0, Math.max(0, left))) {
    handlePresent(room, id, { entryId: e.id });
  }
}
