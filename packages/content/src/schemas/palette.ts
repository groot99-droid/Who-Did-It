import { z } from "zod";

const Hex = z.string().regex(/^#[0-9A-F]{6}$/, "colours are #RRGGBB upper case");

export const PaletteFile = z.strictObject({
  source: z.literal("docs/ASSETS.md 6.1"),
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
    outlineToken: z.literal("ink"),
    outlinePx: z.number().positive(),
    interactableToken: z.literal("teal"),
    hazardToken: z.literal("magenta"),
    primaryButtonToken: z.literal("mustard"),
    uiStrokePx: z.number().positive(),
  }),
});
export type PaletteFile = z.infer<typeof PaletteFile>;
