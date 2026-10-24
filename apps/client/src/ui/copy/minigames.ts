// The mini-games of the main mode's task stations (GDD 3.16). They came from the quick mode's station rooms,
// which left the game with it (DECISIONS A115). Since 7M's PR 5 the nouns are the station's
// (`minigames.json` `skin`): {station} is its object, {piece} what the hands move.

export const MINIGAME_COPY = {
  'minigame.crates.hint':
    'Drag each {piece} onto the {station} ({steps} in all), then stop the needle in the band.',
  'minigame.crates.dial': 'Stop the needle',
  'minigame.crates.load': 'Load a {piece}',
  'minigame.crates.stop': 'Stop',
  'minigame.pour.hint': 'Hold to pour. Let go with the level inside the line.',
  'minigame.pour.spilled': 'Too much. The bowl is empty again.',
  'minigame.pour.hold': 'Hold to pour',
  'minigame.slide.hint': 'Slide each {piece} into the glowing slot ({steps} in all).',
  'minigame.slide.next': 'Slide in the next {piece}',
  'minigame.stoke.hint': 'Tap to feed the fire. Hold the needle in the band for {holdS} s.',
  'minigame.stoke.tap': 'Feed {piece}',
  'minigame.stoke.progress': '{s} s held',
  // Round 7 (7M, GDD 3.16): the tap.
  'minigame.tap.hint': 'Tap as the marker crosses the band, {steps} times running.',
  'minigame.tap.tap': 'Tap',
  'minigame.tap.progress': '{hits} of {steps}',
  'minigame.tap.miss': 'Missed. From the top.',
} as const;

export type MinigameCopyId = keyof typeof MINIGAME_COPY;
