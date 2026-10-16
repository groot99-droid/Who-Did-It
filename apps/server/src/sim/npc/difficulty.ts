import { balance, type NpcDifficultyRow } from '@wdi/content';
import { NpcLevel } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';

const LEVEL_KEYS = Object.keys(NpcLevel) as (keyof typeof NpcLevel)[];

/**
 * The difficulty row the NPCs play (GDD 3.12): the lobby setting while the party holds at least
 * `npc.difficultyMinNpcs` NPC seats, `npc.defaultDifficulty` otherwise.
 */
export function difficultyRow(room: PartyRoom): NpcDifficultyRow {
  const { npcSeats, npcDifficulty } = room.state.settings;
  const key = npcSeats >= balance.npc.difficultyMinNpcs ? LEVEL_KEYS[npcDifficulty] : undefined;
  return balance.npc.difficulty[key ?? (balance.npc.defaultDifficulty as keyof typeof NpcLevel)];
}
