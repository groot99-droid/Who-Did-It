import type Phaser from 'phaser';
import balance from '@wdi/content/data/balance.json';
import palette from '@wdi/content/data/palette.json';
import { TICK_RATE, TILE_PX } from '@wdi/shared/constants';
import { toScreen } from '@wdi/shared/iso';
import type { AvatarSnap, DoorSnap } from '../../net/world';
import { BIAS, depthAt } from '../iso';
import { reducedMotion as prefersReducedMotion } from '../vfx/motion';
import {
  climbHeight,
  elevationOf,
  openness,
  swingSide,
  trainAt,
  trainTrack,
  transportOf,
  type SceneGraph,
  type MapList,
  type TrainHeard,
  type TrainTrack,
  type TransportKind,
} from './transportSpecs';

type Ramp = keyof typeof palette.world.ramps;
const hex = (name: Ramp, i: number) => Number.parseInt(palette.world.ramps[name][i]!.slice(1), 16);

interface Pt {
  x: number;
  y: number;
}
/** A world point (px) raised `up` screen px. */
const at = (wx: number, wy: number, up = 0): Pt => {
  const s = toScreen(wx, wy);
  return { x: s.x, y: s.y - up };
};

function quad(g: Phaser.GameObjects.Graphics, p: Pt[], fill: number, alpha = 1): void {
  g.fillStyle(fill, alpha);
  g.fillTriangle(p[0]!.x, p[0]!.y, p[1]!.x, p[1]!.y, p[2]!.x, p[2]!.y);
  g.fillTriangle(p[0]!.x, p[0]!.y, p[2]!.x, p[2]!.y, p[3]!.x, p[3]!.y);
  g.lineStyle(2, hex('ink', 0), alpha);
  for (let i = 0; i < 4; i++) g.lineBetween(p[i]!.x, p[i]!.y, p[(i + 1) % 4]!.x, p[(i + 1) % 4]!.y);
}

/** A box from world px `[x0, x1, y0, y1]`, `z0..z1` screen px up: the two faces the camera sees, then the top. */
function box(
  g: Phaser.GameObjects.Graphics,
  b: number[],
  z: [number, number],
  ramp: Ramp,
  alpha: number,
): void {
  const [x0, x1, y0, y1] = b as [number, number, number, number];
  const n = palette.world.ramps[ramp].length;
  const faces = [
    [x0, y1, x1, y1, z[0], z[1]],
    [x1, y0, x1, y1, z[0], z[1]],
    [x0, y0, x1, y0, z[1], z[1], y1 - y0],
  ];
  faces.forEach(([ax, ay, bx, by, lo, hi, d = 0], i) => {
    const pts = [at(ax!, ay!, lo), at(bx!, by!, lo), at(bx!, by! + d, hi), at(ax!, ay! + d, hi)];
    quad(g, pts, hex(ramp, Math.max(0, n - 4 + i)), alpha);
  });
}

/** The four corners of a square on the ground, `half` px out from a point, with its far edge lifted to (`fy`, `up`). */
const square = (x: number, y: number, half: number, fy = y + half, up = 0): Pt[] => [
  at(x - half, y - half),
  at(x + half, y - half),
  at(x + half, fy, up),
  at(x - half, fy, up),
];

/** A portal as the World holds it: its `MapPortal`s (`sceneMap.ts`), typed by the fields the World declares. */
type Portal = { id: string; x: number; y: number; kind?: string; face?: string | null };

interface Swing {
  until: number;
  kind: TransportKind;
  /** Door: the side the leaf swings to; ladder: whether the crosser left this scene (else came in). */
  side: number;
  left: boolean;
  g: Phaser.GameObjects.Graphics;
}

const DOOR_W = TILE_PX * 0.8;
const DOOR_H = 88;
const LADDER_H = 70;
const OPEN_DEG = 80;

/**
 * Round 8, 8G (motion.md 2): the transport motion. While the server says a portal swings (`DoorSnap.swingUntilTick`,
 * GDD 3.7) a door leaf opens away from the one crossing and falls shut, a hatch lid lifts on its hinge, a well's or a
 * winze's ladder rises with a climber going down or up it, and every other portal shows a fading veil where someone
 * stepped through. The climber is an ink silhouette: it shows only what the vanishing figure already showed. The
 * Daily Train (GDD 3.3) rolls in to its platform on `train_arrive`, stands, and backs out after `train_brake`; only
 * the seats that hear it see it. The full-screen fades of a crossing are 8H's (`view/Transition.ts`).
 */
export class TransportView {
  private readonly swings = new Map<string, Swing>();
  private seen = new Set<string>();
  private sceneId = '';
  private track: TrainTrack | null = null;
  private heard: TrainHeard = { arriveAt: null, brakeAt: null };
  private train: Phaser.GameObjects.Graphics | null = null;
  private graph: { scenes: SceneGraph; maps: MapList } | null = null;
  /** Settles once the scene graph is loaded: until then no Train is drawn and a ladder climbs down. */
  readonly ready: Promise<void>;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reducedMotion: () => boolean = prefersReducedMotion,
  ) {
    this.ready = import('@wdi/content').then(({ scenes, maps }) => {
      this.graph = { scenes: scenes as unknown as SceneGraph, maps: maps as MapList };
      this.track = trainTrack(this.graph.scenes, this.graph.maps, this.sceneId);
    });
  }

  /** A noise pulse in this client's scene: the Train's are its cue. */
  pulse(kind: string, now: number): void {
    if (kind === 'train_arrive') this.heard = { arriveAt: now, brakeAt: null };
    else if (kind === 'train_brake') this.heard = { ...this.heard, brakeAt: now };
  }

  update(
    sceneId: string,
    portals: readonly Portal[],
    feed: { doors(): readonly DoorSnap[]; avatars(): readonly AvatarSnap[] },
    tick: number,
    now: number,
  ): void {
    if (sceneId !== this.sceneId) this.reset(sceneId);
    const doors = feed.doors();
    const avatars = feed.avatars();
    const reduced = this.reducedMotion();
    const reach = balance.doors.reachTiles * TILE_PX;
    for (const d of doors) {
      const p = portals.find((q) => q.id === d.id);
      if (!p || d.swingUntilTick <= tick) continue;
      let s = this.swings.get(d.id);
      if (!s || s.until !== d.swingUntilTick) {
        s?.g.destroy();
        let crosser: AvatarSnap | null = null;
        for (const a of avatars) {
          const dist = Math.hypot(a.x - p.x, a.y - p.y);
          if (dist <= reach && (!crosser || dist < Math.hypot(crosser.x - p.x, crosser.y - p.y))) crosser = a;
        }
        const kind = transportOf(p.kind ?? '', p.id, p.face ?? null);
        s = {
          until: d.swingUntilTick,
          kind,
          side: kind === 'door' ? swingSide(p.face as 's' | 'e', p, crosser) : 0,
          left: !crosser || this.seen.has(crosser.handle),
          g: this.scene.add.graphics(),
        };
        this.swings.set(d.id, s);
      }
      this.draw(s, p, (d.swingUntilTick - tick) / TICK_RATE, reduced);
    }
    for (const [id, s] of this.swings) {
      if (doors.some((d) => d.id === id && d.swingUntilTick > tick)) continue;
      s.g.destroy();
      this.swings.delete(id);
    }
    this.seen = new Set(avatars.map((a) => a.handle));
    this.drawTrain(now, reduced);
  }

  private draw(s: Swing, p: Portal, leftS: number, reduced: boolean): void {
    const g = s.g.clear();
    const open = openness(leftS, reduced);
    g.setDepth(depthAt(p.x, p.y, BIAS.overlay));
    if (s.kind === 'door') {
      const [wx, wy, nx, ny] = p.face === 's' ? [1, 0, 0, 1] : [0, 1, 1, 0];
      const hx = p.x - (wx * DOOR_W) / 2;
      const hy = p.y - (wy * DOOR_W) / 2;
      const ex = hx + wx * DOOR_W;
      const ey = hy + wy * DOOR_W;
      quad(g, [at(hx, hy), at(ex, ey), at(ex, ey, DOOR_H), at(hx, hy, DOOR_H)], hex('ink', 0), open);
      const a = (open * OPEN_DEG * s.side * Math.PI) / 180;
      const fx = hx + (wx * Math.cos(a) + nx * Math.sin(a)) * DOOR_W;
      const fy = hy + (wy * Math.cos(a) + ny * Math.sin(a)) * DOOR_W;
      quad(g, [at(hx, hy), at(fx, fy), at(fx, fy, DOOR_H), at(hx, hy, DOOR_H)], hex('wood', 3));
      return;
    }
    const half = DOOR_W / 2;
    if (s.kind === 'hatch') {
      const a = (open * 105 * Math.PI) / 180;
      quad(g, square(p.x, p.y, half), hex('ink', 0), open);
      quad(
        g,
        square(p.x, p.y, half, p.y - half + Math.cos(a) * DOOR_W, Math.sin(a) * DOOR_W),
        hex('wood', 4),
      );
      return;
    }
    if (s.kind === 'ladder') {
      const top = LADDER_H * open;
      const rail = (dx: number) => {
        const b = at(p.x + dx, p.y - dx);
        g.lineStyle(4, hex('wood', 2), 1).lineBetween(b.x, b.y, b.x, b.y - top);
      };
      g.fillStyle(hex('ink', 0), 0.8 * open).fillEllipse(at(p.x, p.y).x, at(p.x, p.y).y, 44, 22);
      rail(-9);
      rail(9);
      const l = at(p.x - 9, p.y + 9);
      const r = at(p.x + 9, p.y - 9);
      for (let h = 10; h < top; h += 12)
        g.lineStyle(3, hex('wood', 3), 1).lineBetween(l.x, l.y - h, r.x, r.y - h);
      if (reduced) return;
      const k = Math.min(1, (1 - leftS / balance.doors.swingS) / 0.6);
      const rise = this.graph ? elevationOf(this.graph.scenes, this.sceneId, p.id) : -1;
      const h = climbHeight(s.left, rise, k) * LADDER_H;
      const alpha = Math.min(1, Math.max(0, 1 + h / 18));
      const c = at(p.x, p.y, h);
      g.fillStyle(hex('ink', 1), alpha)
        .fillRect(c.x - 7, c.y - 26, 14, 26)
        .fillCircle(c.x, c.y - 32, 6);
      return;
    }
    const dark = p.kind !== 'gate' && p.kind !== 'forest_gate';
    const c = at(p.x, p.y);
    g.fillStyle(dark ? hex('ink', 0) : hex('lantern', 3), 0.3 * open);
    for (let i = 0; i < 3; i++) g.fillEllipse(c.x, c.y - i * 16 * open, 60 - i * 14, 30 - i * 7);
  }

  private drawTrain(now: number, reduced: boolean): void {
    const t = this.track ? trainAt(this.heard, now, reduced) : null;
    if (t === null || !this.track) {
      this.train?.destroy();
      this.train = null;
      // Gone (or never heard): forget the day's pulses.
      if (this.track) this.heard = { arriveAt: null, brakeAt: null };
      return;
    }
    const g = (this.train ??= this.scene.add.graphics()).clear();
    const tr = this.track;
    const sgn = Math.sign(tr.fromY - tr.stopY) || 1;
    const cy = (tr.stopY + 0.5 + (tr.fromY - tr.stopY) * t) * TILE_PX;
    const x0 = tr.x * TILE_PX + 6;
    const x1 = (tr.x + 1) * TILE_PX - 6;
    const alpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    const along = (a: number, b: number) => {
      const [ya, yb] = [cy + sgn * a * TILE_PX, cy + sgn * b * TILE_PX];
      return [x0, x1, Math.min(ya, yb), Math.max(ya, yb)];
    };
    // The engine on the spur's closed side, its tender car towards the open end it backs out through.
    box(g, along(-2.6, 2.4), [0, 8], 'ink', alpha);
    box(g, along(-2.6, -0.1), [8, 54], 'brick', alpha);
    box(g, along(-2.6, -1.8), [54, 70], 'stone', alpha);
    box(g, along(-0.9, -0.5), [54, 76], 'stone', alpha);
    box(g, along(0.1, 2.4), [8, 46], 'wood', alpha);
    g.setDepth(depthAt(x1, cy + 2.6 * TILE_PX, BIAS.character));
  }

  private reset(sceneId: string): void {
    for (const s of this.swings.values()) s.g.destroy();
    this.swings.clear();
    this.seen = new Set();
    this.sceneId = sceneId;
    this.track = this.graph && trainTrack(this.graph.scenes, this.graph.maps, sceneId);
    this.heard = { arriveAt: null, brakeAt: null };
    this.train?.destroy();
    this.train = null;
  }

  destroy(): void {
    this.reset('');
  }
}
