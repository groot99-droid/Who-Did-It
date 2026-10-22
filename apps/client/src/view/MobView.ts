import type Phaser from 'phaser';

/**
 * Round 6, Session 6I (docs/round6/m5b-data.md 3): draws the scene's mobs from the world feed. Constructed
 * and destroyed by `scenes/World.ts` beside `ClueView` (locked lines). Pre-seeded by 6Z as a view that draws nothing.
 */
export class MobView {
  constructor(private readonly scene: Phaser.Scene) {}

  update(_items: readonly unknown[], _now: number): void {
    void this.scene; // 6I
  }

  destroy(): void {
    // 6I
  }
}
