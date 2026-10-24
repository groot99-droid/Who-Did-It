import balance from '@wdi/content/data/balance.json';
import { SCRIP_COPY } from '../copy/scrip';

/**
 * Round 8, 8C (GDD 3.23): Scrip dropped on the ground is a node of the `coins` kind, which has no `resources.json` row.
 * The M5b hold prompt and cast read it from here: the coins line and `economy.coinPickupS`, null for any other node.
 */
export const COINS = 'coins';

/** The hold prompt for a coins node, null for any other resource. */
export const coinsPrompt = (resource: string): string | null =>
  resource === COINS ? SCRIP_COPY['prompt.coins'] : null;

/** The cast of a coins pickup in ms, null for any other resource. */
export const coinsCastMs = (resource: string): number | null =>
  resource === COINS ? balance.economy.coinPickupS * 1000 : null;
