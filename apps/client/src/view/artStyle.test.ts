import { afterEach, describe, expect, it, vi } from 'vitest';
import styleJson from '@wdi/content/data/style.json';
import { type DeviceProbe, setDeviceForTests } from '../ui/artStyle/deviceGate';
import {
  ART_STYLES,
  DEFAULT_STYLE_ID,
  RESERVED_STYLE_IDS,
  STORAGE_KEY,
  currentStyleId,
  isAvailableStyle,
  isArtStyleLocked,
  isShippedStyle,
  lockArtStyle,
  onArtStyleChanged,
  queryStyle,
  readStoredStyle,
  registerSwitcher,
  requestArtStyle,
  resetArtStyleForTests,
  resolveStyleId,
  storeStyle,
  styleGate,
} from './artStyle';

/** A desktop that holds HD (art.md 3); the tests run outside a browser, where the probe reads as a phone. */
const desktop: DeviceProbe = { screenHeightPx: 1080, deviceMemoryGb: 8, maxTexturePx: 16384 };
const phone: DeviceProbe = { screenHeightPx: 844, deviceMemoryGb: 4, maxTexturePx: 4096 };

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

afterEach(() => {
  resetArtStyleForTests();
  setDeviceForTests(null);
});

describe('the style list', () => {
  it('is read from style.json, never a literal', () => {
    expect(ART_STYLES.map((s) => s.id)).toEqual(styleJson.artStyles.styles.map((s) => s.id));
    expect(DEFAULT_STYLE_ID).toBe(styleJson.artStyles.default);
    expect(RESERVED_STYLE_IDS).toEqual(styleJson.artStyles.reserved);
  });

  it('ships 8-bit, low poly and HD, with nothing left reserved (A164)', () => {
    expect(isShippedStyle('8bit')).toBe(true);
    expect(isShippedStyle('lowpoly')).toBe(true);
    expect(isShippedStyle('hd')).toBe(true);
    expect(isShippedStyle('vaporwave')).toBe(false);
    expect(RESERVED_STYLE_IDS).toEqual([]);
  });
});

describe('the device gate', () => {
  it('offers 8-bit and low poly everywhere and HD only where the device holds it', () => {
    setDeviceForTests(phone);
    expect(styleGate('8bit')).toBeNull();
    expect(styleGate('lowpoly')).toBeNull();
    expect(styleGate('hd')).toBe('screen');
    expect(isAvailableStyle('hd')).toBe(false);
    setDeviceForTests(desktop);
    expect(styleGate('hd')).toBeNull();
    expect(isAvailableStyle('hd')).toBe(true);
    expect(isAvailableStyle('vaporwave')).toBe(false);
  });

  it('drops a stored or queried HD pick on a device that cannot show it', () => {
    setDeviceForTests(phone);
    expect(readStoredStyle({ getItem: () => 'hd' })).toBeNull();
    expect(queryStyle('?art=hd')).toBeNull();
    expect(resolveStyleId('?art=hd', { getItem: () => 'hd' })).toBe(DEFAULT_STYLE_ID);
    expect(resolveStyleId('?art=hd', { getItem: () => 'lowpoly' })).toBe('lowpoly');
    setDeviceForTests(desktop);
    expect(readStoredStyle({ getItem: () => 'hd' })).toBe('hd');
    expect(resolveStyleId('?art=hd', { getItem: () => null })).toBe('hd');
  });

  it('refuses to switch to HD on a gated device and switches on one that holds it', async () => {
    const swap = vi.fn(() => Promise.resolve());
    registerSwitcher(swap);
    setDeviceForTests(phone);
    expect(await requestArtStyle('hd')).toBe(false);
    expect(swap).not.toHaveBeenCalled();
    setDeviceForTests(desktop);
    expect(await requestArtStyle('hd')).toBe(true);
    expect(swap).toHaveBeenCalledWith('hd');
    expect(currentStyleId()).toBe('hd');
  });
});

describe('the storage guard', () => {
  it('reads a stored shipped id', () => {
    expect(readStoredStyle({ getItem: (k) => (k === STORAGE_KEY ? 'lowpoly' : null) })).toBe('lowpoly');
  });

  it('treats empty, blocked and unknown storage as no pick', () => {
    expect(readStoredStyle({ getItem: () => null })).toBeNull();
    expect(readStoredStyle(throwing)).toBeNull();
    expect(readStoredStyle({ getItem: () => 'vaporwave' })).toBeNull();
    expect(readStoredStyle(null)).toBeNull();
  });

  it('never throws on a write', () => {
    expect(() => storeStyle('lowpoly', throwing)).not.toThrow();
    expect(() => storeStyle('lowpoly', null)).not.toThrow();
    const set = vi.fn();
    storeStyle('lowpoly', { setItem: set });
    expect(set).toHaveBeenCalledWith(STORAGE_KEY, 'lowpoly');
  });

  it('falls back to the default when storage is empty, blocked or holds an unknown id', () => {
    expect(resolveStyleId('', { getItem: () => null })).toBe(DEFAULT_STYLE_ID);
    expect(resolveStyleId('', throwing)).toBe(DEFAULT_STYLE_ID);
    expect(resolveStyleId('', { getItem: () => 'nope' })).toBe(DEFAULT_STYLE_ID);
  });
});

describe('the pick', () => {
  it('lets ?art=<id> override the stored pick', () => {
    expect(resolveStyleId('?art=lowpoly', { getItem: () => '8bit' })).toBe('lowpoly');
    expect(resolveStyleId('?art=8bit', { getItem: () => 'lowpoly' })).toBe('8bit');
  });

  it('ignores ?art=placeholder and unknown ids as a style', () => {
    expect(queryStyle('?art=placeholder')).toBeNull();
    expect(queryStyle('?art=vaporwave')).toBeNull();
    expect(resolveStyleId('?art=placeholder', { getItem: () => 'lowpoly' })).toBe('lowpoly');
  });
});

describe('requestArtStyle', () => {
  it('swaps, then stores and announces the new style', async () => {
    const swap = vi.fn(() => Promise.resolve());
    registerSwitcher(swap);
    const heard: string[] = [];
    onArtStyleChanged((id) => heard.push(id));
    expect(await requestArtStyle('lowpoly')).toBe(true);
    expect(swap).toHaveBeenCalledWith('lowpoly');
    expect(currentStyleId()).toBe('lowpoly');
    expect(heard).toEqual(['lowpoly']);
  });

  it('stays on the old style when the swap fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerSwitcher(() => Promise.reject(new Error('404')));
    const heard: string[] = [];
    onArtStyleChanged((id) => heard.push(id));
    const before = currentStyleId();
    expect(await requestArtStyle('lowpoly')).toBe(false);
    expect(currentStyleId()).toBe(before);
    expect(heard).toEqual([]);
  });

  it('refuses an unknown id and ignores the style already shown', async () => {
    const swap = vi.fn(() => Promise.resolve());
    registerSwitcher(swap);
    expect(await requestArtStyle('nope')).toBe(false);
    expect(await requestArtStyle(currentStyleId())).toBe(true);
    expect(swap).not.toHaveBeenCalled();
  });

  it('refuses a change while a match runs, and still answers for the style shown (S5)', async () => {
    const swap = vi.fn(() => Promise.resolve());
    registerSwitcher(swap);
    const heard: string[] = [];
    onArtStyleChanged((id) => heard.push(id));
    lockArtStyle(true);
    expect(isArtStyleLocked()).toBe(true);
    expect(await requestArtStyle('lowpoly')).toBe(false);
    expect(await requestArtStyle(currentStyleId())).toBe(true);
    expect(swap).not.toHaveBeenCalled();
    expect(heard).toEqual([]);
    lockArtStyle(false);
    expect(await requestArtStyle('lowpoly')).toBe(true);
    expect(heard).toEqual(['lowpoly']);
  });

  it('refuses a second switch while one runs', async () => {
    let release: () => void = () => undefined;
    registerSwitcher(() => new Promise<void>((r) => (release = r)));
    const first = requestArtStyle('lowpoly');
    expect(await requestArtStyle('8bit')).toBe(false);
    release();
    expect(await first).toBe(true);
  });
});
