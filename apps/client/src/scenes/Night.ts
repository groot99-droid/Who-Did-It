import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);

/**
 * The quick-mode night and dawn (GDD 3.11): lights-out for a sleeper, the role scene and card table for a
 * waker, then the dawn panel. The ONUB router starts it on the `phaseChange` to night and keeps it through
 * dawn. Pre-seeded empty for Session 5D: a labelled greybox until the night views land.
 */
export class Night extends Phaser.Scene {
  constructor() {
    super('Night');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(palette.colors.ink);
    this.add
      .rectangle(width / 2, height / 2, width * 0.6, height * 0.5, colorOf(palette.colors.slate))
      .setStrokeStyle(4, colorOf(palette.colors.moon));
    this.add
      .text(width / 2, height / 2, 'Night', {
        fontFamily: 'Oswald, sans-serif',
        fontSize: '40px',
        color: palette.colors.bone,
      })
      .setOrigin(0.5);
  }
}
