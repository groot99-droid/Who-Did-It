import { describe, expect, it } from 'vitest';
import { AnimId } from './animIds';
import { clipFor, dirFromYaw } from './poses';

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
});
