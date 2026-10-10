import Phaser from "phaser";
import { Backdrop } from "../view/Backdrop";
import { REG_HEALTH } from "./Boot";
import type { Health } from "../health";

/** Placeholder until the DOM overlay lands in step 3; keeps the printed `{ok, build}` on the canvas. */
export class Landing extends Phaser.Scene {
  constructor() {
    super("Landing");
  }

  create(): void {
    const backdrop = new Backdrop(this);
    backdrop.setHealth(this.registry.get(REG_HEALTH) as Health);
  }
}
