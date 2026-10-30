import { describe, expect, it } from 'vitest';
import { OFFSET_RESET_MS, SampleBuffer, TELEPORT_PX, TICK_MS, TickClock } from './interpolation';

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

describe('remoteDelayMs (round 6)', () => {
  it('divides the interpolation delay by the sim speed', async () => {
    const { REMOTE_DELAY_MS, remoteDelayMs } = await import('./interpolation');
    expect(remoteDelayMs()).toBe(REMOTE_DELAY_MS);
    expect(remoteDelayMs(10)).toBe(REMOTE_DELAY_MS / 10);
  });
});

describe('TickClock (round 10, A294)', () => {
  it('stamps the first tick at its arrival and the same tick at the same time on every frame', () => {
    const c = new TickClock();
    expect(c.stamp(40, 2000)).toBe(2000);
    expect(c.stamp(40, 2016)).toBe(2000);
    expect(c.stamp(40, 2033)).toBe(2000);
  });

  it('spaces two ticks that arrive together one tick apart, around their arrival', () => {
    const c = new TickClock();
    let last: [number, number] = [0, 0];
    // The server of before x7: ticks 2n and 2n+1 land in one patch every 100 ms.
    for (let n = 0; n < 60; n++) {
      const arrival = 1000 + n * 100;
      last = [c.stamp(2 * n, arrival), c.stamp(2 * n + 1, arrival)];
    }
    // The offset settles on the pair's mean arrival with a ripple under 3 ms, so the pair straddles its arrival.
    const arrival = 1000 + 59 * 100;
    expect(Math.abs(last[1] - last[0] - TICK_MS)).toBeLessThan(3);
    expect(Math.abs(last[0] - (arrival - TICK_MS / 2))).toBeLessThan(3);
    expect(Math.abs(last[1] - (arrival + TICK_MS / 2))).toBeLessThan(3);
  });

  it('keeps the spacing even under arrival jitter', () => {
    const c = new TickClock();
    const stamps: number[] = [];
    for (let tick = 0; tick < 80; tick++) {
      const jitter = tick % 2 === 0 ? -20 : 20;
      stamps.push(c.stamp(tick, 1000 + tick * TICK_MS + jitter));
    }
    for (let i = 41; i < stamps.length; i++) {
      expect(Math.abs(stamps[i]! - stamps[i - 1]! - TICK_MS)).toBeLessThan(5);
    }
  });

  it('restarts on a tick that goes backwards (a new match) or a gap too big for jitter (a tab that slept)', () => {
    const c = new TickClock();
    c.stamp(100, 5000);
    expect(c.stamp(3, 6000)).toBe(6000);
    c.stamp(4, 6050);
    expect(c.stamp(5, 6100 + OFFSET_RESET_MS + 1)).toBe(6100 + OFFSET_RESET_MS + 1);
  });
});
