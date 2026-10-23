import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Landing } from './scenes/Landing';
import { Lobby } from './scenes/Lobby';
import { Preload } from './scenes/Preload';
import { Admin } from './scenes/Admin';
import { GameOver } from './scenes/GameOver';
import { Intro } from './scenes/Intro';
import { Meeting } from './scenes/Meeting';
import { RoleReveal } from './scenes/RoleReveal';
import { World } from './scenes/World';
import './ui/theme/tokens.css';
import './ui/theme/components.css';
import './ui/styles.css';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1280,
  height: 720,
  backgroundColor: '#14110f',
  pixelArt: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [Boot, Preload, Landing, Lobby, RoleReveal, World, Meeting, GameOver, Admin, Intro],
});

// The mock e2e (`?mock=1`) reads textures and scenes through this handle; a real match never sets it.
if (new URLSearchParams(location.search).get('mock') === '1') {
  (window as unknown as { __wdiGame?: Phaser.Game }).__wdiGame = game;
}
