import { balance } from '@wdi/content';
import { type ChatChannel, ErrorCode, Phase, S2C, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { emitSim } from './events/bus';
import { type MeetingStat, flowOf, refuse } from './Flow';
import { simOf } from './RoomSim';
import { bodyBlocksAct } from './body/run';
import { isOnLine } from './Train';

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
  if (isOnLine(room, sessionId)) return refuse(room, sessionId, 'NOT_IN_PLAY'); // round 10, C1: no ghost chat on the line
  let channel: ChatChannel = 'ghost';
  if (!speaker.dead) {
    if (!SPEAKING_PHASES.includes(room.state.phase)) {
      return refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
    }
    if (bodyBlocksAct(room, sessionId)) return refuse(room, sessionId, ErrorCode.cannot, 'not now'); // round 8, 8A
    channel = 'meeting';
  }
  if (channel === 'meeting') heard(room, room.state.players.get(sessionId)?.name ?? '', text); // round 8, 8T: the meeting so far, for NPC talk
  for (const client of room.clients) {
    if (channel === 'ghost' && (!sim.players.get(client.sessionId)?.dead || isOnLine(room, client.sessionId)))
      continue;
    client.send(S2C.chatMsg, { from: sessionId, text, channel });
  }
}

/** Per meeting, every line said aloud: the named chat with its speaker's name, a note with none (`who: ''`). */
const transcripts = new WeakMap<MeetingStat, { who: string; text: string }[]>();

function heard(room: PartyRoom, who: string, text: string): void {
  const meeting = flowOf(room).current;
  if (meeting === null) return;
  const lines = transcripts.get(meeting) ?? [];
  lines.push({ who, text });
  transcripts.set(meeting, lines);
}

/** The current meeting's public lines in order (GDD 3.25 "Input"): what every living seat has read. */
export const meetingTranscript = (room: PartyRoom): readonly { who: string; text: string }[] => {
  const meeting = flowOf(room).current;
  return meeting === null ? [] : (transcripts.get(meeting) ?? []);
};

/** Per meeting (the flow's `current` stat), each seat's notes so far and the tick of its last one. */
const noteLog = new WeakMap<MeetingStat, Map<string, { count: number; lastTick: number }>>();

/** Why `seatId` may not write a note now, or null (GDD 3.8 "Meeting notes"): the same gate for humans and NPCs. */
export function noteRefusal(room: PartyRoom, seatId: string): ErrorCode | null {
  const p = simOf(room).players.get(seatId);
  if (!p || p.dead) return ErrorCode.cannot;
  const meeting = flowOf(room).current;
  if (!SPEAKING_PHASES.includes(room.state.phase) || meeting === null) return ErrorCode.wrongPhase;
  const mine = noteLog.get(meeting)?.get(seatId);
  if (mine === undefined) return null;
  const t = balance.talk;
  if (mine.count >= t.notesPerMeeting) return ErrorCode.cooldown;
  if (room.state.tick - mine.lastTick < t.noteGapS * TICK_RATE) return ErrorCode.cooldown;
  return null;
}

/**
 * Writes one meeting note for `seatId` when `noteRefusal` lets it, and says whether it did. The line reaches every
 * client with no speaker (`from: ''`); only the bus row `talk.line` and room memory know the seat, neither on the
 * wire. NPC seats write through here too (`services/talk`), so their notes keep the humans' limits.
 */
export function postNote(room: PartyRoom, seatId: string, raw: string): boolean {
  const text = raw.trim().slice(0, balance.chat.maxChars).trim();
  if (text === '' || noteRefusal(room, seatId) !== null) return false;
  const meeting = flowOf(room).current as MeetingStat;
  let seats = noteLog.get(meeting);
  if (!seats) noteLog.set(meeting, (seats = new Map()));
  const mine = seats.get(seatId) ?? { count: 0, lastTick: 0 };
  seats.set(seatId, { count: mine.count + 1, lastTick: room.state.tick });
  room.broadcast(S2C.chatMsg, { from: '', text, channel: 'notes' });
  heard(room, '', text);
  emitSim(room, { tick: room.state.tick, kind: 'talk.line', data: { channel: 'notes' } });
  return true;
}

/** `chat.note` (GDD 3.8): a living seat's line for the meeting notes, in discussion, vote and reveal. */
export function handleNote(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  if (!room.state.players.has(sessionId)) return;
  const text =
    typeof payload.text === 'string' ? payload.text.trim().slice(0, balance.chat.maxChars).trim() : '';
  if (text === '') return refuse(room, sessionId, ErrorCode.cannot, 'say something');
  const refusal = noteRefusal(room, sessionId);
  if (refusal !== null) return refuse(room, sessionId, refusal, 'not now');
  postNote(room, sessionId, text);
}
