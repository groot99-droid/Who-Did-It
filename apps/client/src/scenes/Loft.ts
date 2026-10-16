import Phaser from 'phaser';

/**
 * The quick-mode loft (GDD 3.11, A21, A39): a sleeper's dark view with one bedroll per seat and local
 * noise pulses, no clock and no input. Registered in `main.ts`; the router starts it on `nightSleep`.
 * Round 4: Session T fills it.
 */
export class Loft extends Phaser.Scene {
  constructor() {
    super('Loft');
  }
}
