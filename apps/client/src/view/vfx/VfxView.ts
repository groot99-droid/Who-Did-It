import type Phaser from 'phaser';
import metrics from '@wdi/content/data/metrics.json';
import { toScreen } from '@wdi/shared/iso';
import type { AvatarSnap, MobSnap } from '../../net/world';
import { BIAS, depthAt } from '../iso';
import { FX, FX_SHAPES, STILL_COUNT, STILL_MS, ramp, type FxKind, type FxShape } from './fxSpecs';
import { avatarFx, mobFx, type FxEvent, type Seen } from './fxTriggers';
import { reducedMotion as prefersReducedMotion } from './motion';

/** The texture of a particle shape. */
export const fxTexture = (shape: FxShape): string => `fx_${shape}`;

/** Each shape drawn once in white (tinted per particle) with an ink rim, at 2x for the display scale. */
function drawShape(g: Phaser.GameObjects.Graphics, shape: FxShape): [number, number] {
  const ink = ramp('ink', 0);
  g.clear();
  switch (shape) {
    case 'spark':
      g.fillStyle(0xffffff).fillTriangle(8, 0, 10, 8, 6, 8).fillTriangle(8, 16, 10, 8, 6, 8);
      g.fillTriangle(0, 8, 8, 6, 8, 10).fillTriangle(16, 8, 8, 6, 8, 10);
      return [16, 16];
    case 'drop':
      g.fillStyle(ink).fillCircle(4, 5, 4);
      g.fillStyle(0xffffff).fillCircle(4, 5, 3);
      return [8, 10];
    case 'puff':
      g.fillStyle(0xffffff, 0.75).fillCircle(8, 8, 8);
      return [16, 16];
    case 'coin':
      g.fillStyle(ink).fillEllipse(6, 5, 12, 10);
      g.fillStyle(0xffffff).fillEllipse(6, 5, 10, 8);
      return [12, 10];
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 3 : 8;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        return { x: 8 + Math.cos(a) * r, y: 8 + Math.sin(a) * r };
      });
      // A fan of triangles from the centre (fillPoints wants Phaser vectors, which this view does not construct).
      const fan = (colour: number, dy: number) => {
        g.fillStyle(colour);
        pts.forEach((p, i) => {
          const q = pts[(i + 1) % pts.length]!;
          g.fillTriangle(8, 8 + dy, p.x, p.y + dy, q.x, q.y + dy);
        });
      };
      fan(ink, 1);
      fan(0xffffff, 0);
      return [16, 17];
    }
    case 'chip':
      g.fillStyle(ink).fillRect(0, 0, 8, 6);
      g.fillStyle(0xffffff).fillRect(1, 1, 6, 4);
      return [8, 6];
    case 'slip':
      g.fillStyle(ink).fillRect(0, 0, 12, 9);
      g.fillStyle(0xffffff).fillRect(1, 1, 10, 7);
      g.fillStyle(ink).fillRect(3, 3, 6, 1).fillRect(3, 5, 4, 1);
      return [12, 9];
  }
}

/**
 * Round 8 (8G, motion.md 2): every effect of the list, as particle bursts at a figure's feet. It watches the public
 * fields of the avatars and creatures in this client's scene (`fxTriggers.ts`), and other sessions call `play` for
 * the effects of their own events: 8C a coin burst on a dropped purse or a sale, 8D the HQ build dust, the Clerk's
 * ledger and the mailbag. Under reduced motion a burst is a static mark that is cut after a moment.
 */
export class VfxView {
  private readonly avatars = new Map<string, Seen>();
  private readonly mobs = new Map<string, Seen>();
  private ready = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reducedMotion: () => boolean = prefersReducedMotion,
  ) {}

  private textures(): void {
    if (this.ready) return;
    this.ready = true;
    const g = this.scene.make.graphics({}, false);
    for (const shape of FX_SHAPES) {
      if (this.scene.textures.exists(fxTexture(shape))) continue;
      const [w, h] = drawShape(g, shape);
      g.generateTexture(fxTexture(shape), w, h);
    }
    g.destroy();
  }

  update(avatars: readonly AvatarSnap[], mobs: readonly MobSnap[], now: number): void {
    const events: FxEvent[] = [];
    this.diff(this.avatars, avatars, (a) => a.handle, avatarFx, events, now);
    this.diff(this.mobs, mobs, (m) => m.id, mobFx, events, now);
    for (const e of events) this.play(e.kind, e.x, e.y);
  }

  private diff<T>(
    seen: Map<string, Seen>,
    items: readonly T[],
    id: (t: T) => string,
    fx: (prev: Seen | undefined, t: T, now: number) => { fx: FxEvent[]; seen: Seen },
    out: FxEvent[],
    now: number,
  ): void {
    const present = new Set<string>();
    for (const t of items) {
      const key = id(t);
      present.add(key);
      const r = fx(seen.get(key), t, now);
      seen.set(key, r.seen);
      out.push(...r.fx);
    }
    for (const key of seen.keys()) if (!present.has(key)) seen.delete(key);
  }

  /** One effect at a world point (px). */
  play(kind: FxKind, wx: number, wy: number): void {
    this.textures();
    const spec = FX[kind];
    // Particles are drawn at the art's scale, so a burst keeps its size against the figures (8F may grow them).
    const k = metrics.iso.artScale;
    const at = toScreen(wx, wy);
    const depth = depthAt(wx, wy, BIAS.character) + 0.01;
    const texture = fxTexture(spec.shape);
    if (this.reducedMotion()) {
      const marks = Array.from({ length: Math.min(STILL_COUNT, spec.count) }, (_, i) =>
        this.scene.add
          .image(at.x + (i - 1) * 8, at.y - spec.lift - (i % 2) * 6, texture)
          .setTint(spec.tints[i % spec.tints.length]!)
          .setScale(k * spec.scale[0])
          .setDepth(depth),
      );
      this.scene.time.delayedCall(STILL_MS, () => marks.forEach((m) => m.destroy()));
      return;
    }
    const emitter = this.scene.add.particles(at.x, at.y - spec.lift, texture, {
      emitting: false,
      speed: { min: spec.speed[0] * k * 0.75, max: spec.speed[1] * k * 0.75 },
      angle: { min: spec.angle[0], max: spec.angle[1] },
      gravityY: spec.gravity * k * 0.75,
      lifespan: spec.lifespanMs,
      scale: { start: spec.scale[0] * k, end: spec.scale[1] * k },
      alpha: { start: 1, end: 0 },
      rotate: spec.spin ? { start: 0, end: spec.spin } : 0,
      tint: [...spec.tints],
    });
    emitter.setDepth(depth);
    emitter.explode(spec.count);
    this.scene.time.delayedCall(spec.lifespanMs + 50, () => emitter.destroy());
  }

  destroy(): void {
    this.avatars.clear();
    this.mobs.clear();
  }
}
