import { afterEach, describe, expect, it, vi } from 'vitest';
import styleJson from '@wdi/content/data/style.json';
import {
  ART_STYLES,
  DEFAULT_STYLE_ID,
  RESERVED_STYLE_IDS,
  STORAGE_KEY,
  currentStyleId,
  isShippedStyle,
  onArtStyleChanged,
  queryStyle,
  readStoredStyle,
  registerSwitcher,
  requestArtStyle,
  resetArtStyleForTests,
  resolveStyleId,
  storeStyle,
} from './artStyle';

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

afterEach(resetArtStyleForTests);

describe('the style list', () => {
  it('is read from style.json, never a literal', () => {
    expect(ART_STYLES.map((s) => s.id)).toEqual(styleJson.artStyles.styles.map((s) => s.id));
    expect(DEFAULT_STYLE_ID).toBe(styleJson.artStyles.default);
    expect(RESERVED_STYLE_IDS).toEqual(styleJson.artStyles.reserved);
  });

  it('ships 8-bit and low poly and reserves HD without shipping it', () => {
    expect(isShippedStyle('8bit')).toBe(true);
    expect(isShippedStyle('lowpoly')).toBe(true);
    expect(isShippedStyle('hd')).toBe(false);
    expect(RESERVED_STYLE_IDS).toContain('hd');
  });
});

describe('the storage guard', () => {
  it('reads a stored shipped id', () => {
    expect(readStoredStyle({ getItem: (k) => (k === STORAGE_KEY ? 'lowpoly' : null) })).toBe('lowpoly');
  });

  it('treats empty, blocked and unknown storage as no pick', () => {
    expect(readStoredStyle({ getItem: () => null })).toBeNull();
    expect(readStoredStyle(throwing)).toBeNull();
    expect(readStoredStyle({ getItem: () => 'hd' })).toBeNull();
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
    expect(queryStyle('?art=hd')).toBeNull();
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

  it('refuses a reserved or unknown id and ignores the style already shown', async () => {
    const swap = vi.fn(() => Promise.resolve());
    registerSwitcher(swap);
    expect(await requestArtStyle('hd')).toBe(false);
    expect(await requestArtStyle('nope')).toBe(false);
    expect(await requestArtStyle(currentStyleId())).toBe(true);
    expect(swap).not.toHaveBeenCalled();
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
