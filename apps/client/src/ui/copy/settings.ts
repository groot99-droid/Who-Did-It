// UI.md 14.22: the audio settings panel (Session 6L, round 6). Values in braces are filled with `fill()`.
export const SETTINGS_COPY = {
  'settings.open': 'Sound settings',
  'settings.title': 'Sound',
  'settings.music': 'Music',
  'settings.sfx': 'Sound effects',
  'settings.mute': 'Mute all',
  'settings.value': '{percent}%',
} as const satisfies Record<string, string>;
