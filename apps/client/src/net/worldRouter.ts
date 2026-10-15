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
    const onEnter = (data: SceneEnter) => {
      // The lobby screens are done once the world starts; stopping them removes their DOM. RoleReveal
      // is not stopped: it sleeps itself and keeps the card's DOM so Tab can reopen it during play.
      for (const key of ['Landing', 'Lobby']) {
        if (game.scene.isActive(key) || game.scene.isSleeping(key)) game.scene.stop(key);
      }
      game.scene.start('World', data);
    };
    next.bus.on('sceneEnter', onEnter);
    stops.push(() => next.bus.off('sceneEnter', onEnter));
  };

  // The role card text feeds the HUD chip. Held in memory only, shown to this player only.
  const onReveal = (payload: { team: string; goal: string }) =>
    game.registry.set(REG_ROLE_CHIP, { team: payload.team, goal: payload.goal });
  net.bus.on('roleReveal', onReveal as never);
  stops.push(() => net.bus.off('roleReveal', onReveal as never));

  if (options.mock) {
    // The mock lobby has no world; start one when the player confirms the role card (the card's
    // Ready sends `lobby.ready {ready: true}` while a card is held; the lobby's toggle has no card yet).
    const send = net.send.bind(net);
    let started = false;
    net.send = ((type, payload) => {
      send(type, payload);
      const ready = (payload as { ready?: boolean } | undefined)?.ready === true;
      if (type === 'lobby.ready' && ready && net.roleCard !== null && !started) {
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
    // The lobby event fires as soon as the room is wired, the timer covers reconnects.
    const attach = () => {
      const room = roomOf(net);
      if (room === null) return;
      if (feed !== null && (feed as ColyseusWorldFeed).sessionRoom === room) return;
      publish(new ColyseusWorldFeed(room));
    };
    net.bus.on('lobby', attach);
    stops.push(() => net.bus.off('lobby', attach));
    const timer = window.setInterval(attach, 250);
    stops.push(() => window.clearInterval(timer));
  }
  return () => stops.forEach((s) => s());
}
