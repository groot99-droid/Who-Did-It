import { balance, onubBalance, onubFor, onubRoles, profileFor, scenes } from '@wdi/content';
import {
  ErrorCode,
  GameMode,
  NightReveal,
  type NightRevealEntry,
  type NightWindow,
  ONUB_SET_PLATE,
  Phase,
  type PlayerState,
  Prop,
  type Rng,
  type RoleRevealPayload,
  S2C,
  type SwapLogEntry,
  TILE_PX,
  TRAIT_IDS,
  Team,
  type TeamId,
  applyNightAct,
  dealOnub,
  dealTraits,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { flowOf, refuse, setPhase } from './Flow';
import { applyProfileToDoors, enterScene } from './Portals';
import { simOf } from './RoomSim';
import { isLoft, reject, sceneIndex, tileCentre } from './World';

/** Quick mode is on for this party (`Settings.mode`, ARCHITECTURE 5.14). */
export const isOnub = (room: PartyRoom): boolean => room.state.settings.mode === GameMode.onub;

export const PLATE_PREFIX = 'bk.plate_';
export const DEAD_PREFIX = 'bk.deadloaf_';
export const LEDGER_ID = 'bk.ledger';
const BAKERY_SPAWN = 'door';

/** An act an NPC waker means to make (`onubNpcPlan`) or the Conductor makes for it. */
export interface NpcPlan {
  abilityId: string;
  targetId: string;
  targetId2?: string;
}

/** Where the Conductor is inside the night. */
export type NightStage = 'idle' | 'fade' | 'window' | 'done';

/**
 * Room memory of one quick-mode match (A39): the deal, the loaves, the swap log and the Conductor. Never on
 * the wire; `resetOnubForLobby` drops it.
 */
export interface OnubState {
  rng: Rng;
  /** Seat id -> the role dealt (the role card, and the window the seat wakes for). */
  dealt: Map<string, string>;
  /** Seat id -> plate slot: the seat's index in the deal order, 0 to n-1 (never `PlayerSim.ordinal`). */
  slotOf: Map<string, number>;
  /** Plate prop id -> the owner's seat id. */
  owners: Map<string, string>;
  /** Prop id (`bk.plate_<slot>`, `bk.deadloaf_0..2`) -> the loaf on it now. */
  loaves: Map<string, string>;
  swapLog: SwapLogEntry[];
  script: NightWindow[];
  stage: NightStage;
  windowIdx: number;
  /** When the current stage ends: the window's close, or the end of its fade. */
  stageEndsTick: number;
  /** Seats woken for the open window. */
  wakers: string[];
  /** Seats that have acted in the open window. */
  acted: Set<string>;
  plateSet: Set<string>;
  npcPlans: Map<string, NpcPlan>;
  traces: string[];
  /** Voter -> target of the dawn vote, kept for the end screen. */
  votes: Record<string, string>;
  outs: string[];
}

const states = new WeakMap<PartyRoom, OnubState>();
export const onubOf = (room: PartyRoom): OnubState | undefined => states.get(room);

export const plateProp = (slot: number): string => `${PLATE_PREFIX}${slot}`;
const deadProps = (): string[] =>
  Array.from({ length: onubBalance.deadLoaves }, (_, i) => `${DEAD_PREFIX}${i}`);

/** The `bk.plate_<slot>` prop of a seat (its index in the deal order, A39), or null outside quick mode. */
export function plateOf(room: PartyRoom, seatId: string): string | null {
  const slot = onubOf(room)?.slotOf.get(seatId);
  return slot === undefined ? null : plateProp(slot);
}

const bakeryProp = (id: string) => scenes.bakery.props.find((q) => q.id === id);

function refuseStart(room: PartyRoom): void {
  room.state.players.forEach((_p: PlayerState, id: string) =>
    refuse(room, id, ErrorCode.cannot, 'need more players'),
  );
}

/** The seats whose card is fixed by `debug.deal` keep it; the rest of the deck goes to the others and the centre. */
function dealWithFixed(
  room: PartyRoom,
  ids: readonly string[],
  deck: readonly string[],
  rng: Rng,
): { dealt: Map<string, string>; center: string[] } {
  const flow = flowOf(room);
  const fixed = flow.fixedDeal;
  flow.fixedDeal = null;
  if (!fixed) return dealOnub(ids, deck, rng);
  const rest = [...deck];
  const taken = new Map<string, string>();
  for (const id of ids) {
    const roleId = fixed[id];
    if (roleId === undefined) continue;
    taken.set(id, roleId);
    const at = rest.includes(roleId)
      ? rest.indexOf(roleId)
      : rest.includes(onubRoles.standIn)
        ? rest.indexOf(onubRoles.standIn)
        : rest.length - 1;
    rest.splice(at, 1);
  }
  const free = ids.filter((id) => !taken.has(id));
  const { dealt: dealtRest, center } = dealOnub(free, rest, rng);
  const dealt = new Map<string, string>();
  for (const id of ids) dealt.set(id, taken.get(id) ?? (dealtRest.get(id) as string));
  return { dealt, center };
}

/** The role card of quick mode: built from `roles.onub.json`, not from `buildRoleReveal` (it throws on an onub id). */
function onubRoleReveal(
  roleId: string,
  look: { height: number; scarf: number; hat: number },
  mates: { id: string; name: string }[],
): RoleRevealPayload {
  const role = onubRoles.roles[roleId];
  if (!role) throw new Error(`unknown quick-mode role ${roleId}`);
  return {
    roleId: role.id,
    team: role.faction as TeamId,
    goal: role.nightAct,
    abilities: [],
    inventory: [],
    cardText: role.cardText,
    beware: onubRoles.cardLine,
    teammates: mates,
    traits: {
      height: TRAIT_IDS.height[look.height] ?? TRAIT_IDS.height[1],
      scarf: TRAIT_IDS.scarf[look.scarf] ?? TRAIT_IDS.scarf[0],
      hat: TRAIT_IDS.hat[look.hat] ?? TRAIT_IDS.hat[2],
    },
  };
}

/**
 * The quick-mode deal and role cards (GDD 3.11): called by `startMatch` before the main deal. Returns
 * false when the party is not in quick mode so the main deal runs.
 */
export function startOnubMatch(room: PartyRoom, ids: readonly string[], rng: Rng): boolean {
  if (!isOnub(room)) return false;
  // The NPC fill (GDD 3.12) brings every start to the minimum; a short party is refused, never dealt.
  if (ids.length < balance.players.min || ids.length > balance.players.max) {
    refuseStart(room);
    return true;
  }
  const { dealt, center } = dealWithFixed(room, ids, onubFor(ids.length).deck, rng);
  const looks = dealTraits(ids, rng);
  const slotOf = new Map(ids.map((id, slot) => [id, slot]));
  const loaves = new Map<string, string>();
  const owners = new Map<string, string>();
  for (const id of ids) {
    const prop = plateProp(slotOf.get(id) as number);
    loaves.set(prop, dealt.get(id) as string);
    owners.set(prop, id);
  }
  deadProps().forEach((prop, i) => loaves.set(prop, center[i] as string));
  states.set(room, {
    rng,
    dealt,
    slotOf,
    owners,
    loaves,
    swapLog: [],
    script: [],
    stage: 'idle',
    windowIdx: -1,
    stageEndsTick: 0,
    wakers: [],
    acted: new Set(),
    plateSet: new Set(),
    npcPlans: new Map(),
    traces: [],
    votes: {},
    outs: [],
  });

  for (const id of ids) {
    const player = room.state.players.get(id) as PlayerState;
    const roleId = dealt.get(id) as string;
    const look = looks.get(id) as { height: number; scarf: number; hat: number };
    player.traits.height = look.height;
    player.traits.scarf = look.scarf;
    player.traits.hat = look.hat;
    player.alive = true;
    player.ready = false;
    const priv = player.priv;
    if (!priv) continue;
    priv.role.roleId = roleId;
    priv.role.team = Team[(onubRoles.roles[roleId]?.faction ?? 'village') as TeamId];
    priv.inventory.slots.clear();
    priv.cabalMates.clear();
    // Only the Poisoners know each other from the card; the Hireling learns them at its window.
    if (roleId === 'poisoner') {
      for (const o of ids) if (o !== id && dealt.get(o) === 'poisoner') priv.cabalMates.push(o);
    }
  }

  void room.lock();
  setPhase(room, Phase.roleReveal, onubBalance.timers.roleCardS);
  for (const id of ids) {
    const mates = (room.state.players.get(id)?.priv?.cabalMates ?? []).map((m: string) => ({
      id: m,
      name: room.state.players.get(m)?.name ?? '',
    }));
    room.clients
      .getById(id)
      ?.send(S2C.roleReveal, onubRoleReveal(dealt.get(id) as string, looks.get(id) as never, mates));
  }
  return true;
}

/** One `Prop` of the bakery's scene state (the plates, the dead's loaves, the ledger). */
function addProp(room: PartyRoom, id: string, of: string): void {
  const def = bakeryProp(id);
  const scene = room.state.scenes.get('bakery');
  if (!def || !scene) return;
  const prop = new Prop();
  prop.id = id;
  prop.kind = def.kind;
  prop.turned = false;
  prop.of = of;
  scene.props.set(id, prop);
}

/**
 * roleReveal -> dusk in quick mode (GDD 3.11): called by `beginPlay` first; returns false outside quick
 * mode so the main grace phase starts. Every seat is placed in the bakery itself, the plates are set out
 * with their owners' names and dusk begins.
 */
export function beginOnubPlay(room: PartyRoom): boolean {
  const o = onubOf(room);
  if (!isOnub(room) || !o) return false;
  const state = room.state;
  const sim = simOf(room);
  state.round = 0;
  state.startTick = state.tick;
  sim.profile = profileFor(Math.min(balance.players.max, Math.max(balance.players.min, o.slotOf.size)));
  applyProfileToDoors(room);
  sim.profileFixed = true;
  state.players.forEach((player: PlayerState, id: string) => {
    player.ready = false;
    const p = sim.ensure(id);
    if (enterScene(room, player, p, 'bakery', BAKERY_SPAWN, false)) {
      p.placed = true;
      player.alive = true;
    }
  });
  sim.viewsDirty = true;
  for (const [prop, owner] of o.owners) addProp(room, prop, owner);
  for (const prop of deadProps()) addProp(room, prop, '');
  addProp(room, LEDGER_ID, '');
  setPhase(room, Phase.dusk, onubBalance.timers.duskS);
  return true;
}

// --- Acts -------------------------------------------------------------------------------------------

const withinReach = (room: PartyRoom, seatId: string, propId: string): boolean => {
  const p = simOf(room).players.get(seatId);
  const def = bakeryProp(propId);
  if (!p || !def) return false;
  const reach = onubBalance.actRangeTiles * TILE_PX;
  return Math.hypot(p.x - tileCentre(def.x, TILE_PX), p.y - tileCentre(def.y, TILE_PX)) <= reach;
};

/** The living, placed seat standing in the bakery, else a refusal has been sent. */
function bakeryActor(room: PartyRoom, sessionId: string): boolean {
  const p = simOf(room).players.get(sessionId);
  if (!p || !room.state.players.has(sessionId)) return false;
  if (p.dead || !p.placed) {
    reject(room, sessionId, ErrorCode.cannot, 'not now');
    return false;
  }
  // A sleeper in the loft, or anyone out of the bakery, acts on nothing (A39).
  if (isLoft(p.sceneIdx) || p.sceneIdx !== sceneIndex('bakery')) {
    reject(room, sessionId, ErrorCode.wrongPhase, 'not now');
    return false;
  }
  return true;
}

const windowDefOf = (role: string) => onubBalance.windows.find((w) => w.role === role);

function setPlate(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const o = onubOf(room);
  if (!o || room.state.phase !== Phase.dusk) return reject(room, sessionId, ErrorCode.wrongPhase, 'not now');
  if (!bakeryActor(room, sessionId)) return;
  const target = payload.targetId;
  if (typeof target !== 'string' || target !== plateOf(room, sessionId)) {
    return reject(room, sessionId, ErrorCode.cannot, 'not your plate');
  }
  if (!withinReach(room, sessionId, target)) return reject(room, sessionId, ErrorCode.outOfRange, 'too far');
  o.plateSet.add(sessionId);
}

/** `act.ability` with an `onub.*` id (plate-setting at dusk, the night acts). */
export function handleOnubAbility(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  const o = onubOf(room);
  if (!isOnub(room) || !o) return reject(room, sessionId, ErrorCode.cannot, 'cannot do that');
  if (payload.abilityId === ONUB_SET_PLATE) return setPlate(room, sessionId, payload);
  nightAct(room, o, sessionId, payload);
}

/** The target ids a seat may name for a target kind (GDD 3.11: never your own plate for `otherPlate`). */
function targetPool(room: PartyRoom, o: OnubState, seatId: string, kind: string): string[] {
  switch (kind) {
    case 'deadLoaf':
      return deadProps();
    case 'ledger':
      return [LEDGER_ID];
    case 'ownPlate': {
      const own = plateOf(room, seatId);
      return own === null ? [] : [own];
    }
    default:
      return [...o.owners].filter(([, owner]) => owner !== seatId).map(([prop]) => prop);
  }
}

function nightAct(room: PartyRoom, o: OnubState, sessionId: string, payload: Record<string, unknown>): void {
  const idx = o.windowIdx;
  const window = o.script[idx];
  if (room.state.phase !== Phase.night || o.stage !== 'window' || !window) {
    return reject(room, sessionId, ErrorCode.wrongPhase, 'not now');
  }
  if (!bakeryActor(room, sessionId)) return;
  if (o.dealt.get(sessionId) !== window.role || !o.wakers.includes(sessionId)) {
    return reject(room, sessionId, ErrorCode.wrongPhase, 'not your window');
  }
  if (o.acted.has(sessionId)) return reject(room, sessionId, ErrorCode.cannot, 'already done');
  const windowDef = windowDefOf(window.role);
  const abilityId = payload.abilityId;
  const winAct = windowDef?.acts.find((a) => a.act === abilityId);
  const def = typeof abilityId === 'string' ? onubBalance.acts[abilityId] : undefined;
  if (!windowDef || !winAct || !def || typeof abilityId !== 'string') {
    return reject(room, sessionId, ErrorCode.cannot, 'not an act of yours');
  }
  if (windowDef.onlyIfAlone && [...o.dealt.values()].filter((r) => r === window.role).length !== 1) {
    return reject(room, sessionId, ErrorCode.cannot, 'not alone');
  }
  const picks = [payload.targetId, payload.targetId2].filter((t) => t !== undefined);
  const need = def.swap === 'pair' ? winAct.picks : 1;
  if (
    picks.length < need ||
    picks.length > winAct.picks ||
    picks.some((t) => typeof t !== 'string') ||
    new Set(picks).size !== picks.length
  ) {
    return reject(room, sessionId, ErrorCode.cannot, 'bad targets');
  }
  const targets = picks as string[];
  const pool = targetPool(room, o, sessionId, def.target);
  if (!targets.every((t) => pool.includes(t)))
    return reject(room, sessionId, ErrorCode.cannot, 'bad targets');
  // A two-pick act is held pick by pick and sent on the second: one pick within reach is the proof of presence.
  if (!targets.some((t) => withinReach(room, sessionId, t))) {
    return reject(room, sessionId, ErrorCode.outOfRange, 'too far');
  }
  commitAct(room, o, sessionId, abilityId, targets);
}

/**
 * Applies a validated act: the loaves change, the swap log and the actor's reveal are written. Used by the
 * handler and by the Conductor (an NPC's plan, the Sot's seeded pick); nothing here refuses.
 */
export function commitAct(
  room: PartyRoom,
  o: OnubState,
  seatId: string,
  abilityId: string,
  targets: readonly string[],
): void {
  const window = o.script[o.windowIdx];
  const def = onubBalance.acts[abilityId];
  if (!window || !def) return;
  const own = plateOf(room, seatId) as string;
  const slots = def.swap === 'withOwn' ? [own, ...targets] : [...targets];
  const { next, reveal } = applyNightAct(o.loaves, { roleId: window.role, act: abilityId, slots });
  o.loaves = next;
  o.acted.add(seatId);
  o.npcPlans.delete(seatId);
  if (def.swap !== 'none')
    o.swapLog.push({ order: window.order, roleId: window.role, act: abilityId, slots });
  const entries: NightRevealEntry[] =
    def.target === 'ledger'
      ? [...o.dealt]
          .filter(([, role]) => role === 'poisoner')
          .map(([id, roleId]) => ({ slot: LEDGER_ID, of: id, roleId }))
      : reveal.map((r) => ({ slot: r.slot, of: o.owners.get(r.slot) ?? '', roleId: r.roleId }));
  if (entries.length === 0) return;
  const priv = room.state.players.get(seatId)?.priv;
  for (const e of entries) {
    const row = new NightReveal();
    row.slot = e.slot;
    row.of = e.of;
    row.roleId = e.roleId;
    priv?.nightReveal.push(row);
  }
  room.clients.getById(seatId)?.send(S2C.nightReveal, { entries });
}

// --- NPC wakers ---------------------------------------------------------------------------------------

/** Every act and target a seat could legally make in a window (the pool `plan` draws from). */
function legalPlans(room: PartyRoom, o: OnubState, seatId: string, role: string): NpcPlan[] {
  const windowDef = windowDefOf(role);
  if (!windowDef) return [];
  if (windowDef.onlyIfAlone && [...o.dealt.values()].filter((r) => r === role).length !== 1) return [];
  const plans: NpcPlan[] = [];
  for (const winAct of windowDef.acts) {
    const def = onubBalance.acts[winAct.act];
    if (!def) continue;
    const pool = targetPool(room, o, seatId, def.target);
    for (const [i, a] of pool.entries()) {
      if (def.swap !== 'pair') plans.push({ abilityId: def.id, targetId: a });
      if (winAct.picks < 2) continue;
      for (const b of pool.slice(i + 1)) plans.push({ abilityId: def.id, targetId: a, targetId2: b });
    }
  }
  return plans;
}

/**
 * Chosen by the Conductor at a window's start for an NPC waker, from a flat seeded draw over the legal acts
 * (and "nothing" for an act that may be skipped); stored so the NPC brain can walk there and send it.
 */
export function planNpcAct(room: PartyRoom, o: OnubState, seatId: string): void {
  const role = o.dealt.get(seatId) as string;
  const plans = legalPlans(room, o, seatId, role);
  const mustAct = windowDefOf(role)?.onTimeout === 'seededPick';
  const draw = Math.floor(o.rng() * (plans.length + (mustAct ? 0 : 1)));
  const plan = mustAct ? plans[draw] : plans[draw - 1];
  if (plan) o.npcPlans.set(seatId, plan);
}

/**
 * The act an NPC seat awake in the bakery means to make, so the NPC brain (S) can walk there and send it;
 * null once it has acted, when it chose nothing, and outside its window.
 */
export function onubNpcPlan(room: PartyRoom, seatId: string): NpcPlan | null {
  const o = onubOf(room);
  if (!o || o.stage !== 'window' || o.acted.has(seatId)) return null;
  return o.npcPlans.get(seatId) ?? null;
}

/** The Sot's mandatory swap when its window expires: a dead loaf by seed (GDD 3.11). */
export function seededDeadPick(o: OnubState): string {
  const dead = deadProps();
  return dead[Math.floor(o.rng() * dead.length)] as string;
}

/** Clears the quick-mode room memory at the lobby reset (`resetToLobby`). */
export function resetOnubForLobby(room: PartyRoom): void {
  states.delete(room);
}

/** The loaf on a seat's plate now, or its dealt role before the night has changed anything. */
export function finalRoleOf(room: PartyRoom, seatId: string): string {
  const o = onubOf(room);
  const plate = plateOf(room, seatId);
  return (plate === null ? undefined : o?.loaves.get(plate)) ?? '';
}
