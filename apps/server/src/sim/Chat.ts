import { balance } from '@wdi/content';
import { type ChatChannel, ErrorCode, Phase, S2C } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { refuse } from './Flow';
import { simOf } from './RoomSim';
import { bodyBlocksAct } from './body/run';

const SPEAKING_PHASES: readonly number[] = [Phase.meetingDiscussion, Phase.meetingVote, Phase.reveal];

/**
 * `chat.say` (GDD 3.5): the server picks the channel, the client never does. A living player speaks
 * only in a meeting, to everyone; a ghost speaks in any phase, to the dead only. Cabal chat and quick
 * chat are M4.
 */
export function handleSay(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const sim = simOf(room);
  const speaker = sim.players.get(sessionId);
  if (!speaker || !room.state.players.has(sessionId)) return;
  const text =
    typeof payload.text === 'string' ? payload.text.trim().slice(0, balance.chat.maxChars).trim() : '';
  if (text === '') return refuse(room, sessionId, ErrorCode.cannot, 'say something');
  let channel: ChatChannel = 'ghost';
  if (!speaker.dead) {
    if (!SPEAKING_PHASES.includes(room.state.phase)) {
      return refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
    }
    if (bodyBlocksAct(room, sessionId)) return refuse(room, sessionId, ErrorCode.cannot, 'not now'); // round 8, 8A
    channel = 'meeting';
  }
  for (const client of room.clients) {
    if (channel === 'ghost' && !sim.players.get(client.sessionId)?.dead) continue;
    client.send(S2C.chatMsg, { from: sessionId, text, channel });
  }
}
