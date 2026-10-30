import type Phaser from 'phaser';
import { REG_AUDIO } from '../../scenes/registry';
import type { AudioBus, AudioKey } from '../AudioBus';
import type { TransportKind } from '../transport/transportSpecs';

/** A sound at a point of the world (px), and only there: the viewer hears what its camera shows. */
export interface Cue {
  key: AudioKey;
  x: number;
  y: number;
}

/** A creature's hurt cry by kind; any other kind cries small. */
export const MOB_HURT: Readonly<Record<string, AudioKey>> = { wolf: 'mob_hurt_wolf', boar: 'mob_hurt_boar' };
export const mobHurt = (kind: string): AudioKey => MOB_HURT[kind] ?? 'mob_hurt_small';

/** A node's break by resource; a resource without a row breaks silently. */
export const NODE_BREAK: Readonly<Record<string, AudioKey>> = {
  timber: 'break_wood',
  stone: 'break_stone',
  tinOre: 'break_ore',
  resin: 'break_resin',
  herb: 'break_pluck',
  berries: 'break_pluck',
  mushroom: 'break_pluck',
  coins: 'fx_coins',
};

/** A portal's swing by how it moves; a door's creak is the World's own `door_open`. */
export const TRANSPORT: Readonly<Record<TransportKind, AudioKey | null>> = {
  door: null,
  hatch: 'hatch_open',
  ladder: 'ladder_climb',
  veil: 'portal_veil',
};

/** The same key again within this many ms is one sound: five sparks in a frame do not stack five hits. */
export const SFX_GAP_MS = 90;

/**
 * Round 8 (8G, motion.md 2): the sound side of the round-8 motion. The effects, the nodes and the transport call
 * `play` with a screen point; it sounds on the World's `AudioBus` (the registry's, so no World line) when the point
 * is on the viewer's camera and the same key has not just sounded. Every cue is of a public sight, so nothing heard
 * tells more than the drawn figure shows. A key the audio manifest lacks stays silent (`AudioBus.play`).
 */
export class Sfx {
  private readonly last = new Map<AudioKey, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  play(key: AudioKey | null | undefined, sx: number, sy: number): void {
    if (!key || !this.scene.cameras.main.worldView.contains(sx, sy)) return;
    const now = this.clock();
    if (now - (this.last.get(key) ?? -Infinity) < SFX_GAP_MS) return;
    this.last.set(key, now);
    (this.scene.registry.get(REG_AUDIO) as AudioBus | undefined)?.play(key);
  }
}
