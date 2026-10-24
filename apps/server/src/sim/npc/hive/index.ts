import type { PartyRoom } from '../../../rooms/PartyRoom';
import { refreshBoard } from './board';

export { type Blackboard, type Fact, type FactKind, hiveOf } from './board';

/**
 * The hive's stage (round 8, 8R, A176), called once a tick at the top of `runNpcs` (one line, granted by 6Z): the
 * blackboard is rebuilt from the public world.
 */
export function runHive(room: PartyRoom): void {
  refreshBoard(room);
}
