import mitt, { type Emitter } from 'mitt';
import balanceJson from '@wdi/content/data/balance.json';
import metricsJson from '@wdi/content/data/metrics.json';
import { type NavData, NavGrid, TICK_RATE, TILE_PX, moveAabb } from '@wdi/shared';
import type {
  DoorSnap,
  MoveCmd,
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
}
export interface MockContent {
  navs: Record<string, NavData>;
  scenes: Record<string, MockScene>;
}

interface Body {
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
}

const SPEED = (tilesPerS: number) => (tilesPerS * TILE_PX) / TICK_RATE;
const BOT_NAMES = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay'];

export class MockWorldFeed implements WorldFeed {
  readonly bus: Emitter<WorldFeedEvents> = mitt<WorldFeedEvents>();
  readonly selfId = 'mock-me';
  private readonly bodies = new Map<string, Body>();
  private readonly swings = new Map<string, number>();
  private readonly grids = new Map<string, NavGrid>();
  private move: MoveCmd | null = null;
  private tick = 0;
  private timer: number | null = null;
  private readonly endsTick: number;
  private seed = 12345;

  constructor(
    private readonly content: MockContent,
    selfName = 'You',
  ) {
    this.endsTick = TICK_RATE * 150;
    const names = [selfName, ...BOT_NAMES];
    names.forEach((name, i) => {
      const id = i === 0 ? this.selfId : `mock-bot-${i}`;
      const body: Body = {
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
      };
      this.bodies.set(id, body);
      const spawn = this.content.scenes.overworld?.spawns.find((s) => s.id === `square_${i}`);
      if (spawn) this.place(body, 'overworld', spawn);
    });
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
    const me = this.bodies.get(this.selfId);
    const spawn = this.content.scenes.overworld?.spawns.find((s) => s.id === 'square_0');
    if (me && spawn)
      this.bus.emit('sceneEnter', { sceneId: 'overworld', spawn: spawn.id, facing: spawn.facing });
  }

  snapshot(): PlayerSnap[] {
    const me = this.bodies.get(this.selfId);
    const out: PlayerSnap[] = [];
    for (const b of this.bodies.values()) {
      const visible =
        b.id === this.selfId ||
        (me !== undefined && (b.scene === me.scene || (b.from === me.scene && this.tick < b.busyUntil)));
      out.push({ id: b.id, name: b.name, traits: b.traits, presence: visible ? this.presenceOf(b) : null });
    }
    return out;
  }

  doors(): DoorSnap[] {
    const me = this.bodies.get(this.selfId);
    const scene = me ? this.content.scenes[me.scene] : undefined;
    return (scene?.portals ?? []).map((p) => ({
      id: p.id,
      state: p.minProfile === 'small' ? 0 : 1,
      swingUntilTick: this.swings.get(p.id) ?? 0,
    }));
  }

  clock() {
    return { tick: this.tick, phase: 2, phaseEndsTick: this.endsTick };
  }

  sendMove(cmd: MoveCmd): void {
    this.move = cmd;
  }

  enterPortal(portalId: string): void {
    const me = this.bodies.get(this.selfId);
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

  private place(b: Body, scene: string, spawn: { x: number; y: number; facing: string }): void {
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

  private step(): void {
    this.tick++;
    const m = balanceJson.movement;
    for (const b of this.bodies.values()) {
      b.vx = b.vy = 0;
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
      } else {
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
  }

  private presenceOf(b: Body): PresenceSnap {
    return {
      x: Math.round(b.x),
      y: Math.round(b.y),
      yaw: b.yaw,
      animId: b.moving ? 1 : 0,
      statusBits: this.tick < b.busyUntil ? 1 : 0,
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
  };
}
