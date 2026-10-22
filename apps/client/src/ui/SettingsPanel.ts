/**
 * The settings gear (round 6, docs/round6/cutscene-music.md 3): music and SFX sliders and a mute, persisted by
 * `view/audioSettings.ts`. Mounted on the landing, the lobby and the HUD (locked slots). Pre-seeded by 6Z as a
 * panel that renders nothing; Session 6L fills it.
 */
export function mountSettingsPanel(_root: HTMLElement): { destroy(): void } {
  return { destroy: () => undefined }; // 6L
}
