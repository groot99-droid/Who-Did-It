import type { PartyRoom } from '../PartyRoom';
import { flowOf } from '../../sim/Flow';
import { pushNpcDebug } from '../../sim/Npc';
import { pushArrivalDebug } from '../../sim/vendettas/arrival';

/**
 * Registered only when WDI_DEBUG=1 and never in production (ARCHITECTURE 5.11). A CI test asserts that
 * `debug.roles` is absent from a production build.
 */
export function registerDebugHandlers(room: PartyRoom): void {
  room.onMessage('debug.roles', (client) => {
    // Placeholder until roles exist (M1 start): echoes the phase so the handler can be exercised.
    client.send('debug.roles', { phase: room.state.phase });
  });
  // Both only queue; the step validates and applies them (sim/Phases.ts).
  room.onMessage('debug.deal', (client, payload) => {
    flowOf(room).debug.push({ sessionId: client.sessionId, type: 'deal', payload });
  });
  // `debug.npc {walk: false}` parks every NPC; it only queues, `runNpcs` applies it (sim/Npc.ts).
  room.onMessage('debug.npc', (_client, payload) => pushNpcDebug(room, payload));
  room.onMessage('debug.clock', (client, payload) => {
    flowOf(room).debug.push({ sessionId: client.sessionId, type: 'clock', payload });
  });
  // `debug.hitman {day, human}` forces the Hitman's arrival; it only queues, the next delivery applies it (C4a).
  room.onMessage('debug.hitman', (_client, payload) => pushArrivalDebug(room, payload));
}
