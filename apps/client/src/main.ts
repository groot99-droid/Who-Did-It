import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Landing } from './scenes/Landing';
import { Lobby } from './scenes/Lobby';
import { Preload } from './scenes/Preload';
import { RoleReveal } from './scenes/RoleReveal';
import './ui/styles.css';

new Phaser.Game({
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
  scene: [Boot, Preload, Landing, Lobby, RoleReveal],
});
