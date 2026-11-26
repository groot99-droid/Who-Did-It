// The sprite world's light (round 11, R4; sprite-world.md 1). Pure: no Three.js import, so tests read it without the
// renderer. One sun casts the shadows and the day part (`view/dayPart.ts`) sets how bright it is; the lantern posts
// carry point lights that burn when the Phaser path shows their lit frame (`isLit`). The night's darkness mask (the
// gameplay radius, GDD 3.7) still draws on the Phaser canvas above, so this light only changes the look.
import { type DayPart, isLit } from '../view/dayPart';

/** Q4 (proposed, CL3a's direction): the sun stands 25 degrees above the ground. */
export const SUN_ELEVATION = (25 * Math.PI) / 180;

/**
 * Unit vector from the ground toward the sun, in scene axes (world x is X, world y is Z, height is Y). The sun stands
 * in world south-west (world -x, +y), so shadows fall to world north-east: at heading 0, along the ground to the
 * right of a building. It is fixed in the world, so the shadows turn with the world when the camera does (Q4).
 */
export function sunDirection(): { x: number; y: number; z: number } {
  const flat = Math.cos(SUN_ELEVATION) * Math.SQRT1_2;
  return { x: -flat, y: Math.sin(SUN_ELEVATION), z: flat };
}

/** How the scene is lit in one part of the day. */
export interface Lighting {
  sun: { colour: number; intensity: number };
  ambient: { colour: number; intensity: number };
  /** The lantern posts burn, as on the Phaser path. */
  lamps: boolean;
}

const LIGHTING: Readonly<Record<DayPart, Omit<Lighting, 'lamps'>>> = {
  day: { sun: { colour: 0xfff1d6, intensity: 1.5 }, ambient: { colour: 0xffffff, intensity: 1.3 } },
  dusk: { sun: { colour: 0xffb070, intensity: 0.9 }, ambient: { colour: 0xd8c0d0, intensity: 0.95 } },
  night: { sun: { colour: 0x8fa6d8, intensity: 0.35 }, ambient: { colour: 0x8090c0, intensity: 0.7 } },
};

/** The light of a day part: the sun and the ambient, and whether the lamps burn. */
export function lightingOf(part: DayPart): Lighting {
  return { ...LIGHTING[part], lamps: isLit(part) };
}

/** A lamp's light: how high above its post's foot it hangs, how far it reaches, and how bright it is (scene units). */
export const LAMP = { height: 70, reach: 260, colour: 0xffc56b, intensity: 2.2 } as const;

/** A blob shadow's half-width along the ground for a billboard `widthUnits` across, and how dark it is. */
export const blobRadius = (widthUnits: number): number => Math.max(10, widthUnits * 0.4);
export const BLOB_OPACITY = 0.35;
