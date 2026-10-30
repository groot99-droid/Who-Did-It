import {
  balance,
  clues,
  economy,
  interactions,
  items,
  minigames,
  scenes,
  tasks,
  type Mode,
  type SceneId,
} from '@wdi/content';
import {
  ClueKind,
  Phase,
  PropState,
  S2C,
  TICK_RATE,
  TILE_PX,
  checkMinigame,
  generateLockpick,
  generateMinigame,
  lockpickOutcome,
  type LockpickPublic,
  type MinigamePuzzle,
  type PlayerState,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { handleCoopHold } from './Coop';
import { martyrOf } from './Memorial';
import { type PlayerSim, simOf } from './RoomSim';
import { atNode, completeTask } from './tasks/complete';
import { endMatch } from './Win';
import { decaySeconds, spawnClue } from './Clues';
import { JAIL_GAMES, type JailGame, addStrength, loseMaxHp, markPlayed, playedToday } from './JailGames';
import { shaveSentence } from './law/Jail';
import { addStack, canAdd, count, take } from './Inventory';
import { movePurse, TOWN } from './economy/purse';
import { emitNoise } from './Noise';
import { isVerbPhase, reject, sceneIndex, tileCentre } from './World';
import { refusal, sendRefusal, type Refusal } from './refusal';

/**
 * Main-mode mini-games (round 6, M5b, GDD 3.16; docs/round6/m5b-data.md 2.3): a station task's `task` hold sends
 * `minigameStart` with a puzzle from `rules/minigames.ts generateMinigame`, the server keeps it in room memory,
 * `minigame.result` is checked with `checkMinigame` and completes the task; a Cabal seat's fake task runs the same
 * puzzle and never moves the task bar. Session 6H.
 */

interface Open {
  taskId: string;
  puzzle: MinigamePuzzle;
  startTick: number;
  /** Round 10, D5: a lock-pick on a prop (`taskId` is the prop's id), not a station task. */
  lock?: { sceneId: SceneId; propId: string; interactionId: string };
  /** Round 10, D8: a jail game on a prop of the cell (`taskId` is the prop's id). */
  jail?: { game: JailGame; sceneId: SceneId };
}

/** The open puzzles of the match, keyed by the match's `MatchSeeds` (a new object at every Start), then by seat. */
const opens = new WeakMap<object, Map<string, Open>>();

function openOf(room: PartyRoom): Map<string, Open> {
  let m = opens.get(room.seeds);
  if (!m) opens.set(room.seeds, (m = new Map()));
  return m;
}

type Problem = Refusal;

// The lock-pick (round 10, D5; GDD 3.29): the resolver hands a `minigame` mode of the logic table here. The lock keeps
// the pin set points it was dealt on the first pick of the match; the picker's client gets them, as the tap bands go,
// and the answer is a trace that `lockpickOutcome` replays.

/** The set points of each lock, drawn once per match on the `locks` stream keyed by the prop id. */
const LOCKS = new WeakMap<object, Map<string, LockpickPublic>>();

/** The best tier of pick the seat holds, 0 for none. */
function pickTierOf(player: PlayerState): number {
  let best = 0;
  for (const it of Object.values(items.items))
    if (it.tool?.pick !== undefined && count(player, it.id) > 0) best = Math.max(best, it.tool.pick);
  return best;
}

/** The plainest pick item the seat holds: the one a snap spends. */
function pickItemOf(player: PlayerState): string | undefined {
  return Object.values(items.items)
    .filter((it) => it.tool?.pick !== undefined && count(player, it.id) > 0)
    .sort((a, b) => (a.tool?.pick ?? 0) - (b.tool?.pick ?? 0) || a.id.localeCompare(b.id))[0]?.id;
}

const lockCenter = (sceneId: SceneId, propId: string): { x: number; y: number } | null => {
  const prop = scenes[sceneId].props.find((q) => q.id === propId);
  return prop ? { x: tileCentre(prop.x, TILE_PX), y: tileCentre(prop.y, TILE_PX) } : null;
};

/** Why this seat cannot work the open lock now, or null. */
function lockProblem(room: PartyRoom, p: PlayerSim, player: PlayerState, lock: NonNullable<Open['lock']>) {
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  if (p.dead || !p.placed) return refusal('NOT_IN_PLAY');
  const at = lockCenter(lock.sceneId, lock.propId);
  if (!at || p.sceneIdx !== sceneIndex(lock.sceneId)) return refusal('NO_TARGET');
  if (Math.hypot(p.x - at.x, p.y - at.y) > balance.doors.reachTiles * TILE_PX)
    return refusal('TOO_FAR', { of: 'door' });
  if (room.state.scenes.get(lock.sceneId)?.propStates.has(lock.propId)) return refusal('NOTHING_THERE');
  if (pickTierOf(player) < 1) return refusal('NEED_TOOL');
  return null;
}

/**
 * Opens the lock-pick on prop `propId` (called by the resolver's `handleInteract` after its checks): sends the picker
 * `minigameStart` with the pins, their set points and the band its pick's tier leaves, and keeps the same board. The
 * attempt sounds from the start, at the interaction's noise.
 */
export function startLockpick(
  room: PartyRoom,
  sessionId: string,
  lock: NonNullable<Open['lock']>,
  noise: Mode['noise'],
): void {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  const b = balance.minigames.lockpick;
  if (!player || !p) return;
  const dealt = LOCKS.get(room.seeds) ?? new Map<string, LockpickPublic>();
  LOCKS.set(room.seeds, dealt);
  const lockTier = 1; // every placed lock is tier 1 until the scenes carry tiers
  let base = dealt.get(lock.propId);
  if (!base)
    dealt.set(
      lock.propId,
      (base = generateLockpick(lockTier, lockTier, room.seeds.get('locks', lock.propId), b)),
    );
  const band = pickTierOf(player) < lockTier ? b.bandFrac * b.lowerTierBandMult : b.bandFrac;
  const pub: LockpickPublic = { ...base, setPoints: [...base.setPoints], band };
  openOf(room).set(sessionId, {
    taskId: lock.propId,
    puzzle: { kind: 'lockpick', public: pub, solution: pub },
    startTick: room.state.tick,
    lock,
  });
  const at = lockCenter(lock.sceneId, lock.propId);
  if (at && noise) emitNoise(room, lock.sceneId, at.x, at.y, balance.noise[noise], noise, sessionId);
  room.clients
    .getById(sessionId)
    ?.send(S2C.minigameStart, { taskId: lock.propId, kind: 'lockpick', public: pub });
}

/** The answer to an open lock: opens it, snaps the pick, or asks again. */
function lockResult(
  room: PartyRoom,
  sessionId: string,
  player: PlayerState,
  p: PlayerSim,
  open: Open,
  answer: unknown,
): void {
  const lock = open.lock!;
  const problem = lockProblem(room, p, player, lock);
  if (problem) {
    openOf(room).delete(sessionId);
    return reject(room, sessionId, problem);
  }
  const trace =
    typeof answer === 'object' && answer !== null ? (answer as { trace?: unknown }).trace : undefined;
  // No hand is faster than the clock: a trace cannot end later than the seconds the board has been open.
  const last = Array.isArray(trace) ? (trace.at(-1) as { t?: unknown } | undefined)?.t : undefined;
  if (typeof last === 'number' && last > (room.state.tick - open.startTick) / TICK_RATE)
    return reject(room, sessionId, 'BAD_REQUEST');
  const outcome = lockpickOutcome(open.puzzle.public as LockpickPublic, trace);
  if (outcome === 'invalid' || outcome === 'incomplete') return reject(room, sessionId, 'BAD_REQUEST');
  openOf(room).delete(sessionId);
  if (outcome === 'snap') {
    const pick = pickItemOf(player);
    if (pick) take(player, pick, 1);
    return sendRefusal(room, sessionId, 'PICK_SNAPPED');
  }
  const after = interactions.interactions[lock.interactionId]?.after;
  if (!after) return;
  const state = new PropState();
  state.id = lock.propId;
  state.state = after.state;
  state.untilTick = after.respawnS === null ? 0 : room.state.tick + Math.round(after.respawnS * TICK_RATE);
  room.state.scenes.get(lock.sceneId)?.propStates.set(lock.propId, state);
  const mode = interactions.interactions[lock.interactionId]?.modes.find((m) => m.minigame === 'lockpick');
  // The scratch is the same for every picker (seams.md 3 row 12); the fine rolls on `locks`, a stream no client sees.
  if (mode?.leaves === 'scratch') leaveScratch(room, lock);
  if (mode?.fineChance !== undefined && room.seeds.get('locks', 'fine')() < mode.fineChance) {
    movePurse(room, sessionId, TOWN, economy.trespassFine, 'fine'); // never more than the purse holds
  }
}

// The county jail's games (round 10, D8; GDD 3.27): the same boards as the stations', opened from a prop of the cell.
// Once a day each; the gym adds Strength, the yard fight costs maximum health or pays a little, scrubbing pays a wage and
// takes time off the sentence. The seat's own stream `minigame` draws the board, as for a station task.

/** Why this seat cannot work the open jail game now, or null. */
function jailProblem(room: PartyRoom, p: PlayerSim, propId: string, jail: NonNullable<Open['jail']>) {
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  if (p.dead || !p.placed) return refusal('NOT_IN_PLAY');
  const at = lockCenter(jail.sceneId, propId);
  if (!at || p.sceneIdx !== sceneIndex(jail.sceneId)) return refusal('NO_TARGET');
  if (Math.hypot(p.x - at.x, p.y - at.y) > balance.doors.reachTiles * TILE_PX)
    return refusal('TOO_FAR', { of: 'pile' });
  return null;
}

/**
 * Opens the jail game `minigame` on prop `propId` (called by the resolver's `handleInteract` after its checks): once a
 * day, then the board is spent whether or not it is finished. Returns false when it is not a jail game.
 */
export function startJailGame(
  room: PartyRoom,
  sessionId: string,
  minigame: string,
  t: { sceneId: SceneId; id: string },
): boolean {
  const game = JAIL_GAMES[minigame];
  if (!game) return false;
  const p = simOf(room).players.get(sessionId);
  if (!p) return true;
  const jail = { game, sceneId: t.sceneId };
  const problem = jailProblem(room, p, t.id, jail);
  const refused = problem ?? (playedToday(room, sessionId, game) ? refusal('NOTHING_THERE') : null);
  if (refused) {
    reject(room, sessionId, refused);
    return true;
  }
  markPlayed(room, sessionId, game);
  const rng = room.seeds.get('minigame', sessionId);
  const b = balance.jail[game];
  const kind = game === 'gym' ? 'tap' : game === 'yard' ? 'crates' : 'pour';
  const puzzle = generateMinigame(kind, b.difficulty, rng, balance.minigames);
  openOf(room).set(sessionId, { taskId: t.id, puzzle, startTick: room.state.tick, jail });
  room.clients.getById(sessionId)?.send(S2C.minigameStart, { taskId: t.id, kind, public: puzzle.public });
  return true;
}

/** The answer to an open jail game. The yard fight is one round: a wrong or a slow answer loses it. */
function jailResult(room: PartyRoom, sessionId: string, p: PlayerSim, open: Open, answer: unknown): void {
  const jail = open.jail!;
  const problem = jailProblem(room, p, open.taskId, jail);
  if (problem) {
    openOf(room).delete(sessionId);
    return reject(room, sessionId, problem);
  }
  const right = checkMinigame(open.puzzle, answer);
  if (jail.game === 'yard') {
    openOf(room).delete(sessionId);
    const inTime = room.state.tick - open.startTick <= Math.round(balance.jail.yard.boardS * TICK_RATE);
    if (right && inTime) movePurse(room, TOWN, sessionId, balance.jail.yard.purse, 'wage');
    else loseMaxHp(room, sessionId);
    return;
  }
  if (!right) return reject(room, sessionId, 'BAD_REQUEST');
  openOf(room).delete(sessionId);
  if (jail.game === 'gym') return addStrength(room, sessionId);
  const s = balance.jail.scrub;
  movePurse(room, TOWN, sessionId, s.wage, 'wage');
  shaveSentence(room, sessionId, s.offDayFrac * balance.phases.dayS * TICK_RATE);
}

/** The `scratch` clue on the picked prop's tile: value and dir 0, so it shows nothing of the picker. */
function leaveScratch(room: PartyRoom, lock: NonNullable<Open['lock']>): void {
  const prop = scenes[lock.sceneId].props.find((q) => q.id === lock.propId);
  const def = clues.clues.scratch;
  if (!prop || !def) return;
  spawnClue(room, lock.sceneId, {
    kind: ClueKind.scratch,
    value: 0,
    dir: 0,
    decayS: decaySeconds(def.decay),
    tx: prop.x,
    ty: prop.y,
  });
}

/** Why this seat cannot work `taskId` now, or null: the checks that start a mini-game and that finish it. */
function taskProblem(
  room: PartyRoom,
  p: PlayerSim | undefined,
  player: PlayerState,
  taskId: string,
): Problem | null {
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  // A ghost finishes its own tasks (GDD 3.8; the bar caps its share, 3.5), so `dead` is no bar here (7M).
  if (!p || !p.placed) return refusal('NOT_IN_PLAY');
  if (room.state.tick < p.busyUntilTick) return refusal('BUSY');
  const entry = player.priv.tasks.find((t) => t.id === taskId);
  const task = tasks.tasks[taskId];
  if (!entry || entry.done || !task || task.kind !== 'fetch') return refusal('NOT_YOURS', { what: 'task' });
  if (task.nightOnly && room.state.phase !== Phase.night && room.state.phase !== Phase.finalNight) {
    return refusal('PHASE_CLOSED', { until: 'night' });
  }
  if (!task.targets.some((t) => atNode(p, t))) return refusal('TOO_FAR', { of: 'task' });
  // A fake task (a Cabal seat's alibi list) needs no deliverable; a real one carries it to the node.
  if (!entry.fake && task.tool !== undefined && count(player, task.tool) < (task.toolQty ?? 1))
    return refusal('NEED_TOOL');
  return null;
}

/**
 * The pick-up (GDD 3.5): a seat at a task's source prop takes the task's deliverable, `toolQty` of its tool, into its
 * pockets, once at a time: not while it carries that many already, and not without the room. A fake list's holder goes
 * through the same motion and takes nothing, so the Cabal's alibi theatre visits the same shelves as the Village's
 * errands; nothing public tells the two apart, since inventories are private. The hold is instant, like the opener.
 */
function pickUp(
  room: PartyRoom,
  sessionId: string,
  player: PlayerState,
  p: PlayerSim,
  fake: boolean,
  tool: string | undefined,
  qty: number,
): void {
  if (!isVerbPhase(room.state.phase)) return reject(room, sessionId, 'PHASE_CLOSED');
  if (!p.placed) return reject(room, sessionId, 'NOT_IN_PLAY');
  if (room.state.tick < p.busyUntilTick) return reject(room, sessionId, 'BUSY');
  if (fake || tool === undefined) return;
  if (count(player, tool) >= qty) return reject(room, sessionId, 'ALREADY_HAVE', { item: tool });
  if (!canAdd(player, tool, qty)) return reject(room, sessionId, 'PACK_FULL');
  addStack(player, tool, qty);
}

/**
 * `act.hold {action: 'task', targetId: taskId, on: true}` (call site in `sim/Hold.ts`): opens the task's mini-game.
 * The hold itself is the opener (GDD 3.16), so there is no timer; pressing again opens a fresh puzzle.
 */
export function handleTaskHold(room: PartyRoom, sessionId: string, taskId: string): void {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  const def = Object.values(minigames.minigames).find((m) => m.task === taskId);
  if (!player || !p) return;
  // Round 7 (7M, GDD 3.5): the co-op task is a press-and-hold with no puzzle (`sim/Coop.ts`); at a fetch task's
  // source the same hold picks its deliverable up instead.
  const task = tasks.tasks[taskId];
  if (task?.kind === 'coop') {
    handleCoopHold(room, sessionId, taskId);
    return;
  }
  const entry = player.priv.tasks.find((t) => t.id === taskId);
  if (entry && !entry.done && task?.kind === 'fetch' && task.source && atNode(p, task.source)) {
    pickUp(room, sessionId, player, p, entry.fake, task.tool, task.toolQty ?? 1);
    return;
  }
  const problem = def ? taskProblem(room, p, player, taskId) : refusal('BAD_REQUEST');
  if (problem || !def) {
    reject(room, sessionId, problem ?? refusal('BAD_REQUEST'));
    return;
  }
  // The puzzle is the seat's own business: a stream keyed by seat, shared with nothing public (`sim/seeds.ts`).
  const rng = room.seeds.get('minigame', sessionId);
  const puzzle = generateMinigame(def.kind, def.difficulty, rng, balance.minigames);
  openOf(room).set(sessionId, { taskId, puzzle, startTick: room.state.tick });
  room.clients
    .getById(sessionId)
    ?.send(S2C.minigameStart, { taskId, kind: puzzle.kind, public: puzzle.public });
}

/**
 * The global bar as the lists say it: finished real tasks over all real tasks; a ghost's finished ones count up to
 * `ghostShareCap`. The martyred Vicar's ghost (GDD 3.20) counts each real task it finishes in the `martyrS` seconds
 * after its reveal `martyrWeight` times, outside the cap; before and after that window its tasks count as any ghost's.
 * Null when no seat holds a real task (the bar then stays where the deal left it). The `taskBar` invariant reads it.
 */
export function taskBarValue(room: PartyRoom): number | null {
  const martyr = martyrOf(room);
  let total = 0;
  let done = 0;
  let ghostDone = 0;
  let martyrDone = 0;
  for (const [id, player] of room.state.players) {
    const ghost = simOf(room).players.get(id)?.dead === true;
    let finished = 0;
    for (const t of player.priv?.tasks ?? []) {
      if (t.fake) continue;
      total++;
      if (t.done) finished++;
    }
    if (!ghost) done += finished;
    else if (id !== martyr?.seat) ghostDone += finished;
    else {
      const before = Math.min(finished, martyr.doneBefore);
      const boosted = Math.max(0, Math.min(finished, martyr.doneAtEnd ?? finished) - before);
      ghostDone += finished - boosted;
      martyrDone += boosted;
    }
  }
  if (total === 0) return null;
  const counted =
    done + Math.min(ghostDone, balance.tasks.ghostShareCap * total) + martyrDone * balance.tasks.martyrWeight;
  return Math.min(100, Math.floor((100 * counted) / total));
}

/** Writes the bar; a full bar in play wins the match for the Village (GDD 3.5). */
export function recomputeTaskBar(room: PartyRoom): void {
  const value = taskBarValue(room);
  if (value === null) return;
  room.state.taskBar = value;
  const phase = room.state.phase;
  if (value === 100 && phase >= Phase.grace && phase < Phase.gameOver) endMatch(room, 'village');
}

/**
 * `minigame.result {taskId, answer}` (locked call site in `sim/Commands.ts`): a right answer completes the task, a wrong
 * one completes nothing and the puzzle stays open. `{assist: true}` is the Done control, accepted once the puzzle has
 * been open for its `assistS` (GDD 3.16).
 */
export function handleMinigameResult(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  const open = openOf(room).get(sessionId);
  const { taskId, answer } = payload;
  if (!player || !p) return;
  if (!open || typeof taskId !== 'string' || open.taskId !== taskId) {
    reject(room, sessionId, 'NOTHING_THERE');
    return;
  }
  if (open.lock) return lockResult(room, sessionId, player, p, open, answer);
  if (open.jail) return jailResult(room, sessionId, p, open, answer);
  const problem = taskProblem(room, p, player, taskId);
  if (problem) {
    openOf(room).delete(sessionId);
    reject(room, sessionId, problem);
    return;
  }
  const def = Object.values(minigames.minigames).find((m) => m.task === taskId);
  const assisted =
    typeof answer === 'object' &&
    answer !== null &&
    (answer as { assist?: unknown }).assist === true &&
    def !== undefined &&
    room.state.tick - open.startTick >= Math.round(def.assistS * TICK_RATE);
  if (!assisted && !checkMinigame(open.puzzle, answer)) {
    reject(room, sessionId, 'BAD_REQUEST');
    return;
  }
  completeTask(room, sessionId, player, p, taskId);
  openOf(room).delete(sessionId);
}
