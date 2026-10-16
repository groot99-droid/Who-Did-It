import mitt, { type Emitter } from 'mitt';
import balanceJson from '@wdi/content/data/balance.json';
import metricsJson from '@wdi/content/data/metrics.json';
import abilitiesJson from '@wdi/content/data/abilities.json';
import cluesJson from '@wdi/content/data/clues.json';
import { type NavData, NavGrid, TICK_RATE, TILE_PX, moveAabb } from '@wdi/shared';
import { ClueKind, NotebookStatus } from '@wdi/shared/constants';
import { dirFromVector } from '@wdi/shared/direction';
import type { HoldAction } from '@wdi/shared/protocol';
import type {
  BodySnap,
  ClueSnap,
  DoorSnap,
  MoveCmd,
  NotebookSnap,
  PlayerSnap,
  PresenceSnap,
  SceneEnter,
  WorldFeed,
  WorldFeedEvents,
} from '../world';

// A local stand-in for the server's movement stage, used behind ?mock=1 until a server is attached. It runs
// the same collision (`@wdi/shared`) and the same speed table (balance.json) as apps/server/src/sim, with
// six random-walking bots, so the World scene is exercised without a network.

const FOOT_HALF_PX = (metricsJson.collisionBoxTiles * TILE_PX) / 2;
const PORTAL_REACH_TILES = balanceJson.doors.reachTiles;
const TRANSIT_TICKS = Math.round(balanceJson.doors.transitS * TICK_RATE);
const SWING_TICKS = Math.round(balanceJson.doors.swingS * TICK_RATE);
const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const A = abilitiesJson.abilities;
const KILL_REACH_PX = (A.kill.rangeTiles + 0.5) * TILE_PX;
const REPORT_REACH_PX = A.report.rangeTiles * TILE_PX;
const BELL_REACH_PX = A.bell.rangeTiles * TILE_PX;
const COLLECT_REACH_PX = PORTAL_REACH_TILES * TILE_PX;
const COLLECT_TICKS = Math.round(A.collect.castS * TICK_RATE);
const BLOOD_TICKS = Math.round(cluesJson.clues.blood.decay.seconds * TICK_RATE);
const KILL_COOLDOWN_TICKS = Math.round(balanceJson.byCount['6'].killCooldownS * TICK_RATE);
const P = balanceJson.phases;
const PHASE_NAMES = ['grace', 'day', 'dusk', 'night'];
/** Mock phase ids, as `Phase` in @wdi/shared: grace 2, day 3, dusk 4, night 5. */
const PHASE_ORDER = [
  { id: 2, ticks: P.graceS * TICK_RATE },
  { id: 3, ticks: P.dayS * TICK_RATE },
  { id: 4, ticks: P.duskS * TICK_RATE },
  { id: 5, ticks: P.nightS * TICK_RATE },
] as const;

export interface MockPortal {
  id: string;
  x: number;
  y: number;
  to: string | null;
  toSpawn: string | null;
  minProfile: string;
}
export interface MockScene {
  id: string;
  portals: MockPortal[];
  spawns: Array<{ id: string; x: number; y: number; facing: string }>;
  props?: Array<{ id: string; kind: string; x: number; y: number }>;
}
export interface MockContent {
  navs: Record<string, NavData>;
  scenes: Record<string, MockScene>;
  /** The frozen scene id list: `NotebookEntry.sceneId` indexes into it. */
  sceneIds?: readonly string[];
}

interface Actor {
  id: string;
  name: string;
  traits: PlayerSnap['traits'];
  scene: string;
  x: number;
  y: number;
  yaw: number;
  moving: boolean;
  vx: number;
  vy: number;
  busyUntil: number;
  /** Scene being left while the transit window is open. */
  from: string | null;
  turnAt: number;
  /** Wander direction of a bot until its next turn. */
  dirX: number;
  dirY: number;
  dead: boolean;
}

interface MockClue extends ClueSnap {
  scene: string;
}
interface MockCorpse extends BodySnap {
  scene: string;
}

/** Direction name for a unit vector in screen space (x right, y down). */
const dirName = (dx: number, dy: number) => dirFromVector(dx, dy);
const SPEED = (tilesPerS: number) => (tilesPerS * TILE_PX) / TICK_RATE;
const BOT_NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay'];

export class MockWorldFeed implements WorldFeed {
  readonly bus: Emitter<WorldFeedEvents> = mitt<WorldFeedEvents>();
  readonly selfId = 'mock-me';
  private readonly actors = new Map<string, Actor>();
  private readonly swings = new Map<string, number>();
  private readonly grids = new Map<string, NavGrid>();
  private move: MoveCmd | null = null;
  private tick = 0;
  private timer: number | null = null;
  private seed = 12345;
  private phaseIdx = 0;
  private phaseEndsTick = 0;
  private readonly corpses = new Map<string, MockCorpse>();
  private readonly clueMap = new Map<string, MockClue>();
  private readonly book: NotebookSnap[] = [];
  private holding: { clueId: string; since: number } | null = null;
  private killReadyTick = 0;
  private bloodyUntil = 0;
  private ghost = false;
  private still = false;
  private clueSeq = 0;

  constructor(
    private readonly content: MockContent,
    selfName = 'You',
  ) {
    const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
    // ?phase=day|dusk|night starts there (kills are refused in grace like the server), ?bots=still
    // parks the bots, ?ghost=1 starts as a ghost: all three exist so tests reach those states fast.
    this.phaseIdx = Math.max(0, PHASE_NAMES.indexOf(q.get('phase') ?? ''));
    this.phaseEndsTick = PHASE_ORDER[this.phaseIdx]!.ticks;
    this.still = q.get('bots') === 'still';
    this.ghost = q.get('ghost') === '1';
    const names = [selfName, ...BOT_NAMES];
    names.forEach((name, i) => {
      const id = i === 0 ? this.selfId : `mock-bot-${i}`;
      const body: Actor = {
        id,
        name,
        traits: { height: i % 3, scarf: (i + 1) % 3, hat: (i + 2) % 3 },
        scene: 'overworld',
        x: 0,
        y: 0,
        yaw: Math.PI,
        moving: false,
        vx: 0,
        vy: 0,
        busyUntil: 0,
        from: null,
        turnAt: 0,
        dirX: 0,
        dirY: 0,
        dead: false,
      };
      this.actors.set(id, body);
      const spawn = this.content.scenes.overworld?.spawns.find((s) => s.id === `square_${i}`);
      if (spawn) this.place(body, 'overworld', spawn);
    });
    const teach = this.content.scenes.overworld?.props?.find((p) => p.id === 'ov.teaching_clue');
    if (teach) {
      // GDD 2 step 5: the grace clue beside the well, Footprints with a tall stride.
      this.clueMap.set('clue_teaching', {
        id: 'clue_teaching',
        scene: 'overworld',
        kind: ClueKind.footprints,
        value: 2,
        dir: 4,
        x: (teach.x + 0.5) * TILE_PX,
        y: (teach.y + 0.5) * TILE_PX,
        claimed: false,
      });
    }
  }

  /** Starts the 20 Hz loop and tells the World scene to begin, like the server's first `sceneEnter`. */
  start(): void {
    if (this.timer !== null) return;
    // A plain interval runs late when the tab is busy drawing; stepping until the due time keeps the
    // simulated distance per wall-clock second right, like the server's fixed timestep.
    const period = 1000 / TICK_RATE;
    let due = performance.now();
    this.timer = window.setInterval(() => {
      const now = performance.now();
      let steps = 0;
      while (due <= now && steps < 8) {
        this.step();
        due += period;
        steps++;
      }
      if (due < now) due = now;
    }, period / 2);
    const me = this.actors.get(this.selfId);
    const spawn = this.content.scenes.overworld?.spawns.find((s) => s.id === 'square_0');
    if (me && spawn)
      this.bus.emit('sceneEnter', { sceneId: 'overworld', spawn: spawn.id, facing: spawn.facing });
    if (this.ghost)
      window.setTimeout(
        () =>
          this.bus.emit('killed', {
            sceneId: 'overworld',
            cause: 'knife',
            roles: { [this.selfId]: 'killer' },
          }),
        0,
      );
  }

  /** After a mock meeting: the router calls this and the World restarts on the same scene. */
  resume(): void {
    const me = this.actors.get(this.selfId);
    if (!me) return;
    const spawn = this.content.scenes[me.scene]?.spawns[0];
    this.bus.emit('sceneEnter', { sceneId: me.scene, spawn: spawn?.id ?? '', facing: spawn?.facing ?? 's' });
  }

  snapshot(): PlayerSnap[] {
    const me = this.actors.get(this.selfId);
    const out: PlayerSnap[] = [];
    for (const b of this.actors.values()) {
      const visible =
        b.id === this.selfId ||
        (!b.dead &&
          me !== undefined &&
          (b.scene === me.scene || (b.from === me.scene && this.tick < b.busyUntil)));
      out.push({
        id: b.id,
        name: b.name,
        traits: b.traits,
        alive: true,
        presence: visible ? this.presenceOf(b) : null,
      });
    }
    return out;
  }

  doors(): DoorSnap[] {
    const me = this.actors.get(this.selfId);
    const scene = me ? this.content.scenes[me.scene] : undefined;
    return (scene?.portals ?? []).map((p) => ({
      id: p.id,
      state: p.minProfile === 'small' ? 0 : 1,
      swingUntilTick: this.swings.get(p.id) ?? 0,
    }));
  }

  clock() {
    return {
      tick: this.tick,
      phase: PHASE_ORDER[this.phaseIdx]!.id,
      phaseEndsTick: this.phaseEndsTick,
      startTick: 0,
    };
  }

  bodies(): BodySnap[] {
    const scene = this.actors.get(this.selfId)?.scene;
    return [...this.corpses.values()].filter((c) => c.scene === scene);
  }

  clues(): ClueSnap[] {
    const scene = this.actors.get(this.selfId)?.scene;
    return [...this.clueMap.values()].filter((c) => c.scene === scene);
  }

  notebook(): NotebookSnap[] {
    return this.book.slice();
  }

  dead(): boolean {
    return this.ghost;
  }

  kill(targetId: string): void {
    this.ability('kill', targetId);
  }

  ability(id: string, targetId?: string): void {
    const me = this.actors.get(this.selfId);
    if (!me || this.ghost) return this.fail(422, 'ghosts cannot do that');
    if (id !== 'kill') return this.fail(422, 'not in the mock');
    if (this.clock().phase === 2) return this.fail(425, 'not now');
    if (this.tick < me.busyUntil) return this.fail(426, 'busy');
    if (this.tick < this.killReadyTick) return this.fail(424, 'the knife is not ready');
    const victim = targetId === undefined ? undefined : this.actors.get(targetId);
    if (!victim || victim.id === me.id || victim.dead || victim.scene !== me.scene)
      return this.fail(422, 'no one there');
    if (Math.hypot(victim.x - me.x, victim.y - me.y) > KILL_REACH_PX) return this.fail(427, 'too far');
    victim.dead = true;
    victim.vx = victim.vy = 0;
    this.killReadyTick = this.tick + KILL_COOLDOWN_TICKS;
    this.bloodyUntil = this.tick + BLOOD_TICKS;
    this.corpses.set(`body_${victim.id}`, {
      id: `body_${victim.id}`,
      of: victim.id,
      scene: victim.scene,
      x: Math.round(victim.x),
      y: Math.round(victim.y),
      hidden: false,
    });
    this.spawnTrail(victim);
    this.bus.emit('noise', {
      sceneId: victim.scene,
      x: Math.round(victim.x),
      y: Math.round(victim.y),
      kind: 'killScream',
    });
  }

  hold(action: HoldAction, targetId: string, on: boolean): void {
    if (action !== 'collect') return;
    if (!on) {
      this.holding = null;
      return;
    }
    const me = this.actors.get(this.selfId);
    const clue = this.clueMap.get(targetId);
    if (!me || this.ghost || !clue || clue.scene !== me.scene) return this.fail(422, 'nothing to collect');
    if (this.book.some((e) => e.id === `entry_${targetId}`))
      return this.fail(422, 'already in your notebook');
    if (Math.hypot(clue.x - me.x, clue.y - me.y) > COLLECT_REACH_PX) return this.fail(427, 'too far');
    this.holding = { clueId: targetId, since: this.tick };
  }

  reportBody(bodyId: string): void {
    const me = this.actors.get(this.selfId);
    const body = this.corpses.get(bodyId);
    if (!me || this.ghost || !body || body.scene !== me.scene) return this.fail(422, 'no such body');
    if (Math.hypot(body.x - me.x, body.y - me.y) > REPORT_REACH_PX) return this.fail(427, 'too far');
    this.bus.emit('meetingRequest', { reason: 'body', callerId: this.selfId, bodyOf: body.of });
  }

  bell(): void {
    const me = this.actors.get(this.selfId);
    const bell = this.content.scenes.overworld?.props?.find((p) => p.id === 'ov.bell');
    if (!me || this.ghost || me.scene !== 'overworld' || !bell) return this.fail(422, 'no bell here');
    if (this.clock().phase === 2) return this.fail(425, 'not now');
    const dist = Math.hypot(me.x - (bell.x + 0.5) * TILE_PX, me.y - (bell.y + 0.5) * TILE_PX);
    if (dist > BELL_REACH_PX) return this.fail(427, 'too far');
    this.bus.emit('meetingRequest', { reason: 'bell', callerId: this.selfId });
  }

  sendMove(cmd: MoveCmd): void {
    this.move = cmd;
  }

  enterPortal(portalId: string): void {
    const me = this.actors.get(this.selfId);
    if (!me || this.tick < me.busyUntil) return this.fail(426, 'busy');
    const portal = this.content.scenes[me.scene]?.portals.find((p) => p.id === portalId);
    if (!portal) return this.fail(422, 'no such door');
    const dist = Math.hypot(me.x - (portal.x + 0.5) * TILE_PX, me.y - (portal.y + 0.5) * TILE_PX);
    if (dist > PORTAL_REACH_TILES * TILE_PX) return this.fail(427, 'too far');
    if (portal.minProfile !== 'small' || portal.to === null || portal.toSpawn === null)
      return this.fail(428, 'boarded up');
    const spawn = this.content.scenes[portal.to]?.spawns.find((s) => s.id === portal.toSpawn);
    if (!spawn) return this.fail(422, 'no way through');
    this.swings.set(portal.id, this.tick + SWING_TICKS);
    const from = me.scene;
    this.place(me, portal.to, spawn);
    me.from = from;
    me.busyUntil = this.tick + TRANSIT_TICKS;
    this.move = null;
    this.bus.emit('sceneEnter', {
      sceneId: portal.to,
      spawn: spawn.id,
      facing: spawn.facing,
    } satisfies SceneEnter);
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.bus.all.clear();
  }

  private fail(code: number, msg: string): void {
    this.bus.emit('error', { code, msg });
  }

  private place(b: Actor, scene: string, spawn: { x: number; y: number; facing: string }): void {
    b.scene = scene;
    b.x = (spawn.x + 0.5) * TILE_PX;
    b.y = (spawn.y + 0.5) * TILE_PX;
    b.yaw = (Math.max(0, DIRS.indexOf(spawn.facing)) * Math.PI) / 4;
    b.vx = b.vy = 0;
    b.from = null;
  }

  private grid(scene: string): NavGrid | null {
    let g = this.grids.get(scene);
    const nav = this.content.navs[scene];
    if (!g && nav) {
      g = new NavGrid(nav, 'small');
      this.grids.set(scene, g);
    }
    return g ?? null;
  }

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 2 ** 32;
  }

  /** Footprints one tile along the way to the nearest door, and a Thread beside that door (GDD 3.4). */
  private spawnTrail(victim: Actor): void {
    const portals = this.content.scenes[victim.scene]?.portals ?? [];
    let best: MockPortal | null = null;
    let bestD = Infinity;
    for (const p of portals) {
      const d = Math.hypot((p.x + 0.5) * TILE_PX - victim.x, (p.y + 0.5) * TILE_PX - victim.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;
    const px = (best.x + 0.5) * TILE_PX;
    const py = (best.y + 0.5) * TILE_PX;
    const ux = (px - victim.x) / bestD;
    const uy = (py - victim.y) / bestD;
    const dirIdx = DIRS.indexOf(dirName(ux, uy));
    const seq = () => `clue_${victim.scene}_${++this.clueSeq}`;
    const prints: MockClue = {
      id: seq(),
      scene: victim.scene,
      kind: ClueKind.footprints,
      value: victim.traits.height,
      dir: dirIdx,
      // One tile off the body: a clue under the body would lose every tie to "Report".
      x: Math.round(victim.x + ux * TILE_PX),
      y: Math.round(victim.y + uy * TILE_PX),
      claimed: false,
    };
    const thread: MockClue = {
      id: seq(),
      scene: victim.scene,
      kind: ClueKind.thread,
      value: this.actors.get(this.selfId)?.traits.scarf ?? 0,
      dir: 0,
      x: Math.round(px - ux * TILE_PX),
      y: Math.round(py - uy * TILE_PX),
      claimed: false,
    };
    this.clueMap.set(prints.id, prints);
    this.clueMap.set(thread.id, thread);
  }

  private advancePhase(): void {
    if (this.tick < this.phaseEndsTick) return;
    this.phaseIdx = this.phaseIdx + 1 >= PHASE_ORDER.length ? 1 : this.phaseIdx + 1;
    this.phaseEndsTick = this.tick + PHASE_ORDER[this.phaseIdx]!.ticks;
    this.bus.emit('phaseChange', { phase: PHASE_ORDER[this.phaseIdx]!.id, endsTick: this.phaseEndsTick });
  }

  private runHold(me: Actor): void {
    const h = this.holding;
    if (!h) return;
    const clue = this.clueMap.get(h.clueId);
    const moved = this.move !== null && Math.hypot(this.move.dx, this.move.dy) > 1e-3;
    if (!clue || moved || Math.hypot(clue.x - me.x, clue.y - me.y) > COLLECT_REACH_PX) {
      this.holding = null;
      return;
    }
    if (this.tick - h.since < COLLECT_TICKS) return;
    this.holding = null;
    clue.claimed = true;
    const entry: NotebookSnap = {
      id: `entry_${clue.id}`,
      clueKind: clue.kind,
      value: clue.value,
      sceneId: Math.max(0, this.content.sceneIds?.indexOf(clue.scene) ?? 0),
      tick: this.tick,
      status: clue.id === 'clue_teaching' ? NotebookStatus.teaching : NotebookStatus.claimed,
    };
    this.book.push(entry);
    this.bus.emit('clueFound', { entryId: entry.id });
  }

  private step(): void {
    this.tick++;
    this.advancePhase();
    const m = balanceJson.movement;
    for (const b of this.actors.values()) {
      b.vx = b.vy = 0;
      if (b.dead) continue;
      if (b.id === this.selfId) {
        const c = this.move;
        if (c && this.tick >= b.busyUntil) {
          const len = Math.hypot(c.dx, c.dy);
          if (len > 1e-3) {
            const speed = c.sneak
              ? SPEED(m.walkTilesPerS * m.sneakFactor)
              : SPEED(c.sprint ? m.runTilesPerS : m.walkTilesPerS);
            b.vx = (c.dx / len) * speed;
            b.vy = (c.dy / len) * speed;
          }
        }
      } else if (!this.still) {
        if (this.tick >= b.turnAt) {
          const a = this.rand() * Math.PI * 2;
          const still = this.rand() < 0.25;
          b.dirX = still ? 0 : Math.cos(a) * SPEED(m.walkTilesPerS);
          b.dirY = still ? 0 : Math.sin(a) * SPEED(m.walkTilesPerS);
          b.turnAt = this.tick + TICK_RATE * (1 + Math.floor(this.rand() * 3));
        }
        b.vx = b.dirX;
        b.vy = b.dirY;
      }
      const grid = this.grid(b.scene);
      const before = { x: b.x, y: b.y };
      if (grid && (b.vx !== 0 || b.vy !== 0)) {
        const r = moveAabb(grid, b.x, b.y, b.vx, b.vy, FOOT_HALF_PX, FOOT_HALF_PX);
        b.x = r.x;
        b.y = r.y;
        b.yaw = Math.atan2(b.vx, -b.vy);
      }
      b.moving = Math.hypot(b.x - before.x, b.y - before.y) > 0.01;
    }
    const me = this.actors.get(this.selfId);
    if (me) this.runHold(me);
  }

  private presenceOf(b: Actor): PresenceSnap {
    return {
      x: Math.round(b.x),
      y: Math.round(b.y),
      yaw: b.yaw,
      animId: b.moving ? 1 : 0,
      statusBits:
        (this.tick < b.busyUntil ? 1 : 0) | (b.id === this.selfId && this.tick < this.bloodyUntil ? 2 : 0),
      transitUntilTick: b.busyUntil,
    };
  }
}

/** Loads the scene graph and nav bitmaps lazily so the mock never weighs on a real-server bundle. */
export async function loadMockContent(): Promise<MockContent> {
  const content = await import('@wdi/content');
  return {
    navs: content.navs as unknown as MockContent['navs'],
    scenes: content.scenes as unknown as MockContent['scenes'],
    sceneIds: content.SCENE_IDS,
  };
}
