import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The design system's contract (docs/UI.md): palette colours only, the 2 px stroke and the 48 px
// grid on every SVG, nine-slice frames that match their CSS data URIs, and WCAG AA on every token
// pair the components use. The ratios here are the ones printed in docs/UI.md 10.

const THEME = import.meta.dirname;
const ROOT = join(THEME, '../../../../..');
const UI_ASSETS = join(ROOT, 'apps/client/public/assets/ui');
const palette: Record<string, string> = JSON.parse(
  readFileSync(join(ROOT, 'packages/content/data/palette.json'), 'utf8'),
).colors;
const paletteHex = new Set(Object.values(palette).map((h) => h.toUpperCase()));

const tokens = readFileSync(join(THEME, 'tokens.css'), 'utf8');
const components = readFileSync(join(THEME, 'components.css'), 'utf8');

function hexes(text: string): string[] {
  return [...text.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** `fg` may be `name` or `name@alpha`, composited over `bg` before measuring. */
export function contrast(fg: string, bg: string): number {
  const [fgName, alphaText] = fg.split('@') as [string, string | undefined];
  const alpha = alphaText === undefined ? 1 : Number(alphaText);
  const b = rgb(palette[bg]!);
  const f = rgb(palette[fgName]!).map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha))) as [
    number,
    number,
    number,
  ];
  const [hi, lo] = [luminance(f), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** docs/UI.md 10: every text pair the components ship, with the WCAG AA floor it must clear. */
export const TEXT_PAIRS: { fg: string; bg: string; use: string; min: number }[] = [
  { fg: 'bone', bg: 'ink', use: 'text on the page and in wells', min: 4.5 },
  { fg: 'bone', bg: 'slate', use: 'text on panels and the card back', min: 4.5 },
  { fg: 'bone@0.72', bg: 'slate', use: 'muted text and hints on panels', min: 4.5 },
  { fg: 'bone@0.72', bg: 'ink', use: 'muted text on the page and in the loft', min: 4.5 },
  { fg: 'ink', bg: 'bone', use: 'text on paper: cards, buttons, inputs, chips, toasts', min: 4.5 },
  { fg: 'slate', bg: 'bone', use: 'muted text on paper', min: 4.5 },
  { fg: 'ink', bg: 'mustard', use: 'primary button, lead chip, neutral stripe', min: 4.5 },
  { fg: 'bone', bg: 'blood', use: 'danger button, cabal stripe, danger chip', min: 4.5 },
  { fg: 'ink', bg: 'moon', use: 'village stripe, verified chip', min: 4.5 },
  { fg: 'ink', bg: 'teal', use: 'ready chip', min: 4.5 },
  { fg: 'lantern', bg: 'ink', use: 'HUD clock digits, warnings on the page', min: 4.5 },
  { fg: 'lantern', bg: 'slate', use: 'field errors on panels', min: 4.5 },
  { fg: 'moon', bg: 'ink', use: 'night clock digits', min: 4.5 },
  { fg: 'teal', bg: 'slate', use: 'links on panels', min: 4.5 },
  { fg: 'teal', bg: 'ink', use: 'links on the page', min: 4.5 },
  { fg: 'blood', bg: 'bone', use: 'field errors on paper', min: 4.5 },
  { fg: 'mustard', bg: 'slate', use: 'selected tab rule, focus ring on panels (non-text, 3:1)', min: 3 },
  { fg: 'mustard', bg: 'ink', use: 'focus ring on the page (non-text, 3:1)', min: 3 },
  { fg: 'fog', bg: 'ink', use: 'display text 24 px and up only (large text, 3:1)', min: 3 },
];

describe('tokens.css', () => {
  it('mirrors palette.json colour for colour, in file order', () => {
    const block = [...tokens.matchAll(/--wdi-([a-z]+): (#[0-9a-fA-F]{6});/g)].map((m) => [
      m[1],
      m[2]!.toUpperCase(),
    ]);
    expect(block).toEqual(Object.entries(palette));
  });

  it('carries each colour as an RGB triplet for alpha use', () => {
    for (const [name, hex] of Object.entries(palette)) {
      expect(tokens).toContain(`--wdi-${name}-rgb: ${rgb(hex).join(' ')};`);
    }
  });

  it('uses no hex outside the palette, in tokens or components', () => {
    for (const hex of [...hexes(tokens), ...hexes(components)]) expect(paletteHex).toContain(hex);
  });

  it('uses only the two self-hosted fonts', () => {
    const families = [...tokens.matchAll(/font-family: ([A-Za-z]+);/g)].map((m) => m[1]);
    expect(families.sort()).toEqual(['Inter', 'Oswald']);
    expect(components).not.toMatch(/font-family: (?!var\(--wdi-font)/);
  });

  it('embeds the nine-slice frames exactly as the SVG files', () => {
    for (const name of ['plain', 'village', 'cabal', 'neutral']) {
      const svg = readFileSync(join(UI_ASSETS, 'frames', `frame_${name}.svg`), 'utf8');
      const uri = svg
        .replace(/<title>.*<\/title>\n/, '')
        .replace(/\n\s*/g, '')
        .replace(/"/g, "'")
        .replace(/#/g, '%23')
        .replace(/</g, '%3C')
        .replace(/>/g, '%3E');
      expect(tokens).toContain(`--wdi-frame-${name}: url("data:image/svg+xml,${uri}");`);
      expect(svg).toContain('viewBox="0 0 192 288"');
      expect(svg).toContain('data-slice="24"');
    }
  });
});

describe('tokens.css mirrors style.json ui (docs/UI.md 4, 5)', () => {
  const ui = JSON.parse(readFileSync(join(ROOT, 'packages/content/data/style.json'), 'utf8')).ui;
  const token = (name: string) => tokens.match(new RegExp(`--wdi-${name}: ([^;]+);`))?.[1];
  const px = (value: string | undefined) =>
    value?.endsWith('rem') ? parseFloat(value) * 16 : value?.endsWith('px') ? parseFloat(value) : NaN;

  it('type scale', () => {
    const map: Record<string, string> = {
      displayXl: 'display-xl',
      displayLg: 'display-lg',
      displayMd: 'display-md',
      displaySm: 'display-sm',
      textLg: 'text-lg',
      textMd: 'text-md',
      textSm: 'text-sm',
      textXs: 'text-xs',
    };
    for (const [key, name] of Object.entries(map)) expect(px(token(name)), name).toBe(ui.typeScalePx[key]);
    expect(Number(token('leading-display'))).toBe(ui.lineHeight.display);
    expect(Number(token('leading-text'))).toBe(ui.lineHeight.text);
    expect(parseFloat(token('tracking-display')!)).toBe(ui.trackingEm.display);
    expect(parseFloat(token('tracking-caps')!)).toBe(ui.trackingEm.caps);
    expect(parseFloat(token('tracking-code')!)).toBe(ui.trackingEm.code);
  });

  it('space, radii, frame margin, grid and touch target', () => {
    ui.spacePx.forEach((v: number, i: number) => expect(px(token(`space-${i + 1}`))).toBe(v));
    for (const [k, v] of Object.entries(ui.radiusPx)) expect(px(token(`radius-${k}`)), k).toBe(v);
    expect(px(token('frame-margin'))).toBe(ui.frameMarginPx);
    expect(px(token('grid'))).toBe(ui.gridPx);
    expect(px(token('touch'))).toBe(ui.touchTargetPx);
  });

  it('fonts', () => {
    expect(token('font-display')?.startsWith(ui.fonts.display)).toBe(true);
    expect(token('font-text')?.startsWith(ui.fonts.text)).toBe(true);
  });
});

describe('UI SVG assets (frames, marks, glyphs)', () => {
  for (const dir of ['frames', 'marks', 'glyphs']) {
    const files = readdirSync(join(UI_ASSETS, dir))
      .filter((f) => f.endsWith('.svg'))
      .sort();
    it(`${dir}/ is not empty`, () => expect(files.length).toBeGreaterThan(0));
    for (const f of files) {
      it(`${dir}/${f}: 48 px grid, 2 px strokes, palette colours only, no text or images`, () => {
        const svg = readFileSync(join(UI_ASSETS, dir, f), 'utf8');
        const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/) ?? [];
        expect(Number(w) % 48).toBe(0);
        expect(Number(h) % 48).toBe(0);
        for (const [, sw] of svg.matchAll(/stroke-width="([^"]+)"/g)) expect(sw).toBe('2');
        expect(svg).toMatch(/stroke="#12141C"/);
        for (const hex of hexes(svg)) expect(paletteHex).toContain(hex);
        expect(svg).not.toMatch(/<text|font-family|<image|href=|<style/);
        expect(svg).toMatch(/<title>[^<]+<\/title>/);
      });
    }
  }
});

describe('contrast (docs/UI.md 10)', () => {
  for (const pair of TEXT_PAIRS) {
    it(`${pair.fg} on ${pair.bg} >= ${pair.min}: ${pair.use}`, () => {
      expect(contrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min);
    });
  }

  it('documents every pair in docs/UI.md with its measured ratio', () => {
    const doc = readFileSync(join(ROOT, 'docs/UI.md'), 'utf8');
    for (const pair of TEXT_PAIRS) {
      const ratio = contrast(pair.fg, pair.bg).toFixed(2);
      expect(doc, `${pair.fg} on ${pair.bg} = ${ratio}`).toContain(
        `| \`${pair.fg}\` | \`${pair.bg}\` | ${ratio} |`,
      );
    }
  });
});
