import { z } from 'zod';

const Px = z.number().int().positive();
const Hex = z.string().regex(/^#[0-9A-F]{6}$/, 'colours are #RRGGBB upper case');
const Coord = z.number().int().min(0);

/** docs/UI.md 4 to 5: the DOM theme's scale, mirrored by apps/client/src/ui/theme/tokens.css. */
export const UiStyle = z.strictObject({
  source: z.literal('docs/UI.md'),
  fonts: z.strictObject({ display: z.literal('Oswald'), text: z.literal('Inter') }),
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
  /** Ruling F15: the main mode's finish is the owner's Gate A answer; ONUB always keeps it. */
  pixelFinish: z.strictObject({
    enabled: z.strictObject({ main: z.boolean(), onub: z.literal(true) }),
    offWebpQuality: z.number().int().min(1).max(99),
  }),
  ui: UiStyle,
});
export type StyleFile = z.infer<typeof StyleFile>;
