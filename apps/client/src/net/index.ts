import type { Flags } from '../flags';
import { MockNetwork } from './mock';
import { ColyseusNetwork, type NetworkService } from './NetworkService';

export function createNetwork(flags: Flags): NetworkService {
  return flags.mock ? new MockNetwork(flags.mode) : new ColyseusNetwork();
}

export type { NetworkService } from './NetworkService';
