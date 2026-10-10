import Phaser from 'phaser';
import type { Health } from '../health';

export const COLORS = { ink: 0x14110f, parchment: '#efe4cc', dim: '#a89a7c' } as const;

/** Title plus a status line on the canvas; shared by the Boot and DOM-driven scenes. */
export class Backdrop {
  private readonly status: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    scene.cameras.main.setBackgroundColor(COLORS.ink);
    scene.add
      .text(width / 2, 60, 'WHO DID IT', {
        fontFamily: 'Oswald, sans-serif',
        fontSize: '44px',
        color: COLORS.parchment,
      })
      .setOrigin(0.5);
    this.status = scene.add
      .text(width / 2, height - 28, '', {
        fontFamily: 'Inter, sans-serif',
        fontSize: '16px',
        color: COLORS.dim,
      })
      .setOrigin(0.5);
  }

  setStatus(text: string): void {
    this.status.setText(text);
  }

  setHealth(health: Health): void {
    this.status.setText(JSON.stringify({ ok: health.ok, build: health.build }));
  }
}
