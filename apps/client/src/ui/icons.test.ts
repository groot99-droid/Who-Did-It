import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EFFECT_KEYS, EffectId } from '@wdi/shared';
import { requestArtStyle, resetArtStyleForTests } from '../view/artStyle';
import { setDeviceForTests } from './artStyle/deviceGate';
import {
  ICON_KEYS,
  abilityIconUrl,
  effectIconUrl,
  iconImg,
  iconUrl,
  itemIconUrl,
  resetIconsForTests,
  signIconUrl,
  swapIcons,
} from './icons';
import { INSPECT_COPY } from './copy/inspect';

const ICONS = join(import.meta.dirname, '../../public/assets/ui/icons');
const stems = (dir: string, ext: string): string[] =>
  readdirSync(join(ICONS, dir))
    .filter((f) => f.endsWith(ext))
    .map((f) => f.slice(0, -ext.length))
    .sort();

/** A document just big enough for `iconImg` and `swapIcons`: elements are attribute maps. */
function fakeDocument() {
  const made: {
    attrs: Map<string, string>;
    setAttribute(k: string, v: string): void;
    getAttribute(k: string): string | null;
  }[] = [];
  return {
    made,
    documentElement: { dataset: {} as Record<string, string> },
    createElement: () => {
      const attrs = new Map<string, string>();
      const el = {
        attrs,
        setAttribute: (k: string, v: string) => void attrs.set(k, v),
        getAttribute: (k: string) => attrs.get(k) ?? null,
      };
      made.push(el);
      return el;
    },
    querySelectorAll: () => made.filter((e) => e.attrs.has('data-icon')),
  };
}

afterEach(() => {
  resetIconsForTests();
  resetArtStyleForTests();
  setDeviceForTests(null);
  vi.unstubAllGlobals();
});

describe('the icon table (SPRITES 9.1)', () => {
  it('lists exactly the masters, and every style has a file for each', () => {
    const keys = [...ICON_KEYS].sort();
    expect(stems('hd', '.svg')).toEqual(keys);
    expect(stems('8bit', '.png')).toEqual(keys);
    expect(stems('lowpoly', '.png')).toEqual(keys);
  });

  it('points each style at its own file: PNG for the pixel styles, the SVG master for HD', () => {
    expect(iconUrl('icon_effect_bleeding', '8bit')).toBe('/assets/ui/icons/8bit/icon_effect_bleeding.png');
    expect(iconUrl('icon_effect_bleeding', 'lowpoly')).toBe(
      '/assets/ui/icons/lowpoly/icon_effect_bleeding.png',
    );
    expect(iconUrl('icon_effect_bleeding', 'hd')).toBe('/assets/ui/icons/hd/icon_effect_bleeding.svg');
    expect(iconUrl('icon_effect_bleeding', 'vaporwave')).toBe(
      '/assets/ui/icons/8bit/icon_effect_bleeding.png',
    );
    expect(iconUrl('icon_effect_bleeding')).toBe('/assets/ui/icons/8bit/icon_effect_bleeding.png');
  });

  it('draws every effect, by key or wire id, and answers null for what is not drawn', () => {
    for (const k of EFFECT_KEYS) {
      expect(effectIconUrl(k, 'hd')).toBe(`/assets/ui/icons/hd/icon_effect_${k}.svg`);
      expect(effectIconUrl(EffectId[k], 'hd')).toBe(effectIconUrl(k, 'hd'));
    }
    expect(effectIconUrl(0 as never)).toBeNull();
    expect(iconUrl('icon_effect_nothing')).toBeNull();
    expect(itemIconUrl('crowbar')).toBeNull();
    expect(abilityIconUrl('poison')).toBeNull();
  });

  it('gives every inspect sign an icon, and the hunted look its own, not Indebted', () => {
    const signs = Object.keys(INSPECT_COPY).filter((k) => k.startsWith('inspect.sign.'));
    for (const s of signs) expect(signIconUrl(s), s).not.toBeNull();
    expect(signIconUrl('inspect.sign.hunted', 'hd')).toBe('/assets/ui/icons/hd/icon_sign_hunted.svg');
    expect(signIconUrl('hunted')).not.toBe(effectIconUrl('indebted'));
    expect(signIconUrl('inspect.sign.unknown')).toBeNull();
  });
});

describe('iconImg', () => {
  it('labels the image with its word and swaps its file when the art style changes', async () => {
    const doc = fakeDocument();
    vi.stubGlobal('document', doc);
    setDeviceForTests({ screenHeightPx: 1080, deviceMemoryGb: 8, maxTexturePx: 16384 });
    const img = iconImg('icon_effect_poisoned', 'Poisoned')!;
    const el = doc.made[0]!;
    expect(img).toBe(el);
    expect(el.getAttribute('alt')).toBe('Poisoned');
    expect(el.getAttribute('src')).toBe('/assets/ui/icons/8bit/icon_effect_poisoned.png');
    expect(await requestArtStyle('hd')).toBe(true);
    expect(el.getAttribute('src')).toBe('/assets/ui/icons/hd/icon_effect_poisoned.svg');
    expect(await requestArtStyle('lowpoly')).toBe(true);
    expect(el.getAttribute('src')).toBe('/assets/ui/icons/lowpoly/icon_effect_poisoned.png');
  });

  it('is null for an icon not drawn yet, so the caller keeps the word', () => {
    vi.stubGlobal('document', fakeDocument());
    expect(iconImg('icon_item_crowbar', 'Crowbar')).toBeNull();
  });

  it('swapIcons leaves an image whose key is not drawn as it was', () => {
    const doc = fakeDocument();
    const el = doc.createElement();
    el.setAttribute('data-icon', 'icon_item_crowbar');
    el.setAttribute('src', 'x.png');
    swapIcons(doc as never, 'hd');
    expect(el.getAttribute('src')).toBe('x.png');
  });
});
