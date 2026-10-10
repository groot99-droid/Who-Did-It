import Phaser from "phaser";

/** Nothing to load until the art session ships the atlas; kept so the scene chain matches 5.9. */
export class Preload extends Phaser.Scene {
  constructor() {
    super("Preload");
  }

  create(): void {
    this.scene.start("Landing");
  }
}
