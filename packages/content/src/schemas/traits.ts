import { z } from "zod";
import { GddRef, Id, PaletteToken, Ships, WorldId } from "./common.js";

const TraitValue = z.strictObject({
  id: Id,
  /** Words used on the role card line "You look like: Tall / Green scarf / Bowler hat". */
  label: z.string().min(1),
});

export const TraitsFile = z.strictObject({
  gddRef: GddRef,
  axes: z.strictObject({
    height: z.strictObject({
      clue: z.literal("footprints"),
      values: z.array(TraitValue.extend({ spriteScale: z.number().positive() })).length(3),
    }),
    scarf: z.strictObject({
      clue: z.literal("thread"),
      values: z
        .array(
          TraitValue.extend({
            tint: PaletteToken,
            nameplateShape: z.enum(["diamond", "circle", "square"]),
          }),
        )
        .length(3),
    }),
    hat: z.strictObject({
      clue: z.literal("felt"),
      values: z
        .array(TraitValue.extend({ overlayPass: z.enum(["hat_cap", "hat_bowler"]).nullable() }))
        .length(3),
    }),
  }),
  /** Overlay render passes composed on every body (ASSETS 6.2). */
  overlayPasses: z.array(WorldId).min(1),
  /**
   * Character body ids used in atlas keys `char/<body>/<anim>/<dir>`. They are public, so they
   * never name a role.
   */
  bodies: z.array(z.strictObject({ id: WorldId, ships: Ships })).min(1),
});
export type TraitsFile = z.infer<typeof TraitsFile>;
