import type Phaser from 'phaser';
import type { Flags } from '../flags';
import type { Health } from '../health';
import type { NetworkService } from '../net';

export const REG_FLAGS = 'flags';
export const REG_HEALTH = 'health';
export const REG_NET = 'net';

export const getFlags = (s: Phaser.Scene) => s.registry.get(REG_FLAGS) as Flags;
export const getHealth = (s: Phaser.Scene) => s.registry.get(REG_HEALTH) as Health;
export const getNet = (s: Phaser.Scene) => s.registry.get(REG_NET) as NetworkService;
