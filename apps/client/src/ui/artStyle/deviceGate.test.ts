import { afterEach, describe, expect, it } from 'vitest';
import styleJson from '@wdi/content/data/style.json';
import { type DeviceProbe, deviceAllows, gateVerdict, probeDevice, setDeviceForTests } from './deviceGate';

// The HD device gate (docs/round8/art.md 3, GDD 3.13, A164) against the thresholds of style.json.

const hd = styleJson.artStyles.styles.find((s) => s.id === 'hd')!.requires!;
const big: DeviceProbe = { screenHeightPx: 1080, deviceMemoryGb: 8, maxTexturePx: 16384 };

afterEach(() => setDeviceForTests(null));

describe('gateVerdict', () => {
  it('passes a style without requirements on any device', () => {
    expect(
      gateVerdict(undefined, { screenHeightPx: 0, deviceMemoryGb: null, maxTexturePx: null }),
    ).toBeNull();
  });

  it('passes a device at or above every threshold', () => {
    expect(gateVerdict(hd, big)).toBeNull();
    expect(
      gateVerdict(hd, {
        screenHeightPx: hd.screenHeightPx,
        deviceMemoryGb: hd.deviceMemoryGb,
        maxTexturePx: hd.texturePx,
      }),
    ).toBeNull();
    expect(deviceAllows(hd, big)).toBe(true);
  });

  it('names the screen first, then the memory, then the texture size', () => {
    expect(gateVerdict(hd, { ...big, screenHeightPx: hd.screenHeightPx - 1 })).toBe('screen');
    expect(gateVerdict(hd, { ...big, deviceMemoryGb: hd.deviceMemoryGb / 2 })).toBe('memory');
    expect(gateVerdict(hd, { ...big, maxTexturePx: hd.texturePx / 2 })).toBe('texture');
    expect(gateVerdict(hd, { ...big, maxTexturePx: null })).toBe('texture');
    expect(gateVerdict(hd, { screenHeightPx: 844, deviceMemoryGb: 2, maxTexturePx: 2048 })).toBe('screen');
    expect(deviceAllows(hd, { ...big, screenHeightPx: 844 })).toBe(false);
  });

  it('does not hold back a browser that keeps its memory to itself', () => {
    expect(gateVerdict(hd, { ...big, deviceMemoryGb: null })).toBeNull();
  });
});

describe('probeDevice', () => {
  it('reads as no screen, no memory and no WebGL outside a browser, so a gated style stays off', () => {
    expect(probeDevice()).toEqual({ screenHeightPx: 0, deviceMemoryGb: null, maxTexturePx: null });
    expect(gateVerdict(hd, probeDevice())).toBe('screen');
  });

  it('answers with the test device once set, and reads again once cleared', () => {
    setDeviceForTests(big);
    expect(probeDevice()).toBe(big);
    setDeviceForTests(null);
    expect(probeDevice().screenHeightPx).toBe(0);
  });
});
