import { describe, expect, it } from 'vitest';
import { SampleBuffer, TELEPORT_PX } from './interpolation';

const s = (t: number, x: number, y = 0, animId = 1) => ({ t, x, y, yaw: 0, animId });

describe('SampleBuffer', () => {
  it('is empty before the first sample and snaps to it (teleport on view add)', () => {
    const b = new SampleBuffer();
    expect(b.at(100)).toBeNull();
    b.push(s(1000, 500, 300));
    expect(b.at(0)).toMatchObject({ x: 500, y: 300 });
    expect(b.at(5000)).toMatchObject({ x: 500, y: 300 });
  });

  it('lerps between the samples around the render time', () => {
    const b = new SampleBuffer();
    b.push(s(0, 0));
    b.push(s(50, 10));
    b.push(s(100, 20));
    expect(b.at(25)?.x).toBeCloseTo(5);
    expect(b.at(75)?.x).toBeCloseTo(15);
  });

  it('holds the newest sample instead of extrapolating', () => {
    const b = new SampleBuffer();
    b.push(s(0, 0));
    b.push(s(50, 10));
    expect(b.at(500)?.x).toBe(10);
  });

  it('teleports on a jump bigger than walking', () => {
    const b = new SampleBuffer();
    b.push(s(0, 0));
    b.push(s(50, 5));
    b.push(s(100, 5 + TELEPORT_PX + 1));
    expect(b.length).toBe(1);
    expect(b.at(60)?.x).toBe(5 + TELEPORT_PX + 1);
  });

  it('drops repeated identical samples so a still player keeps its history', () => {
    const b = new SampleBuffer();
    b.push(s(0, 3, 3, 0));
    b.push(s(50, 3, 3, 0));
    b.push(s(100, 3, 3, 0));
    expect(b.length).toBe(1);
  });
});
