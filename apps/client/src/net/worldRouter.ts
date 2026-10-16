import type Phaser from 'phaser';
import { REG_MEETING, type MeetingFeed } from './meeting';
import { ColyseusMeetingFeed } from './meetingColyseus';
import type { MockNetwork } from './mock';
import type { MockMeetingRequest } from './mock/meetingMock';
import type { NetworkService, Room } from './NetworkService';
import { REG_ROLE_CHIP, REG_WORLD, type SceneEnter, type WorldFeed } from './world';
import { ColyseusWorldFeed } from './worldColyseus';

// Glue between the network (NetworkService, the world feed, the meeting feed) and the scenes. The router is
// the only code that starts, sleeps and stops World, Meeting and GameOver. Installed once from Preload.
//
//   sceneEnter while no meeting is open   -> (re)start World for that scene
//   meetingStart                          -> sleep World, launch Meeting
//   sceneEnter after meetingStart         -> stop Meeting, start World (the reveal is over)
//   gameOver                              -> stop World and Meeting, start GameOver
//   phase back to lobby                   -> start Lobby

export interface RouterOptions {
  mock: boolean;
}

const LOBBY_SCREENS = ['Landing', 'Lobby'];

/** `Phase.lobby` of the schema; the client does not import the schema runtime, so the one id it needs is here. */
const PHASE_LOBBY = 0;

export function installWorldRouter(
  game: Phaser.Game,
  net: NetworkService,
  options: RouterOptions,
): () => void {
  const stops: Array<() => void> = [];
  let world: WorldFeed | null = null;
  let meeting: MeetingFeed | null = null;
  let meetingOpen = false;
  /** Mock only: the mock world is dealt once per match; the return to the lobby clears this. */
  let mockStarted = false;

  const stopScene = (key: string) => {
    if (game.scene.isActive(key) || game.scene.isSleeping(key) || game.scene.isPaused(key)) {
      game.scene.stop(key);
    }
  };

  const onWorldEnter = (data: SceneEnter) => {
    if (meetingOpen) {
      // The first sceneEnter after meetingStart is the server's "the meeting is over" (A30): back to the world.
      meetingOpen = false;
      stopScene('Meeting');
    }
    // The lobby screens are done once the world starts; stopping them removes their DOM. RoleReveal
    // is not stopped: it sleeps itself and keeps the card's DOM so Tab can reopen it during play.
    for (const key of LOBBY_SCREENS) stopScene(key);
    stopScene('GameOver');
    game.scene.start('World', data);
    net.bus.emit('sceneEnter', data);
  };

  const onMeetingStart = () => {
    meetingOpen = true;
    if (game.scene.isActive('World')) game.scene.sleep('World');
    stopScene('Meeting');
    game.scene.start('Meeting');
  };

  const onGameOver = () => {
    meetingOpen = false;
    stopScene('Meeting');
    stopScene('World');
    stopScene('RoleReveal');
    game.scene.start('GameOver');
  };

  const onPhaseChange = ({ phase }: { phase: number }) => {
    if (phase !== PHASE_LOBBY || net.code === null) return;
    meetingOpen = false;
    if (options.mock) {
      mockStarted = false;
      world?.dispose();
      world = null;
    }
    for (const key of ['Meeting', 'GameOver', 'World', 'RoleReveal']) stopScene(key);
    if (!game.scene.isActive('Lobby') && !game.scene.isActive('Landing')) game.scene.start('Lobby');
  };

  const publishWorld = (next: WorldFeed) => {
    world?.dispose();
    world = next;
    game.registry.set(REG_WORLD, next);
    next.bus.on('sceneEnter', onWorldEnter);
  };

  const publishMeeting = (next: MeetingFeed) => {
    meeting?.dispose();
    meeting = next;
    game.registry.set(REG_MEETING, next);
    next.bus.on('meetingStart', onMeetingStart);
    next.bus.on('gameOver', onGameOver);
    next.bus.on('phaseChange', onPhaseChange);
  };

  const dropFeeds = () => {
    world?.dispose();
    meeting?.dispose();
    world = null;
    meeting = null;
    meetingOpen = false;
  };

  // The role card text feeds the HUD chip. Held in memory only, shown to this player only.
  const onReveal = (payload: { team: string; goal: string }) =>
    game.registry.set(REG_ROLE_CHIP, { team: payload.team, goal: payload.goal });
  net.bus.on('roleReveal', onReveal as never);
  stops.push(() => net.bus.off('roleReveal', onReveal as never));

  // A lost connection mid-match leaves the in-match screens behind; take them down and go to the landing.
  const onLeft = () => {
    if (game.scene.isActive('Lobby') || game.scene.isActive('Landing')) return;
    dropFeeds();
    for (const key of ['Meeting', 'GameOver', 'World', 'RoleReveal']) stopScene(key);
    game.scene.start('Landing');
  };
  net.bus.on('left', onLeft);
  stops.push(() => net.bus.off('left', onLeft));

  if (options.mock) {
    const mock = net as unknown as MockNetwork;
    // The mock lobby has no world; start one when the player confirms the role card (the card's
    // Ready sends `lobby.ready {ready: true}` while a card is held; the lobby's toggle has no card yet).
    const send = net.send.bind(net);
    net.send = ((type, payload) => {
      send(type, payload);
      const ready = (payload as { ready?: boolean } | undefined)?.ready === true;
      if (type === 'lobby.ready' && ready && net.roleCard !== null && !mockStarted) {
        mockStarted = true;
        void import('./mock/worldMock').then(async (m) => {
          const feedMock = new m.MockWorldFeed(
            await m.loadMockContent(),
            net.snapshot?.players.find((p) => p.id === net.snapshot?.selfId)?.name,
          );
          publishWorld(feedMock);
          mock.bindWorld(feedMock, publishMeeting);
          feedMock.bus.on('meetingRequest', (req) => mock.openMeeting(req));
          // Test and demo hook (mock only): the same request the mock world sends at a body or the bell.
          (window as unknown as { __wdiMock?: unknown }).__wdiMock = {
            requestMeeting: (reason: MockMeetingRequest['reason'] = 'body') =>
              feedMock.bus.emit('meetingRequest', {
                reason,
                callerId: feedMock.selfId,
                ...(reason === 'body' ? { bodyOf: 'mock-bot-2' } : {}),
              }),
          };
          feedMock.start();
        });
      }
    }) as NetworkService['send'];
  } else {
    // A real room appears after create/join (and again after a reconnect); follow it. `null` means gone.
    const attach = (room: Room | null) => {
      if (room === null) return dropFeeds();
      if ((world as ColyseusWorldFeed | null)?.sessionRoom === room) return;
      publishWorld(new ColyseusWorldFeed(room));
      publishMeeting(new ColyseusMeetingFeed(room));
    };
    net.bus.on('room', attach);
    stops.push(() => net.bus.off('room', attach));
    attach(net.room);
  }
  return () => stops.forEach((s) => s());
}
