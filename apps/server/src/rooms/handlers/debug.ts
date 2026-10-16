import type { PartyRoom } from '../PartyRoom';
import { flowOf } from '../../sim/Flow';

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
  room.onMessage('debug.clock', (client, payload) => {
    flowOf(room).debug.push({ sessionId: client.sessionId, type: 'clock', payload });
  });
}
