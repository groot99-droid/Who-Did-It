import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { AUDIO_KEYS } from '../AudioBus';
import { MOB_HURT, NODE_BREAK, SFX_GAP_MS, Sfx, TRANSPORT, mobHurt } from './sfx';

function scene() {
  const played: string[] = [];
  const s = {
    cameras: { main: { worldView: { contains: (x: number) => x < 500 } } },
    registry: { get: () => ({ play: (k: string) => played.push(k) }) },
  } as unknown as Phaser.Scene;
  return { s, played };
}

describe('the round-8 cues (motion.md 2, round 8 8G)', () => {
  it('names only keys of AUDIO_KEYS', () => {
    const keys = new Set<string>(AUDIO_KEYS);
    const all = [...Object.values(MOB_HURT), ...Object.values(NODE_BREAK), ...Object.values(TRANSPORT)];
    for (const k of all) if (k) expect(keys.has(k), k).toBe(true);
    expect(mobHurt('bat')).toBe('mob_hurt_small');
    expect(mobHurt('wolf')).toBe('mob_hurt_wolf');
  });

  it('sounds on camera only, once per key within the gap, and never without a key', () => {
    const { s, played } = scene();
    let now = 0;
    const sfx = new Sfx(s, () => now);
    sfx.play('fx_hit', 900, 0);
    sfx.play(null, 10, 0);
    sfx.play('fx_hit', 10, 0);
    sfx.play('fx_hit', 20, 0);
    sfx.play('fx_coins', 20, 0);
    now += SFX_GAP_MS;
    sfx.play('fx_hit', 10, 0);
    expect(played).toEqual(['fx_hit', 'fx_coins', 'fx_hit']);
  });

  it('stays silent without an audio bus', () => {
    const s = {
      cameras: { main: { worldView: { contains: () => true } } },
      registry: { get: () => undefined },
    } as unknown as Phaser.Scene;
    expect(() => new Sfx(s).play('fx_hit', 0, 0)).not.toThrow();
  });
});
