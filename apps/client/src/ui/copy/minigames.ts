// The four mini-games of the main mode's task stations (GDD 3.16). They came from the quick mode's station rooms,
// which left the game with it (DECISIONS A115); the lines are unchanged.

export const MINIGAME_COPY = {
  'minigame.crates.hint': 'Drag {steps} crates onto the cart, then stop the needle inside the cold band.',
  'minigame.crates.dial': 'Stop the needle',
  'minigame.crates.load': 'Load a crate',
  'minigame.crates.stop': 'Stop',
  'minigame.pour.hint': 'Hold to pour. Let go with the level inside the line.',
  'minigame.pour.flour': 'Flour',
  'minigame.pour.water': 'Water',
  'minigame.pour.spilled': 'Too much. The bowl is empty again.',
  'minigame.pour.hold': 'Hold to pour',
  'minigame.slide.hint': 'Slide {steps} bannetons into the glowing slots.',
  'minigame.slide.next': 'Slide in the next banneton',
  'minigame.stoke.hint': 'Tap to feed the fire. Hold the needle in the band for {holdS} s.',
  'minigame.stoke.tap': 'Feed oak',
  'minigame.stoke.progress': '{s} s held',
} as const;

export type MinigameCopyId = keyof typeof MINIGAME_COPY;
