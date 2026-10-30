import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The design system's contract (docs/UI.md): palette colours only, the 2 px stroke and the 48 px
// grid on every SVG, nine-slice frames that match their CSS data URIs, and WCAG AA on every token
// pair the components use. The ratios here are the ones printed in docs/UI.md 10. Since round 7 the
// colour and font rules hold for every stylesheet under apps/client/src, not only this folder's.

const THEME = import.meta.dirname;
const SRC = join(THEME, '../..');
const ROOT = join(THEME, '../../../../..');
const UI_ASSETS = join(ROOT, 'apps/client/public/assets/ui');
const paletteFile = JSON.parse(readFileSync(join(ROOT, 'packages/content/data/palette.json'), 'utf8'));
/** The ten tokens, the round-7 night set, then the round-10 dossier set: the only colours of the DOM UI. */
const palette: Record<string, string> = {
  ...paletteFile.colors,
  ...paletteFile.night,
  ...paletteFile.dossier,
};
const paletteHex = new Set(Object.values(palette).map((h) => h.toUpperCase()));

const tokens = readFileSync(join(THEME, 'tokens.css'), 'utf8');

/** Every stylesheet under apps/client/src, as [path from src, text]. */
function stylesheets(dir = SRC): [string, string][] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d): [string, string][] => {
    const path = join(dir, d.name);
    if (d.isDirectory()) return stylesheets(path);
    return d.name.endsWith('.css') ? [[relative(SRC, path), readFileSync(path, 'utf8')]] : [];
  });
}
const sheets = stylesheets();

/** The seven self-hosted families (style.json `ui.fonts`, docs/UI.md 3); the last three are the dossier's. */
const FAMILIES = [
  'Alegreya SC',
  'Alegreya Sans',
  'IBM Plex Mono',
  'Inter',
  'Oswald',
  'Pixelify Sans',
  'Press Start 2P',
];
/** What a declaration may name besides a `--wdi-font-*` token: CSS-wide keywords and generic families. */
const GENERIC = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'sans-serif',
  'serif',
  'monospace',
  'ui-monospace',
  'system-ui',
  'ui-sans-serif',
]);

/** The families a `font-family` or `font` declaration names once its tokens are taken out. */
function namedFamilies(prop: 'font' | 'font-family', value: string): string[] {
  let rest = value.replace(/var\(--wdi-font-[a-z-]+\)/g, '').trim();
  // The `font` shorthand puts style, weight and size (with an optional /line-height) before the families.
  if (prop === 'font') rest = rest.replace(/^(?:[^,]*?\s)?[\d.]+[a-z%]*(?:\/[\d.]+[a-z%]*)?\s*/, '');
  return rest
    .split(',')
    .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
    .filter((f) => f !== '');
}

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

/** `name` or `name@alpha`, composited over `under` (an RGB triplet) when it has an alpha. */
function layer(spec: string, under?: [number, number, number]): [number, number, number] {
  const [name, alphaText] = spec.split('@') as [string, string | undefined];
  const alpha = alphaText === undefined ? 1 : Number(alphaText);
  const c = rgb(palette[name]!);
  if (under === undefined) return c;
  return c.map((v, i) => Math.round(v * alpha + under[i]! * (1 - alpha))) as [number, number, number];
}

/**
 * `fg` may be `name` or `name@alpha`, composited over `bg` before measuring; `bg` may be a stack read top
 * first, `indigo@0.66 over night@0.6 over snow`, each layer composited over the one below it.
 */
export function contrast(fg: string, bg: string): number {
  const b = bg
    .split(' over ')
    .reverse()
    .reduce<[number, number, number] | undefined>((under, spec) => layer(spec, under), undefined)!;
  const f = layer(fg, b);
  const [hi, lo] = [luminance(f), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A token's alpha, `rgb(var(--wdi-<name>-rgb) / a)`, read from tokens.css so the stacks below follow it. */
function alphaOf(token: string): string {
  const m = tokens.match(new RegExp(`--wdi-${token}: rgb\\(var\\(--wdi-([a-z]+)-rgb\\) / ([\\d.]+)\\);`));
  if (!m) throw new Error(`--wdi-${token} is not an alpha token`);
  return `${m[1]}@${m[2]}`;
}
const GLASS = `${alphaOf('glass-sheen')} over ${alphaOf('glass-fill')}`;
const WASH = alphaOf('glass-wash');
const SUNKEN = alphaOf('glass-sunken');
const VEIL = alphaOf('veil');
const VIGNETTE = alphaOf('vignette');
/**
 * The loop backdrop is a video, so a glass surface (its fill and, at worst, a cell of its checker sheen) is
 * measured over its two bounds: the darkest frame (night) and the brightest any frame could be (snow) under the
 * veil. Bare text on the backdrop is measured likewise.
 */
const GLASS_DARK = `${GLASS} over night`;
const GLASS_BRIGHT = `${GLASS} over ${VEIL} over snow`;
const VEIL_BRIGHT = `${VEIL} over snow`;
const EDGE_BRIGHT = `${VIGNETTE} over ${VEIL} over snow`;

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
  // The night theme (round 7, docs/UI.md 2).
  { fg: 'lilac', bg: 'night', use: 'text on the night page and over the poster', min: 4.5 },
  { fg: 'lilac@0.8', bg: 'night', use: 'muted text on the night page', min: 4.5 },
  { fg: 'bone', bg: 'night', use: 'Inter running text kept on night surfaces', min: 4.5 },
  { fg: 'night', bg: 'lantern', use: 'primary glass button, Leader tag, selected segment', min: 4.5 },
  { fg: 'lantern', bg: 'night', use: 'the party code, warnings and the focus ring on night', min: 4.5 },
  { fg: 'lilac', bg: 'violet', use: 'You, NPC and Ready tags', min: 4.5 },
  {
    fg: 'lantern',
    bg: 'indigo',
    use: "the title's second line against its stepped shadow (large text, 3:1)",
    min: 3,
  },
  { fg: 'lilac', bg: GLASS_DARK, use: "text on glass over the loop's darkest frame", min: 4.5 },
  { fg: 'lilac', bg: GLASS_BRIGHT, use: 'text on glass over the brightest frame possible', min: 4.5 },
  { fg: 'lilac@0.8', bg: GLASS_BRIGHT, use: 'muted text and hints on glass', min: 4.5 },
  { fg: 'snow', bg: GLASS_BRIGHT, use: 'pixel labels on glass buttons', min: 4.5 },
  {
    fg: 'lantern',
    bg: GLASS_BRIGHT,
    use: 'the primary rim and the focus ring on glass (non-text, 3:1)',
    min: 3,
  },
  { fg: 'snow', bg: `${WASH} over ${GLASS_BRIGHT}`, use: 'the primary label under its hover wash', min: 4.5 },
  {
    fg: 'lilac@0.8',
    bg: `${SUNKEN} over ${GLASS_BRIGHT}`,
    use: 'placeholders in glass inputs and selects',
    min: 4.5,
  },
  {
    fg: 'lilac',
    bg: EDGE_BRIGHT,
    use: 'bare text at the vignetted edge: the footer, the chip row',
    min: 4.5,
  },
  {
    fg: 'lilac',
    bg: VEIL_BRIGHT,
    use: 'bare display text on the veil, 24 px and up (large text, 3:1)',
    min: 3,
  },
  // The dossier, light paper (round 10, docs/UI.md 2): the role card and the Satchel.
  { fg: 'ink', bg: 'sheet', use: 'dossier: text on a card', min: 4.5 },
  { fg: 'ink', bg: 'vellum', use: 'dossier: text on the page', min: 4.5 },
  { fg: 'ink', bg: 'well', use: 'dossier: text in a well', min: 4.5 },
  { fg: 'pencil', bg: 'sheet', use: 'dossier: hints on a card', min: 4.5 },
  { fg: 'pencil', bg: 'vellum', use: 'dossier: hints on the page', min: 4.5 },
  { fg: 'pencil', bg: 'well', use: 'dossier: hints in a well', min: 4.5 },
  { fg: 'ochre', bg: 'sheet', use: 'dossier: eyebrows and numbers on a card', min: 4.5 },
  { fg: 'ochre', bg: 'vellum', use: 'dossier: eyebrows on the page', min: 4.5 },
  { fg: 'ochre', bg: 'well', use: "dossier: numbers in a well, the well's rule", min: 4.5 },
  { fg: 'moss', bg: 'sheet', use: 'dossier: done', min: 4.5 },
  { fg: 'brick', bg: 'sheet', use: 'dossier: forged', min: 4.5 },
  { fg: 'brick', bg: 'well', use: 'dossier: forged in a well', min: 4.5 },
  { fg: 'focus', bg: 'vellum', use: 'dossier: the focus ring on the page (non-text, 3:1)', min: 3 },
  { fg: 'focus', bg: 'sheet', use: 'dossier: the focus ring on a card (non-text, 3:1)', min: 3 },
  // The dossier, dark paper: bone is its ink, mustard its numbers, moon its focus.
  { fg: 'bone', bg: 'graphite', use: 'dossier dark: text on a card', min: 4.5 },
  { fg: 'bone', bg: 'carbon', use: 'dossier dark: text on the page', min: 4.5 },
  { fg: 'bone', bg: 'cellar', use: 'dossier dark: text in a well', min: 4.5 },
  { fg: 'ash', bg: 'graphite', use: 'dossier dark: hints on a card', min: 4.5 },
  { fg: 'ash', bg: 'carbon', use: 'dossier dark: hints on the page', min: 4.5 },
  { fg: 'mustard', bg: 'graphite', use: 'dossier dark: eyebrows and numbers on a card', min: 4.5 },
  { fg: 'mustard', bg: 'carbon', use: 'dossier dark: eyebrows on the page', min: 4.5 },
  { fg: 'mustard', bg: 'cellar', use: "dossier dark: numbers in a well, the well's rule", min: 4.5 },
  { fg: 'sage', bg: 'graphite', use: 'dossier dark: done', min: 4.5 },
  { fg: 'blush', bg: 'graphite', use: 'dossier dark: forged (never in a well)', min: 4.5 },
  { fg: 'moon', bg: 'carbon', use: 'dossier dark: the focus ring on the page (non-text, 3:1)', min: 3 },
  { fg: 'moon', bg: 'graphite', use: 'dossier dark: the focus ring on a card (non-text, 3:1)', min: 3 },
];

describe('tokens.css', () => {
  it('mirrors palette.json colour for colour, in file order (the ten tokens, the night set, the dossier set)', () => {
    const block = [...tokens.matchAll(/--wdi-([a-z]+): (#[0-9a-fA-F]{6});/g)].map((m) => [
      m[1],
      m[2]!.toUpperCase(),
    ]);
    expect(block).toEqual(Object.entries(palette));
    expect(Object.keys(paletteFile.night)).toHaveLength(5);
    expect(Object.keys(paletteFile.dossier)).toHaveLength(16);
  });

  it('carries each colour of the ten and the night set as an RGB triplet for alpha use (the dossier takes no alpha)', () => {
    for (const [name, hex] of Object.entries({ ...paletteFile.colors, ...paletteFile.night } as Record<
      string,
      string
    >)) {
      expect(tokens).toContain(`--wdi-${name}-rgb: ${rgb(hex).join(' ')};`);
    }
  });

  it('declares the seven self-hosted families, each weight once, and nothing else', () => {
    const faces = sheets.flatMap(([path, text]) =>
      [...text.matchAll(/@font-face\s*\{[^}]*font-family: '?([^;']+)'?;\s*font-weight: ([^;]+);/g)].map(
        (m) => [path, m[1]!, m[2]!],
      ),
    );
    expect([...new Set(faces.map(([, family]) => family))].sort()).toEqual(FAMILIES);
    const weights = faces.map(([, family, weight]) => `${family} ${weight}`);
    expect(new Set(weights).size).toBe(weights.length);
    for (const [path] of faces) expect(path).toBe(join('ui', 'theme', 'tokens.css'));
  });

  it('starts every --wdi-font-* token with one of the seven families', () => {
    const fontTokens = [...tokens.matchAll(/--wdi-font-[a-z-]+: ([^;]+);/g)].map((m) => m[1]!);
    expect(fontTokens.length).toBe(7);
    for (const value of fontTokens) {
      expect(FAMILIES).toContain(value.split(',')[0]!.trim().replace(/^'|'$/g, ''));
    }
  });
});

describe('every stylesheet under apps/client/src (round 7)', () => {
  it('finds the theme and the screens', () => {
    expect(sheets.map(([path]) => path)).toEqual(
      expect.arrayContaining([join('ui', 'theme', 'tokens.css'), join('ui', 'theme', 'components.css')]),
    );
  });

  for (const [path, text] of sheets) {
    it(`${path}: no hex outside palette.json, no literal rgb() or hsl()`, () => {
      for (const hex of hexes(text)) expect(paletteHex, hex).toContain(hex);
      expect(text).not.toMatch(/\b(?:rgba?|hsla?)\(\s*[\d.]/);
    });

    it(`${path}: fonts only through the --wdi-font-* tokens`, () => {
      const body = text.replace(/@font-face\s*\{[^}]*\}/g, '');
      for (const m of body.matchAll(/(?<![-\w])(font-family|font):\s*([^;]+);/g)) {
        for (const family of namedFamilies(m[1] as 'font' | 'font-family', m[2]!)) {
          expect(GENERIC, `${m[0]}`).toContain(family);
        }
      }
    });
  }
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
    expect(token('font-pixel-display')?.startsWith(`'${ui.fonts.pixelDisplay}'`)).toBe(true);
    expect(token('font-pixel-text')?.startsWith(`'${ui.fonts.pixelText}'`)).toBe(true);
    expect(token('font-dossier-display')?.startsWith(`'${ui.fonts.dossierDisplay}'`)).toBe(true);
    expect(token('font-dossier-text')?.startsWith(`'${ui.fonts.dossierText}'`)).toBe(true);
    expect(token('font-dossier-mono')?.startsWith(`'${ui.fonts.dossierMono}'`)).toBe(true);
    expect(Object.values(ui.fonts).sort()).toEqual(FAMILIES);
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
