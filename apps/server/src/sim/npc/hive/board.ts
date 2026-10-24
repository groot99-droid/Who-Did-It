import { balance, type SceneId } from '@wdi/content';
import { NpcLevel, Phase, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../../rooms/PartyRoom';
import { StatusBit } from '../../constants';
import { isWorldPhase } from '../../World';

/**
 * The hive's blackboard (round 8, 8R, A176; docs/round8/living.md 3, GDD 3.25): one per room, read by every NPC seat,
 * townsfolk figure and creature brain. It holds only what anyone standing there could perceive: bodies, creatures,
 * noises, sightings of figures, clues, shouts and the bell, with the phase and the lobby difficulty. Never a card, a
 * cover, a private view, a vendetta or which seats are NPCs: a sighting names the seat whose look is drawn
 * (`Avatar.lookOf`), never the walker, and a body names its dead seat as the public `Body.of` does. The board is the
 * public world; each reader filters it through its own senses. `hiveNoSecrets` (./invariant.ts) checks every entry.
 */

export const FACT_KINDS = ['body', 'creature', 'noise', 'sighting', 'clue', 'shout', 'bell'] as const;
export type FactKind = (typeof FACT_KINDS)[number];

/** The only keys a fact may carry; `hiveNoSecrets` fails any other. */
export const FACT_KEYS: ReadonlySet<string> = new Set([
  'kind',
  'ref',
  'sceneId',
  'x',
  'y',
  'tick',
  'what',
  'of',
  'lookOf',
]);

export interface Fact {
  kind: FactKind;
  /** The body id, creature id, clue id or avatar handle; a serial for a noise, a shout or the bell. */
  ref: string;
  sceneId: SceneId;
  x: number;
  y: number;
  /** The tick it was last perceived. */
  tick: number;
  /** A creature's `mobs.json` kind, a noise's kind, a clue's `ClueKind` index. */
  what?: string;
  /** A body: the dead seat, as `Body.of` shows it. */
  of?: string;
  /** A sighting: the seat whose look the figure draws (`Avatar.lookOf`). */
  lookOf?: string;
}

/** Facts the world no longer shows: heard once, remembered for `npc.hive.memoryS`. */
const TRANSIENT: ReadonlySet<FactKind> = new Set(['noise', 'shout', 'bell']);

export type Level = keyof typeof NpcLevel;
const LEVELS = Object.keys(NpcLevel) as Level[];

export class Blackboard {
  readonly facts = new Map<string, Fact>();
  /** The public state: the phase, and the lobby difficulty setting (GDD 3.12). */
  phase: number = Phase.lobby;
  difficulty: Level = balance.npc.defaultDifficulty as Level;
  private serial = 0;

  /** Posts a heard fact (a noise, a shout, the bell); its ref is a serial, never a seat. */
  hear(
    kind: 'noise' | 'shout' | 'bell',
    sceneId: SceneId,
    x: number,
    y: number,
    tick: number,
    what?: string,
  ): Fact {
    const fact: Fact = {
      kind,
      ref: String(++this.serial),
      sceneId,
      x: Math.round(x),
      y: Math.round(y),
      tick,
    };
    if (what !== undefined) fact.what = what;
    this.facts.set(`${kind}:${fact.ref}`, fact);
    return fact;
  }

  *all(kind: FactKind): IterableIterator<Fact> {
    for (const fact of this.facts.values()) if (fact.kind === kind) yield fact;
  }
}

const boards = new WeakMap<PartyRoom, Blackboard>();
export function hiveOf(room: PartyRoom): Blackboard {
  let board = boards.get(room);
  if (!board) boards.set(room, (board = new Blackboard()));
  return board;
}

/**
 * Rebuilds the board's standing facts from the public world and forgets the heard ones past `npc.hive.memoryS`.
 * Outside a world phase the world shows nothing to perceive, so only the state is kept.
 */
export function refreshBoard(room: PartyRoom): Blackboard {
  const board = hiveOf(room);
  const { state } = room;
  const tick = state.tick;
  board.phase = state.phase;
  board.difficulty = LEVELS[state.settings.npcDifficulty] ?? board.difficulty;
  const keep = Math.round(balance.npc.hive.memoryS * TICK_RATE);
  for (const [key, fact] of board.facts) {
    if (!TRANSIENT.has(fact.kind) || tick - fact.tick > keep || !isWorldPhase(state.phase))
      board.facts.delete(key);
  }
  if (!isWorldPhase(state.phase)) return board;
  state.scenes.forEach((scene, id) => {
    const sceneId = id as SceneId;
    const put = (fact: Fact) => board.facts.set(`${fact.kind}:${fact.ref}`, fact);
    scene.bodies.forEach((b) => {
      if (!b.hidden) put({ kind: 'body', ref: b.id, sceneId, x: b.x, y: b.y, tick, of: b.of });
    });
    scene.mobs.forEach((m) =>
      put({ kind: 'creature', ref: m.id, sceneId, x: m.x, y: m.y, tick, what: m.kind }),
    );
    scene.clues.forEach((c) => {
      if (!c.claimed) put({ kind: 'clue', ref: c.id, sceneId, x: c.x, y: c.y, tick, what: String(c.kind) });
    });
    // A ghost is drawn only for other ghosts (GDD 3.7): no living seat could see it.
    scene.avatars.forEach((a, handle) => {
      if ((a.statusBits & StatusBit.ghost) === 0)
        put({ kind: 'sighting', ref: handle, sceneId, x: a.x, y: a.y, tick, lookOf: a.lookOf });
    });
  });
  return board;
}
