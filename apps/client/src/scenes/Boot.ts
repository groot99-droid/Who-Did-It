import Phaser from "phaser";
import { type Flags, readFlags } from "../flags";
import { type Health, waitForHealth } from "../health";
import { createNetwork } from "../net";
import { Backdrop } from "../view/Backdrop";
import { REG_FLAGS, REG_HEALTH, REG_NET } from "./registry";

export class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    const flags: Flags = readFlags(location.search, location.hash);
    this.registry.set(REG_FLAGS, flags);
    this.registry.set(REG_NET, createNetwork(flags));
    const backdrop = new Backdrop(this);

    if (flags.mock) {
      this.finish({ ok: true, build: "mock" }, backdrop);
      return;
    }

    const abort = new AbortController();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => abort.abort());
    backdrop.setStatus("Waking the village...");
    waitForHealth((n) => backdrop.setStatus(`Waking the village${".".repeat(1 + (n % 3))}`), abort.signal).then(
      (health) => this.finish(health, backdrop),
      () => undefined,
    );
  }

  private finish(health: Health, backdrop: Backdrop): void {
    this.registry.set(REG_HEALTH, health);
    backdrop.setHealth(health);
    this.time.delayedCall(900, () => this.scene.start("Preload"));
  }
}
