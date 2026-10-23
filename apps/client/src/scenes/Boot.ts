import Phaser from 'phaser';
import { type Flags, readFlags } from '../flags';
import { type Health, isStale, REFRESH_MESSAGE, waitForHealth } from '../health';
import { createNetwork } from '../net';
import { buildLine, hideBackdrop, setBackdropStatus, showBackdrop } from '../ui/backdrop';
import { REG_FLAGS, REG_HEALTH, REG_NET } from './registry';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const flags: Flags = readFlags(location.search, location.hash);
    this.registry.set(REG_FLAGS, flags);
    this.registry.set(REG_NET, createNetwork(flags));
    showBackdrop();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, hideBackdrop);

    if (flags.mock) {
      this.finish({ ok: true, build: 'mock' });
      return;
    }

    const abort = new AbortController();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => abort.abort());
    setBackdropStatus('Waking the village...');
    waitForHealth(
      (n) => setBackdropStatus(`Waking the village${'.'.repeat(1 + (n % 3))}`),
      abort.signal,
    ).then(
      (health) => this.finish(health),
      () => undefined,
    );
  }

  private finish(health: Health): void {
    this.registry.set(REG_HEALTH, health);
    if (!(this.registry.get(REG_FLAGS) as Flags).mock && isStale(health)) {
      setBackdropStatus(REFRESH_MESSAGE);
      return;
    }
    setBackdropStatus(buildLine(health));
    this.time.delayedCall(900, () => this.scene.start('Preload'));
  }
}
