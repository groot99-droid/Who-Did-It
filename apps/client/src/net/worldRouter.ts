import type Phaser from 'phaser';
import type { Room } from '@colyseus/sdk';
import type { NetworkService } from './NetworkService';
import { REG_ROLE_CHIP, REG_WORLD, type SceneEnter, type WorldFeed } from './world';
import { ColyseusWorldFeed } from './worldColyseus';

// Glue between the lobby network (NetworkService, owned by the lobby session) and the World scene. It
// listens to the existing bus and room without editing either: when the server sends `sceneEnter` the
// World scene (re)starts for that scene. Installed once from Preload.

/** `NetworkService` keeps its room private; this reads it without changing that file. */
function roomOf(net: NetworkService): Room | null {
  return (net as unknown as { room?: Room | null }).room ?? null;
}

export interface RouterOptions {
  mock: boolean;
}

export function installWorldRouter(
  game: Phaser.Game,
  net: NetworkService,
  options: RouterOptions,
): () => void {
  const stops: Array<() => void> = [];
  let feed: WorldFeed | null = null;

  const publish = (next: WorldFeed) => {
    feed?.dispose();
    feed = next;
    game.registry.set(REG_WORLD, next);
    const onEnter = (data: SceneEnter) => game.scene.start('World', data);
    next.bus.on('sceneEnter', onEnter);
    stops.push(() => next.bus.off('sceneEnter', onEnter));
  };

  // The role card text feeds the HUD chip. Held in memory only, shown to this player only.
  const onReveal = (payload: { team: string; goal: string }) =>
    game.registry.set(REG_ROLE_CHIP, { team: payload.team, goal: payload.goal });
  net.bus.on('roleReveal', onReveal as never);
  stops.push(() => net.bus.off('roleReveal', onReveal as never));

  if (options.mock) {
    // The mock lobby has no world; start one when the player confirms the role card.
    const send = net.send.bind(net);
    let started = false;
    net.send = ((type, payload) => {
      send(type, payload);
      if (type === 'role.ready' && !started) {
        started = true;
        void import('./mock/worldMock').then(async (m) => {
          const feedMock = new m.MockWorldFeed(
            await m.loadMockContent(),
            net.snapshot?.players.find((p) => p.id === net.snapshot?.selfId)?.name,
          );
          publish(feedMock);
          feedMock.start();
        });
      }
    }) as NetworkService['send'];
  } else {
    // A real room appears after create/join; follow it (and any reconnect) until a feed is attached.
    const timer = window.setInterval(() => {
      const room = roomOf(net);
      if (room === null) return;
      if (feed !== null && (feed as ColyseusWorldFeed).sessionRoom === room) return;
      const next = new ColyseusWorldFeed(room);
      publish(next);
    }, 250);
    stops.push(() => window.clearInterval(timer));
  }
  return () => stops.forEach((s) => s());
}
