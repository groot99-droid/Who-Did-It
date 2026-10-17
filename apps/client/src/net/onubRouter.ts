import type Phaser from 'phaser';
import { REG_ONUB, type OnubFeed } from './onub';

// The ONUB v2 routes (GDD 3.11, round-5 contract 5.2). `installWorldRouter` installs them once a quick-mode feed
// exists, and calls the returned function when that feed goes. They move between Kitchen and Night on the
// phase; the meeting, the game over and the return to the lobby stay the world router's, which stops Kitchen
// and Night there. Pre-seeded and locked for round 5.
//
//   phaseChange to dusk or prepReveal  -> stop every match scene but RoleReveal (it sleeps), start Kitchen
//   phaseChange to night or dawn       -> stop Kitchen, start Night (lights-out until a nightWake, then dawn)

/** The `Phase` ids the routes read (schema `Phase`, mirrored as the world router mirrors the lobby; a test pins them). */
export const ONUB_PHASE = { dusk: 4, night: 5, dawn: 6, prepReveal: 13 } as const;

/** The match scenes Kitchen replaces. RoleReveal is not among them: it sleeps, so Tab still opens the card. */
const MATCH_SCENES = ['World', 'Meeting', 'GameOver', 'Night'];

export interface OnubRouterOptions {
  /** True while the party plays quick mode (`state.settings.mode`): a main-mode dusk or night routes nothing. */
  quick(): boolean;
}

export function installOnubRouter(game: Phaser.Game, feed: OnubFeed, opts: OnubRouterOptions): () => void {
  const isUp = (key: string) =>
    game.scene.isActive(key) || game.scene.isSleeping(key) || game.scene.isPaused(key);
  const stopScene = (key: string) => {
    if (isUp(key)) game.scene.stop(key);
  };

  const route = (phase: number) => {
    if (!opts.quick()) return;
    if (phase === ONUB_PHASE.dusk || phase === ONUB_PHASE.prepReveal) {
      for (const key of MATCH_SCENES) stopScene(key);
      if (game.scene.isActive('RoleReveal')) game.scene.sleep('RoleReveal');
      // prepReveal keeps the Kitchen of dusk running: the board appears in the same scene.
      if (!game.scene.isActive('Kitchen')) game.scene.start('Kitchen');
    } else if (phase === ONUB_PHASE.night || phase === ONUB_PHASE.dawn) {
      stopScene('Kitchen');
      // dawn keeps the Night of the night running: the dawn panel appears in the same scene.
      if (!game.scene.isActive('Night')) game.scene.start('Night');
    }
  };
  const onPhase = ({ phase }: { phase: number }) => route(phase);

  game.registry.set(REG_ONUB, feed);
  feed.bus.on('phaseChange', onPhase);
  // A feed installed mid-match (a reconnect) gets no phaseChange for the phase it joins: route it now.
  route(feed.clock().phase);
  return () => feed.bus.off('phaseChange', onPhase);
}
