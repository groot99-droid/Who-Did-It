import { z } from 'zod';
import { GddRef, Id, LookId, PaletteToken, Ships } from './common.js';
import { RampName } from './palette.js';

/** Clips every world character renders, in 8 directions (SPRITES 3; `swing` is AnimId 2, `interact` AnimId 4). */
export const LookClip = z.enum(['idle', 'walk', 'swing', 'interact', 'die']);
export type LookClip = z.infer<typeof LookClip>;
/** Overlay passes on every world character: the scarf (tinted at runtime) and Blood (shown while Bloody). */
export const LookPass = z.enum(['scarf', 'blood']);
export type LookPass = z.infer<typeof LookPass>;

/** One card's character (GDD 3.17): public by design in the main mode; cover cards are portrait-only. */
export const Look = z.strictObject({
  id: LookId,
  /** Display name on the card, the roster and the reveal. */
  name: z.string().min(1),
  /** The roles.json row whose card this is; that row's `look` is this id. */
  role: Id,
  /** A Townsfolk profession card. */
  profession: z.boolean(),
  /** Manifest key of the 384x576 WebP card portrait (ASSETS 6.3). */
  portrait: z.string().regex(/^portrait_[a-z][a-z0-9]*$/),
  /** Texture key of the world character, `char/<id>/<clip>/<dir>`; null for a cover card, never drawn in the world. */
  bodyAtlas: z
    .string()
    .regex(/^char_[a-z][a-z0-9]*$/)
    .nullable(),
  /** Texture key of the overlay passes, `<pass>/<id>/<clip>/<dir>`; null exactly when `bodyAtlas` is. */
  overlayAtlas: z
    .string()
    .regex(/^ovl_[a-z][a-z0-9]*$/)
    .nullable(),
  /** The shape that must read at shipping size, in one line. */
  silhouette: z.string().min(1),
  /** Palette tokens for the artist (ASSETS 6.1): the two body tones and the one small accent. */
  palette: z.strictObject({ base: PaletteToken, second: PaletteToken, accent: PaletteToken }),
  /** Costume, carried prop and the `interact` pose. */
  notes: z.string().min(1),
  ships: Ships,
  gddRef: GddRef,
});
export type Look = z.infer<typeof Look>;

/**
 * A look of the villager family (round 8, townsfolk.md 2, DECISIONS A161): the ambient townsfolk's figures and the
 * seat's fallback body. No card, no portrait, no signature prop and no hat-trait shape, so a townsfolk figure never
 * reads as a seat; the server's townsfolk pick from the family and a cover can never take one.
 */
export const VillagerLook = z.strictObject({
  id: LookId.regex(/^villager/, 'a villager look id starts with `villager`'),
  name: z.string().min(1),
  bodyAtlas: z.string().regex(/^char_villager[a-z0-9]*$/),
  overlayAtlas: z.string().regex(/^ovl_villager[a-z0-9]*$/),
  silhouette: z.string().min(1),
  /** World ramps (ASSETS 6.1), since the family is rendered from the rig and never generated from a prompt. */
  palette: z.strictObject({ base: RampName, second: RampName, accent: RampName }),
  notes: z.string().min(1),
  ships: Ships,
  gddRef: GddRef,
});
export type VillagerLook = z.infer<typeof VillagerLook>;

export const LooksFile = z.strictObject({
  gddRef: GddRef,
  clips: z.array(LookClip).min(1),
  passes: z.array(LookPass),
  looks: z.record(LookId, Look),
  /** The villager family, keyed by id; the plain `villager` is its base. */
  villagers: z
    .record(LookId, VillagerLook)
    .refine((v) => 'villager' in v, "the plain villager is the family's base"),
});
export type LooksFile = z.infer<typeof LooksFile>;
