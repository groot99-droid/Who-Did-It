// UI.md 14.22: the audio settings panel (Session 6L, round 6). Values in braces are filled with `fill()`.
// `settings.artStyle.*`: the read-only art-style row of a match (round 10, S5, UI.md 14.51.6).
export const SETTINGS_COPY = {
  'settings.open': 'Sound settings',
  'settings.title': 'Sound',
  'settings.artStyle': 'Art style',
  'settings.artStyle.lobby': 'Change it in the lobby.',
  'settings.music': 'Music',
  'settings.sfx': 'Sound effects',
  'settings.mute': 'Mute all',
  'settings.value': '{percent}%',
} as const satisfies Record<string, string>;
