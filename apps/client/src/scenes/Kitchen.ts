import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);

/**
 * The quick-mode kitchen (GDD 3.11): Evening Prep and the prep board. The ONUB router starts it on the
 * `phaseChange` to dusk and keeps it through prepReveal. Pre-seeded empty for Session 5C: a labelled greybox
 * until the overview, the station rooms and the board land.
 */
export class Kitchen extends Phaser.Scene {
  constructor() {
    super('Kitchen');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(palette.colors.ink);
    this.add
      .rectangle(width / 2, height / 2, width * 0.6, height * 0.5, colorOf(palette.colors.slate))
      .setStrokeStyle(4, colorOf(palette.colors.mustard));
    this.add
      .text(width / 2, height / 2, 'Kitchen', {
        fontFamily: 'Oswald, sans-serif',
        fontSize: '40px',
        color: palette.colors.bone,
      })
      .setOrigin(0.5);
  }
}
