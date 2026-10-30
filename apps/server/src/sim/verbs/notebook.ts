import { NotebookEntry, S2C, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import type { ClueMeta, PlayerSim } from '../RoomSim';

// Round 10, V1 (10V): what the evidence verbs keep about a clue, in room memory only. Keyed by the clue's `ClueMeta`,
// which every spawn makes new, so nothing outlives its clue or its match. No field here reaches any client.

interface ClueSecret {
  /** Laid by Plant Clue: a Lens Inspect reads the clue Forged (GDD 3.2). */
  planted: boolean;
  /** The value only a Lens reads (GDD 3.4 "hidden attribute"); undefined when the public value is the whole clue. */
  hidden?: number;
}

const secrets = new WeakMap<ClueMeta, ClueSecret>();
/** The Notebook entry each seat wrote for a clue: seat id -> entry id. */
const entries = new WeakMap<ClueMeta, Map<string, string>>();

export function markPlanted(meta: ClueMeta): void {
  secrets.set(meta, { ...secrets.get(meta), planted: true });
}

export function isPlanted(meta: ClueMeta): boolean {
  return secrets.get(meta)?.planted === true;
}

export function hiddenValue(meta: ClueMeta): number | undefined {
  return secrets.get(meta)?.hidden;
}

/** The seat's own Notebook entry for the clue, if it wrote one. */
export function entryFor(player: PlayerState, sessionId: string, meta: ClueMeta) {
  const id = entries.get(meta)?.get(sessionId);
  return id === undefined ? undefined : player.priv.notebook.find((e) => e.id === id);
}

/** Writes the seat's own entry for a clue it collected or inspected and tells its client (`clueFound`). */
export function writeClueEntry(
  room: PartyRoom,
  sessionId: string,
  player: PlayerState,
  p: PlayerSim,
  clue: { kind: number; value: number },
  meta: ClueMeta,
  status: number,
): void {
  const entry = new NotebookEntry();
  entry.id = `entry_${++p.entrySeq}`;
  entry.clueKind = clue.kind;
  entry.value = clue.value;
  entry.sceneId = p.sceneIdx;
  entry.tick = room.state.tick;
  entry.status = status;
  player.priv.notebook.push(entry);
  const bySeat = entries.get(meta) ?? new Map<string, string>();
  bySeat.set(sessionId, entry.id);
  entries.set(meta, bySeat);
  room.clients.getById(sessionId)?.send(S2C.clueFound, { entryId: entry.id });
}
