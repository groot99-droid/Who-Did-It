import { z } from 'zod';

const Px = z.number().int().positive();
const Hex = z.string().regex(/^#[0-9A-F]{6}$/, 'colours are #RRGGBB upper case');
const Coord = z.number().int().min(0);

/** docs/UI.md 4 to 5: the DOM theme's scale, mirrored by apps/client/src/ui/theme/tokens.css. */
export const UiStyle = z.strictObject({
  source: z.literal('docs/UI.md'),
  fonts: z.strictObject({
    display: z.literal('Oswald'),
    text: z.literal('Inter'),
    pixelDisplay: z.literal('Press Start 2P'),
    pixelText: z.literal('Pixelify Sans'),
  }),
  typeScalePx: z.strictObject({
    displayXl: Px,
    displayLg: Px,
    displayMd: Px,
    displaySm: Px,
    textLg: Px,
    textMd: Px,
    textSm: Px,
    textXs: Px,
  }),
  lineHeight: z.strictObject({ display: z.number().positive(), text: z.number().positive() }),
  trackingEm: z.strictObject({ display: z.number(), caps: z.number(), code: z.number() }),
  spacePx: z.array(Px).min(1),
  radiusPx: z.strictObject({ xs: Px, sm: Px, md: Px, lg: Px, card: Px }),
  frameMarginPx: Px,
  gridPx: Px,
  touchTargetPx: Px,
  minViewportPx: Px,
  contrast: z.strictObject({ textMin: z.number().positive(), largeTextAndUiMin: z.number().positive() }),
});
export type UiStyle = z.infer<typeof UiStyle>;

/**
 * One art style a player can pick at the click of a button (owner, 2026-10-18; DECISIONS A79; docs/SPRITES.md 5).
 * Every style ships the same keys, frame names, cells and pivots; `root` is its manifest folder under
 * `apps/client/public/assets/`, and a key its manifest lacks falls back to the 8-bit entry.
 */
export const ArtStyle = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+$/),
  /** Whether the style's art takes the pixel finish (docs/ASSETS.md 6.11). */
  pixelFinish: z.boolean(),
  /** The texture filter of the style's world textures. */
  filter: z.enum(['nearest', 'linear']),
  /** The draw scale of a packed world frame (`iso.artScale` for both round-5 styles; HD may ship at 1). */
  drawScale: z.number().int().min(1).max(4),
  root: z.string().regex(/^([a-z0-9]+\/)?$/),
});
export type ArtStyle = z.infer<typeof ArtStyle>;

export const ArtStyles = z
  .strictObject({
    default: z.string(),
    /** Style ids promised for later (HD); no art or manifest yet. */
    reserved: z.array(z.string().regex(/^[a-z0-9]+$/)),
    styles: z.array(ArtStyle).min(1),
  })
  .superRefine((a, ctx) => {
    const ids = a.styles.map((s) => s.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'artStyles: duplicate style id' });
    if (!ids.includes(a.default))
      ctx.addIssue({ code: 'custom', message: `artStyles: default ${a.default} is not a style` });
    for (const r of a.reserved)
      if (ids.includes(r))
        ctx.addIssue({ code: 'custom', message: `artStyles: ${r} is both shipped and reserved` });
    const roots = a.styles.map((s) => s.root);
    if (new Set(roots).size !== roots.length)
      ctx.addIssue({ code: 'custom', message: 'artStyles: two styles share a root' });
    if (!a.styles.some((s) => s.root === '' && s.pixelFinish))
      ctx.addIssue({
        code: 'custom',
        message: 'artStyles: the style at the root manifest must take the pixel finish',
      });
  });
export type ArtStyles = z.infer<typeof ArtStyles>;

/** An owner image uploaded as a Higgsfield `image_references` input (docs/ASSETS.md 6.4). */
const Reference = z.strictObject({
  file: z.string().regex(/^assets\/source\/concepts\/.+\.(jpg|png)$/),
  /** [x, y, w, h] in source pixels, cut before upload. */
  crop: z.tuple([Coord, Coord, Px, Px]).optional(),
});

/** The kinds of image a prompt composes (docs/ASSETS.md 6.4): one `compositions` clause each. */
export const Composition = z.enum(['diorama', 'level', 'object', 'figure', 'portrait']);
export type Composition = z.infer<typeof Composition>;

export const StyleFile = z.strictObject({
  source: z.literal('docs/ASSETS.md 6.4, 6.9, 6.11'),
  styleFormula: z.string().min(1),
  styleToken: z.string().min(1).max(120),
  styleAvoid: z.string().min(1),
  compositions: z.record(Composition, z.string().min(1)),
  keyColors: z.tuple([Hex, Hex, Hex]),
  references: z.record(Composition, z.array(Reference).min(1).max(4)),
  /** The pixel finish (docs/ASSETS.md 6.11), applied by tools/sprites/pixel.ts. */
  pixel: z.strictObject({
    illustrationScale: z.number().int().min(1),
    alphaCut: z.number().gt(0).lt(1),
    match: z.literal('oklab'),
    tieBreak: z.literal('darkest'),
    keyTolerance: z.number().positive(),
    cutoutOutline: z.literal('ink'),
    webpQuality: z.literal(100),
  }),
  /**
   * The finish of the 8-bit art style, per mode (ruling F15). The owner answered Gate A with both styles (A79):
   * `artStyles` says which style takes the finish; the low-poly style never does.
   */
  pixelFinish: z.strictObject({
    enabled: z.strictObject({ main: z.boolean() }),
    offWebpQuality: z.number().int().min(1).max(99),
  }),
  artStyles: ArtStyles,
  ui: UiStyle,
});
export type StyleFile = z.infer<typeof StyleFile>;
