// Writes the Art-Deco card frames: three faction frames and the plain one, as nine-slice SVGs
// (192 x 288, 24 px margins, 2 px strokes, palette colours only) under
// apps/client/public/assets/ui/frames/, and prints the matching `border-image-source` data URIs
// that components.css embeds (theme.test.ts checks the two stay identical).
//
//   node apps/client/src/ui/theme/build-frames.mjs          # write the SVG files
//   node apps/client/src/ui/theme/build-frames.mjs --css    # print the CSS block instead
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../../..');
const palette = JSON.parse(readFileSync(join(root, 'packages/content/data/palette.json'), 'utf8')).colors;
const OUT = join(root, 'apps/client/public/assets/ui/frames');

const W = 192;
const H = 288;
const M = 24; // nine-slice margin

/**
 * Each frame has a different corner motif as well as a different colour, so a faction is never
 * carried by colour alone (docs/UI.md 6): Village steps like a roofline, Cabal fans like blades,
 * Neutral curves like a mask. The plain frame carries one step in slate.
 */
const FRAMES = {
  plain: { label: 'Card frame', colour: palette.slate, motif: 'M11 21V11H21' },
  village: { label: 'Village card frame', colour: palette.moon, motif: 'M11 21V11H21M16 21V16H21' },
  cabal: { label: 'Cabal card frame', colour: palette.blood, motif: 'M11 11L20 20M11 17L15 21M17 11L21 15' },
  neutral: {
    label: 'Neutral card frame',
    colour: palette.mustard,
    motif: 'M11 21A10 10 0 0 1 21 11M16 21A5 5 0 0 1 21 16',
  },
};

// The motif is drawn once for the top-left cell and mirrored into the other three corners.
const CORNERS = [
  '',
  `translate(${W} 0) scale(-1 1)`,
  `translate(0 ${H}) scale(1 -1)`,
  `translate(${W} ${H}) scale(-1 -1)`,
];

export function frameSvg(name) {
  const f = FRAMES[name];
  const corners = CORNERS.map((t) => `  <path d="${f.motif}"${t ? ` transform="${t}"` : ''}/>`).join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${f.label}" data-slice="${M}">`,
    `  <title>${f.label}</title>`,
    `  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="2" stroke="${palette.ink}"/>`,
    `  <g stroke="${f.colour}">`,
    `  <rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="1"/>`,
    corners,
    `  </g>`,
    `</svg>`,
    '',
  ].join('\n');
}

/** The data URI form used by components.css: one line, quotes swapped, only `#`, `<`, `>` escaped. */
export function frameDataUri(name) {
  const body = frameSvg(name)
    .replace(/<title>.*<\/title>\n/, '')
    .replace(/\n\s*/g, '')
    .replace(/"/g, "'")
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return `url("data:image/svg+xml,${body}")`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--css')) {
    for (const name of Object.keys(FRAMES)) console.log(`--wdi-frame-${name}: ${frameDataUri(name)};`);
  } else {
    mkdirSync(OUT, { recursive: true });
    for (const name of Object.keys(FRAMES)) writeFileSync(join(OUT, `frame_${name}.svg`), frameSvg(name));
    console.log(`wrote ${Object.keys(FRAMES).length} frames to ${OUT}`);
  }
}
