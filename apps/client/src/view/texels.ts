// The texel factor of each loaded texture key (DECISIONS A164, SPRITES 5): how many times larger than the 8-bit
// frames a style packed it. A view draws a key at its usual scale over this factor, so an HD frame covers the same
// screen pixels as its 8-bit one, and a key HD lacks (per-key fallback, A80) keeps the 8-bit scale. No Phaser
// import: the views that draw are imported by unit tests that run without a window; `assets.ts` records the factors.

const loadedTexels = new Map<string, number>();

/** Records the factor a key was loaded at (`ManifestEntry.texels`). */
export const recordTexels = (key: string, texels: number): void => {
  loadedTexels.set(key, texels);
};

/** The texel factor of a loaded texture key: 1 for the 8-bit frame size and for a key not loaded through a manifest. */
export const texelsOf = (key: string): number => loadedTexels.get(key) ?? 1;

/**
 * The scale a view draws a texture at: its usual scale (`iso.artScale` for a packed sprite, 1 for a page drawn at
 * display size) over the texel factor the texture was loaded at.
 */
export const drawScale = (key: string, usual = 1): number => usual / texelsOf(key);

/** Test seam: forget every recorded factor. */
export const resetTexelsForTests = (): void => loadedTexels.clear();
