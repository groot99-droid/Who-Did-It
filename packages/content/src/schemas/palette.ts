import { z } from 'zod';

const Hex = z.string().regex(/^#[0-9A-F]{6}$/, 'colours are #RRGGBB upper case');

/** The world palette's ramps (docs/ASSETS.md 6.1), each named for the token it carries where one exists. */
export const RampName = z.enum([
  'ink',
  'slate',
  'fog',
  'moon',
  'bone',
  'plaster',
  'stone',
  'wood',
  'brick',
  'lantern',
  'brass',
  'moss',
  'litter',
  'teal',
  'blood',
  'skin',
]);
export type RampName = z.infer<typeof RampName>;

export const PaletteFile = z.strictObject({
  source: z.literal('docs/ASSETS.md 6.1'),
  colors: z.strictObject({
    ink: Hex,
    slate: Hex,
    fog: Hex,
    bone: Hex,
    mustard: Hex,
    teal: Hex,
    magenta: Hex,
    blood: Hex,
    lantern: Hex,
    moon: Hex,
  }),
  ambient: z.strictObject({
    day: z.strictObject({ color: Hex, intensity: z.number().min(0).max(1) }),
    night: z.strictObject({ color: Hex, intensity: z.number().min(0).max(1) }),
    fogOfWarLuminanceFloor: z.number().min(0).max(1),
  }),
  rules: z.strictObject({
    maxSaturatedAccentShare: z.number().min(0).max(1),
    outlineToken: z.literal('ink'),
    outlinePx: z.number().positive(),
    interactableToken: z.literal('teal'),
    hazardToken: z.literal('magenta'),
    primaryButtonToken: z.literal('mustard'),
    uiStrokePx: z.number().positive(),
  }),
  /**
   * The world palette (docs/ASSETS.md 6.1): every pixel of rendered or generated art is one of the union of
   * these ramps (64 colours), each ramp dark to light; `saturated` lists the accents the share cap counts.
   */
  world: z.strictObject({
    source: z.string().min(1),
    ramps: z.record(RampName, z.array(Hex).min(2).max(6)),
    saturated: z.array(Hex).min(1),
  }),
});
export type PaletteFile = z.infer<typeof PaletteFile>;
