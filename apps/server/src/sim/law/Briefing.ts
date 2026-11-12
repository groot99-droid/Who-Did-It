import { type SceneId, balance, clues as clueDefs, laws, scenes, traits } from '@wdi/content';
import { ClueKind, Phase, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { systemLine } from '../economy/rumours';
import { emitSim, onSim } from '../events/bus';
import { simOf } from '../RoomSim';
import { runJail } from './Jail';
import { runEndTrial } from './EndTrial';
import { runTribunal } from './Tribunal';
import { runManhunt } from './Manhunt';
import { runPetition } from './Petition';
import { figuresOf } from '../townsfolk/figures';

/**
 * The Constables' briefing (round 10, B2; GDD 3.31, `world-mode.md` 3.1, `phases.md` 13.3; seams.md 3 row 8).
 * Every clue the world makes that a seat could collect is read by the Constables the way a collector reads it,
 * `clues.collectHoldS / law.speedMult` after it appears (they keep their posts, F4 2.2, so they never walk to it),
 * and `law.briefingAfterS` after it appeared they post one public line naming its kind, its scene and, for a clue
 * whose reader is "anyone" (GDD 3.4), the trait the clue object holds. A role's reading (the felt's hat, the prints)
 * is never briefed, nor whether a clue is Forged; a briefing marks nothing Verified, writes no Notebook entry and
 * changes no clue. Not briefed: the teaching clue, a kind no one can collect (a body, a Hungry Killer's trail), a
 * clue gone or collected before its time, and the same words again within `law.briefingAfterS`. While no Constable
 * is alive there is none (proposed; a knocked-out Constable is alive). It opens no screen, holds nothing and waits on
 * nobody.
 */

interface Pending {
  clueId: string;
  sceneId: SceneId;
  kind: number;
  value: number;
  readTick: number;
  dueTick: number;
}

/** One posted briefing, kept in order for the police board (B3) and the Constables' own petitions (B3c). */
export interface Briefing {
  tick: number;
  sceneId: SceneId;
  line: string;
  /** The clue's `ClueKind`, and the trait axis and value the line named (an "anyone" clue read in time), if any. */
  kind: number;
  axis?: keyof typeof traits.axes;
  value?: number;
}

interface LawMemory {
  pending: Pending[];
  posted: Briefing[];
  /** Each line's last posting tick: the same words twice within `law.briefingAfterS` post once. */
  said: Map<string, number>;
}

const TEACHING = 'clue_teaching';

/** `ClueKind` number -> its `clues.json` key (`footprints`, `thread`, ...). */
const KIND_KEY = new Map<number, string>(Object.entries(ClueKind).map(([k, v]) => [v, k]));

const memories = new WeakMap<PartyRoom, LawMemory>();
function memoryOf(room: PartyRoom): LawMemory {
  const memory = memories.get(room);
  if (memory) return memory;
  const m: LawMemory = { pending: [], posted: [], said: new Map() };
  memories.set(room, m);
  onSim(room, 'clue', (e) => {
    const id = e.data?.id;
    if (typeof id !== 'string' || id === TEACHING || e.sceneId === undefined) return;
    const clue = room.state.scenes.get(e.sceneId)?.clues.get(id);
    if (!clue || clueDefs.clues[KIND_KEY.get(clue.kind) ?? '']?.collectible !== true) return;
    m.pending.push({
      clueId: id,
      sceneId: e.sceneId as SceneId,
      kind: clue.kind,
      value: clue.value,
      readTick: e.tick + Math.round((balance.clues.collectHoldS / balance.law.speedMult) * TICK_RATE),
      dueTick: e.tick + Math.round(balance.law.briefingAfterS * TICK_RATE),
    });
  });
  return m;
}

/** The briefings posted this match, oldest first (the police board of B3 reads them). */
export const briefingsOf = (room: PartyRoom): readonly Briefing[] => memoryOf(room).posted;

/** The trait axis an "anyone" clue names (traits.json), else undefined. */
function axisOf(key: string): keyof typeof traits.axes | undefined {
  if (clueDefs.clues[key]?.reader !== 'anyone') return undefined;
  return (Object.keys(traits.axes) as (keyof typeof traits.axes)[]).find((a) => traits.axes[a].clue === key);
}

/** The trait a clue names: only an "anyone" clue whose kind is a trait axis's clue (traits.json), else undefined. */
function traitOf(key: string, value: number): string | undefined {
  const axis = axisOf(key);
  return axis === undefined ? undefined : traits.axes[axis].values[value]?.label.toLowerCase();
}

const fill = (template: string, words: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => words[k] ?? '');

/** The briefing's words for a clue, once read (exported for the tests). */
export function briefingLine(p: Pick<Pending, 'sceneId' | 'kind' | 'value'>, read: boolean): string {
  const key = KIND_KEY.get(p.kind) ?? '';
  const clue = (clueDefs.clues[key]?.name ?? key).toLowerCase();
  const scene = scenes[p.sceneId]?.name ?? p.sceneId;
  const trait = read ? traitOf(key, p.value) : undefined;
  const lines = laws.briefing;
  if (!lines) return '';
  return trait === undefined
    ? fill(lines.line, { clue, scene })
    : fill(lines.withTrait, { clue, scene, trait });
}

/** The law's tick (the locked `runLaw` line of `sim/Step.ts`, after the clue decay): due briefings go out. */
export function runLaw(room: PartyRoom): void {
  runPetition(room); // round 10, B3: petitions
  runManhunt(room); // round 10, B4: the manhunt
  runJail(room); // round 10, B5: the county jail
  runTribunal(room); // round 10, B6a: the Tribunal
  runEndTrial(room); // round 10, B6d: the Final Night's end trial
  const memory = memoryOf(room);
  if (room.state.phase === Phase.lobby) {
    memory.pending = [];
    memory.posted = [];
    memory.said.clear();
    return;
  }
  const tick = room.state.tick;
  if (!memory.pending.some((p) => p.dueTick <= tick)) return;
  const due = memory.pending.filter((p) => p.dueTick <= tick);
  memory.pending = memory.pending.filter((p) => p.dueTick > tick);
  if (![...figuresOf(room).values()].some((f) => f.kind === 'constable' && !f.dead)) return;
  const sim = simOf(room);
  const window = Math.round(balance.law.briefingAfterS * TICK_RATE);
  for (const p of due) {
    const clue = room.state.scenes.get(p.sceneId)?.clues.get(p.clueId);
    if (!sim.clueMeta.has(p.clueId) || !clue || clue.claimed) continue; // gone or collected before its time
    const line = briefingLine(p, p.readTick <= tick);
    if (line === '') continue;
    const last = memory.said.get(line);
    if (last !== undefined && tick - last < window) continue;
    memory.said.set(line, tick);
    const read = p.readTick <= tick;
    const axis = read ? axisOf(KIND_KEY.get(p.kind) ?? '') : undefined;
    memory.posted.push({
      tick,
      sceneId: p.sceneId,
      line,
      kind: p.kind,
      ...(axis !== undefined && { axis, value: p.value }),
    });
    systemLine(room, line);
    const trait = traitOf(KIND_KEY.get(p.kind) ?? '', p.value);
    emitSim(room, {
      tick,
      kind: 'briefing',
      sceneId: p.sceneId,
      data: { clueId: p.clueId, kind: p.kind, ...(trait !== undefined && { trait }) },
    });
  }
}
