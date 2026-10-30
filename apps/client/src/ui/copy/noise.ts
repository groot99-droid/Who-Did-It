// The HUD log's line for a `noise` pulse, by its kind (UI.md 14.4; round 10, 10Y, DECISIONS A254). A kind the
// client does not know reads the generic line, never the door's: the server adds kinds (`chop` and `smash` from the
// logic table, 10X's x2) and an old client must not call a woodcutter a door.
import type { WORLD_COPY } from './world';

export type NoiseLineKey = keyof typeof WORLD_COPY &
  (
    | 'log.bell'
    | 'log.scream'
    | 'log.steps'
    | 'log.door'
    | 'log.chop'
    | 'log.smash'
    | 'log.shot'
    | 'log.shout'
    | 'log.crowbar'
    | 'log.lockpick'
    | 'log.noise'
  );

/** The exact kinds the server sends today: `emitNoise` callers, `interactions.json` `modes[].noise`. */
const EXACT: Readonly<Record<string, NoiseLineKey>> = {
  door: 'log.door',
  walk: 'log.steps',
  run: 'log.steps',
  chop: 'log.chop',
  smash: 'log.smash',
  shot: 'log.shot',
  shout: 'log.shout',
  crowbar: 'log.crowbar',
  lockpick: 'log.lockpick',
};

/** The copy key of the log line a noise kind reads; `log.noise` when the kind is unknown. */
export function noiseLine(kind: string): NoiseLineKey {
  const exact = EXACT[kind];
  if (exact) return exact;
  if (/bell/i.test(kind)) return 'log.bell';
  if (/scream/i.test(kind)) return 'log.scream';
  if (/run|step/i.test(kind)) return 'log.steps';
  return 'log.noise';
}
