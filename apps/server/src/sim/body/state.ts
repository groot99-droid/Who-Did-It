import { type EffectKey, balance } from '@wdi/content';
import { EffectId, EffectState, type Rng } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { simOf } from '../RoomSim';

/**
 * Bodies (round 8, GDD 3.22; docs/round8/body.md 2): every seat's health, stamina and effects, in room memory.
 * The wire is `Private.body` (schema version 6), written by `publishBodies` to its own seat only; the public
 * trace is the round-8 `StatusBit`s and the one-shot clips the figure shows (`overlayBody` in `run.ts`). A ghost
 * has no body. Ambient townsfolk (8E) hold a reduced body under their figure id: health and effects, no stamina.
 */
export interface EffectOn {
  /** Tick it wears off; 0 while it lasts until cured or until its condition ends. */
  untilTick: number;
  stacks: number;
}

export interface Body {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  effects: Map<EffectKey, EffectOn>;
  /** The last tick a hit landed (health regenerates `body.regenAfterS` after it), -1 for never. */
  lastHurtTick: number;
  /** The last tick it ate (Famished after `body.famishedAfterS`). */
  lastAteTick: number;
  /** A one-shot clip (`AnimId`) the figure shows until `clipUntilTick`, -1 for none. */
  clip: number;
  clipUntilTick: number;
  /** A townsfolk figure (8E): no stamina, no `Private` row. */
  figure: boolean;
  /** The effect set last written to the wire, so an unchanged set costs no patch. */
  wireEffects: string;
}

interface BodyMemory {
  bodies: Map<string, Body>;
  /** A test's replacement for the `body` stream of `seeds.ts`; null in play. */
  rng: Rng | null;
}

const memories = new WeakMap<PartyRoom, BodyMemory>();
function memoryOf(room: PartyRoom): BodyMemory {
  let memory = memories.get(room);
  if (!memory) {
    memory = { bodies: new Map(), rng: null };
    memories.set(room, memory);
  }
  return memory;
}

/** Every body by seat or figure id (the tests and the invariants read them). */
export const bodies = (room: PartyRoom): ReadonlyMap<string, Body> => memoryOf(room).bodies;

export const bodyOf = (room: PartyRoom, id: string): Body | undefined => memoryOf(room).bodies.get(id);

/** The body's chance stream, `seeds.get('body')` (no secret draw shares it, A49); a test replaces it with a fixed one. */
export const bodyRng = (room: PartyRoom): Rng => memoryOf(room).rng ?? room.seeds.get('body');
export function setBodyRng(room: PartyRoom, rng: Rng): void {
  memoryOf(room).rng = rng;
}

export function newBody(tick: number, figure = false): Body {
  const b = balance.body;
  return {
    hp: b.maxHp,
    maxHp: b.maxHp,
    stamina: figure ? 0 : b.maxStamina,
    maxStamina: figure ? 0 : b.maxStamina,
    effects: new Map(),
    lastHurtTick: -1,
    lastAteTick: tick,
    clip: -1,
    clipUntilTick: 0,
    figure,
    wireEffects: '',
  };
}

/** The body of a seat or figure, made whole if it has none yet (a figure's has no stamina). */
export function ensureBody(room: PartyRoom, id: string, figure = false): Body {
  const memory = memoryOf(room);
  let body = memory.bodies.get(id);
  if (!body) memory.bodies.set(id, (body = newBody(room.state.tick, figure)));
  return body;
}

/** Drops a body (a death, a figure leaving); the seat's wire row empties. */
export function removeBody(room: PartyRoom, id: string): void {
  if (!memoryOf(room).bodies.delete(id)) return;
  const priv = room.state.players.get(id)?.priv;
  if (priv) writeBody(priv.body, null);
}

/** Match start (the locked line beside the vendetta draw, docs/round8/seams.md 5): every seat whole. */
export function initBodies(room: PartyRoom): void {
  memoryOf(room).bodies.clear();
  for (const id of room.state.players.keys()) ensureBody(room, id);
}

/** The lobby and the card: no bodies, and every wire row empty. */
export function clearBodies(room: PartyRoom): void {
  for (const id of [...memoryOf(room).bodies.keys()]) removeBody(room, id);
}

/** The wire key of an effect set: ids and ticks in map order. */
function effectsKey(body: Body): string {
  let key = '';
  for (const [id, on] of body.effects) key += `${id}:${on.untilTick}:${on.stacks};`;
  return key;
}

/**
 * The effects another system writes straight onto `Private.body.effects` (8D's Indebted, GDD 3.23). The body's
 * writer leaves their rows as it finds them: no decay, no clearing and no reset on a wake, a knockout or a death
 * (6Z's contract note, 2026-10-24); `bodyBounds` counts them out of a dead seat's row for the same reason.
 */
export const FOREIGN_EFFECTS: ReadonlySet<EffectKey> = new Set<EffectKey>(['indebted']);
const FOREIGN_IDS: ReadonlySet<number> = new Set([...FOREIGN_EFFECTS].map((id) => EffectId[id]));
/** Whether a wire row is the body's own (so its writer may touch it), by its `EffectId`. */
export const ownsWireEffect = (wireId: number): boolean => !FOREIGN_IDS.has(wireId);

/** The `Private.body` row shape `writeBody` fills (the schema class, typed by what is written). */
export interface PrivateBody {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  effects: {
    readonly length: number;
    at(i: number): InstanceType<typeof EffectState> | undefined;
    splice(start: number, deleteCount: number): unknown;
    push(e: InstanceType<typeof EffectState>): unknown;
  };
}

/**
 * Copies a body onto its `Private.body` (null empties the row). Unchanged numbers cost no patch bytes; the body's
 * own effect rows are rebuilt only when the set changed, and a foreign row (`FOREIGN_EFFECTS`) is never touched.
 * Health is shown rounded up (1 hit point left reads 1, never 0).
 */
export function writeBody(wire: PrivateBody, body: Body | null): void {
  const hp = body ? Math.ceil(body.hp) : 0;
  const stamina = body ? Math.floor(body.stamina) : 0;
  if (wire.hp !== hp) wire.hp = hp;
  if (wire.maxHp !== (body?.maxHp ?? 0)) wire.maxHp = body?.maxHp ?? 0;
  if (wire.stamina !== stamina) wire.stamina = stamina;
  if (wire.maxStamina !== (body?.maxStamina ?? 0)) wire.maxStamina = body?.maxStamina ?? 0;
  const key = body ? effectsKey(body) : '';
  if (body) {
    if (body.wireEffects === key) return;
    body.wireEffects = key;
  }
  for (let i = wire.effects.length - 1; i >= 0; i--) {
    const row = wire.effects.at(i);
    if (row && ownsWireEffect(row.id)) wire.effects.splice(i, 1);
  }
  if (!body) return;
  for (const [id, on] of body.effects) {
    const e = new EffectState();
    e.id = EffectId[id];
    e.untilTick = on.untilTick;
    e.stacks = on.stacks;
    wire.effects.push(e);
  }
}

/** Every living seat's body onto its own `Private.body`; a dead seat's body is dropped (a ghost has no body). */
export function publishBodies(room: PartyRoom): void {
  const sim = simOf(room);
  for (const [id, body] of [...memoryOf(room).bodies]) {
    if (body.figure) continue;
    const p = sim.players.get(id);
    const priv = room.state.players.get(id)?.priv;
    if (!p || p.dead || !priv) {
      removeBody(room, id);
      continue;
    }
    writeBody(priv.body, body);
  }
}
