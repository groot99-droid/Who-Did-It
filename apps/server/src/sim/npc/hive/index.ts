import type { PartyRoom } from '../../../rooms/PartyRoom';
import { npcMemory } from '../memory';
import { refreshBoard } from './board';
import { runTriggers } from './triggers';

export { type Blackboard, type Fact, type FactKind, hiveOf } from './board';
export {
  type Proposal,
  type Reaction,
  type Trigger,
  type TriggerContext,
  type TriggerKind,
  dueReaction,
  heldReaction,
  registerTrigger,
  registeredTriggers,
} from './triggers';

/**
 * The hive's stage (round 8, 8R, A176), called once a tick at the top of `runNpcs` (one line, granted by 6Z): the
 * blackboard is rebuilt from the public world, then every trigger proposes each NPC seat's reaction.
 */
export function runHive(room: PartyRoom): void {
  refreshBoard(room);
  runTriggers(room, npcMemory(room));
}
