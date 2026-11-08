import { NotebookEntry, NotebookStatus, S2C, type DeathCause } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import type { PlayerSim } from '../RoomSim';
import type { MatchSeeds } from '../seeds';

// Round 10, V1b (10V; GDD 3.2, seams.md 3 row 24): what the Autopsy remembers (Dust and Compare add to it in V1b part b), in room memory keyed by the
// match's seeds (a new match, a new memory), and the writer of a reading into the reader's own Notebook. No field here
// reaches a client except that one entry.

/** What the evidence verbs remember about the match. */
export interface EvidenceMemory {
  /** Victim id -> how and when it died (a body's cause and print). */
  readonly deaths: Map<string, { cause: DeathCause | 'other'; tick: number; killer?: string }>;
}

const memories = new WeakMap<MatchSeeds, EvidenceMemory>();
export function evidenceOf(room: PartyRoom): EvidenceMemory {
  let m = memories.get(room.seeds);
  if (!m) {
    m = { deaths: new Map() };
    memories.set(room.seeds, m);
  }
  return m;
}

/** Call site: `markDead` and a figure's death. A body's print is its knife killer's true seat, else its own. */
export function recordDeath(
  room: PartyRoom,
  victim: string,
  cause: DeathCause | 'other',
  killer?: string,
): void {
  evidenceOf(room).deaths.set(victim, {
    cause,
    tick: room.state.tick,
    ...(killer === undefined ? {} : { killer }),
  });
}

/** Writes a seat's own reading entry (a lift, a comparison or an autopsy) and tells its client. */
export function writeReading(
  room: PartyRoom,
  sessionId: string,
  p: PlayerSim,
  fields: { note: number; clueKind: number; value: number; of: string; tick?: number; sceneIdx?: number },
): InstanceType<typeof NotebookEntry> | null {
  const player = room.state.players.get(sessionId);
  if (!player) return null;
  const entry = new NotebookEntry();
  entry.id = `entry_${++p.entrySeq}`;
  entry.clueKind = fields.clueKind;
  entry.value = fields.value;
  entry.sceneId = fields.sceneIdx ?? p.sceneIdx;
  entry.tick = fields.tick ?? room.state.tick;
  entry.status = NotebookStatus.verified;
  entry.note = fields.note;
  entry.of = fields.of;
  player.priv.notebook.push(entry);
  room.clients.getById(sessionId)?.send(S2C.clueFound, { entryId: entry.id });
  return entry;
}
