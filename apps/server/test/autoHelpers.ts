import type { ColyseusTestServer } from '@colyseus/testing';
import type { InvariantFailure, SimEventWire } from '@wdi/shared';
import type { FixedSeeds } from '../src/sim/seeds';
import type { AutoOptions } from '../src/sim/auto/Auto';

/**
 * The headless harness (round 6, docs/round6/auto-admin.md 4): creates a `party` room, `enableAuto`, `queueAutoStart`,
 * then `advance`s (npcHelpers.ts) until `Phase.gameOver` or `maxTicks`, running `runInvariants` every
 * `invariantsEvery` ticks. Pre-seeded by 6Z with throwing bodies; Session 6A fills them, 6B reads the result.
 */
export interface AutoResult {
  winner: number;
  ticks: number;
  rounds: number;
  events: SimEventWire[];
  failures: InvariantFailure[];
  seeds: FixedSeeds;
}

export interface AutoRunOptions extends AutoOptions {
  maxTicks?: number;
  invariantsEvery?: number;
}

export function runAutoMatch(_colyseus: ColyseusTestServer, _opts: AutoRunOptions): Promise<AutoResult> {
  throw new Error('test/autoHelpers.ts runAutoMatch: round 6, Session 6A');
}
