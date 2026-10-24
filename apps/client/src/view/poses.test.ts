import balance from '@wdi/content/data/balance.json';
import metrics from '@wdi/content/data/metrics.json';
import { describe, expect, it } from 'vitest';
import { AnimId, StatusBit } from './animIds';
import { type Clip, clipFor, dirFor, dirFromYaw, FOUR_DIR_CLIPS, RUN_SPEED_PX } from './poses';

describe('dirFromYaw (SPRITES 10.4)', () => {
  it('turns the world yaw into the atlas direction of the screen frame', () => {
    // world north (yaw 0) is the upper right of the screen
    expect(dirFromYaw(0)).toBe('ne');
    expect(dirFromYaw(Math.PI / 2)).toBe('se');
    expect(dirFromYaw(Math.PI)).toBe('sw');
    expect(dirFromYaw(-Math.PI / 2)).toBe('nw');
    expect(dirFromYaw(-Math.PI / 4)).toBe('n');
    expect(dirFromYaw(Math.PI * 0.75)).toBe('s');
  });
});

describe('clipFor', () => {
  const all = () => true;
  const none = () => false;
  const v1 = (c: Clip) => ['idle', 'walk', 'swing', 'die', 'interact'].includes(c);
  it('maps the shared animation ids to clips', () => {
    expect(clipFor(AnimId.idle, all)).toEqual({ clip: 'idle', tick: false });
    expect(clipFor(AnimId.walk, all)).toEqual({ clip: 'walk', tick: false });
    expect(clipFor(AnimId.swing, all)).toEqual({ clip: 'swing', tick: false });
    expect(clipFor(AnimId.die, all)).toEqual({ clip: 'die', tick: false });
  });
  it('plays the interact clip when the look has it', () => {
    expect(clipFor(AnimId.interact, all)).toEqual({ clip: 'interact', tick: false });
  });
  it('plays idle with a teal tick when it does not', () => {
    expect(clipFor(AnimId.interact, none)).toEqual({ clip: 'idle', tick: true });
  });
  it('treats an unknown id as idle', () => {
    expect(clipFor(99, all)).toEqual({ clip: 'idle', tick: false });
  });

  describe('the round-8 clips the server sends (motion.md 1)', () => {
    const sent: Array<[keyof typeof AnimId, Clip, Clip]> = [
      ['strike', 'strike', 'swing'],
      ['hurt', 'hurt', 'idle'],
      ['knockdown', 'knockdown', 'die'],
      ['getup', 'getup', 'idle'],
      ['inspect', 'inspect', 'interact'],
      ['threaten', 'threaten', 'idle'],
      ['cower', 'cower', 'idle'],
      ['fidget', 'fidget', 'idle'],
      ['stomp', 'stomp', 'idle'],
      ['eat', 'eat', 'idle'],
      ['rob', 'rob', 'interact'],
    ];
    for (const [id, clip, fallback] of sent) {
      it(`plays ${clip} for AnimId.${id}, and ${fallback} on a look without it`, () => {
        expect(clipFor(AnimId[id], all)).toEqual({ clip, tick: false });
        expect(clipFor(AnimId[id], v1).clip).toBe(fallback);
      });
    }
    it('marks a hold with the tick only when even the fallback is missing', () => {
      expect(clipFor(AnimId.inspect, none)).toEqual({ clip: 'idle', tick: true });
      expect(clipFor(AnimId.rob, none)).toEqual({ clip: 'idle', tick: true });
      expect(clipFor(AnimId.eat, none)).toEqual({ clip: 'idle', tick: false });
    });
  });

  describe('the gaits and the status loops the client picks', () => {
    const moving = (bits: number, speed = 0) => clipFor(AnimId.walk, all, { bits, speed }).clip;
    const standing = (bits: number) => clipFor(AnimId.idle, all, { bits, speed: 0 }).clip;
    it('runs above the midpoint of the walking and running speeds of GDD 3.7', () => {
      const walk = balance.movement.walkTilesPerS * metrics.tilePx;
      const run = balance.movement.runTilesPerS * metrics.tilePx;
      expect(RUN_SPEED_PX).toBe((walk + run) / 2);
      expect(moving(0, walk)).toBe('walk');
      expect(moving(0, RUN_SPEED_PX)).toBe('walk');
      expect(moving(0, run)).toBe('run');
      expect(clipFor(AnimId.walk, v1, { bits: 0, speed: run }).clip).toBe('walk');
    });
    it('limps under the limp bit, whatever the speed', () => {
      expect(moving(StatusBit.limp, 999)).toBe('limp');
      expect(moving(StatusBit.limp | StatusBit.dazed)).toBe('limp');
      expect(standing(StatusBit.limp)).toBe('idle');
    });
    it('staggers under fatigued or dazed', () => {
      expect(moving(StatusBit.fatigued, 999)).toBe('stagger');
      expect(moving(StatusBit.dazed)).toBe('stagger');
      expect(standing(StatusBit.dazed)).toBe('idle');
    });
    it('sways stunned and lies down whatever idle or walk the server sends', () => {
      expect(standing(StatusBit.stunned)).toBe('stunned');
      expect(moving(StatusBit.stunned | StatusBit.limp, 999)).toBe('stunned');
      expect(standing(StatusBit.down)).toBe('down');
      expect(moving(StatusBit.down | StatusBit.stunned)).toBe('down');
      expect(clipFor(AnimId.idle, v1, { bits: StatusBit.down, speed: 0 }).clip).toBe('die');
      expect(clipFor(AnimId.idle, v1, { bits: StatusBit.stunned, speed: 0 }).clip).toBe('idle');
    });
    it('leaves a server-sent one-shot alone under every bit', () => {
      expect(clipFor(AnimId.getup, all, { bits: StatusBit.down | StatusBit.dazed, speed: 0 }).clip).toBe(
        'getup',
      );
      expect(clipFor(AnimId.die, all, { bits: StatusBit.stunned, speed: 0 }).clip).toBe('die');
    });
    it('ignores the bits that draw signs or hide the nameplate', () => {
      const signs = StatusBit.bleeding | StatusBit.poisoned | StatusBit.bloody | StatusBit.transit;
      expect(moving(signs)).toBe('walk');
      expect(standing(signs)).toBe('idle');
    });
  });

  describe('dirFor (SPRITES 3: four-direction clips)', () => {
    it('keeps the eight directions of a gait, a strike and a hit', () => {
      for (const c of ['idle', 'walk', 'run', 'limp', 'stagger', 'swing', 'strike', 'hurt', 'die'] as const) {
        expect(FOUR_DIR_CLIPS.has(c), c).toBe(false);
        expect(dirFor(c, 'n')).toBe('n');
        expect(dirFor(c, 'w')).toBe('w');
      }
    });
    it('rounds a straight facing to the next diagonal clockwise for a one-shot or a mood idle', () => {
      for (const c of FOUR_DIR_CLIPS) {
        expect(dirFor(c, 'n'), c).toBe('ne');
        expect(dirFor(c, 'e'), c).toBe('se');
        expect(dirFor(c, 's'), c).toBe('sw');
        expect(dirFor(c, 'w'), c).toBe('nw');
        expect(dirFor(c, 'sw'), c).toBe('sw');
      }
      expect([...FOUR_DIR_CLIPS].sort()).toEqual([
        'cower',
        'down',
        'eat',
        'fidget',
        'getup',
        'inspect',
        'knockdown',
        'rob',
        'stomp',
        'stunned',
        'threaten',
      ]);
    });
  });
});
