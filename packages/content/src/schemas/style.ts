import { z } from 'zod';

const Px = z.number().int().positive();

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

export const StyleFile = z.strictObject({
  source: z.literal('docs/ASSETS.md 6.4, 6.9'),
  styleFormula: z.string().min(1),
  styleToken: z.string().min(1).max(120),
  ui: UiStyle,
});
export type StyleFile = z.infer<typeof StyleFile>;
