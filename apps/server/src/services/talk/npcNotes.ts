import { balance } from '@wdi/content';
import { TICK_RATE, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { meetingTranscript, noteRefusal, postNote } from '../../sim/Chat';
import { type FlowState, type MeetingStat, flowOf } from '../../sim/Flow';
import { isNpcSeat } from '../../sim/Npc';
import { simOf } from '../../sim/RoomSim';
import { talkTransport } from './claude';
import { publicFacts } from './facts';
import { filterLine } from './filter';
import { TALK_SYSTEM, talkPrompt } from './prompt';
import { herringNote, smallTalkNote, templateNote } from './templates';

/** One note an NPC seat wrote, as the match log keeps it (GDD 3.25 "Replay"). */
export interface TalkLine {
  tick: number;
  seat: string;
  text: string;
  source: 'template' | 'model';
}

/** A model call in flight: the template line drawn when it started, and the answer once it comes. */
interface Pending {
  deadline: number;
  fallback: string;
  /** undefined while waiting; null for no usable answer. */
  reply?: string | null;
}

/** One NPC seat's notes for one meeting: the ticks it means to write at, earliest first. */
interface NotePlan {
  meeting: MeetingStat;
  ticks: number[];
  pending: Pending | null;
  /** This seat's first note of the meeting is a red herring (GDD 3.25 "Misdirection"). */
  herring: boolean;
}

/** Per match (the flow, replaced on the way back to the lobby): the caps' counters and every note written. */
interface TalkMatch {
  calls: number;
  tokens: number;
  readonly lines: TalkLine[];
  readonly findings: Map<string, string[]>;
}

const plans = new WeakMap<PartyRoom, Map<string, NotePlan>>();
const matches = new WeakMap<FlowState, TalkMatch>();
const replays = new WeakMap<PartyRoom, readonly TalkLine[]>();
const herringSeats = new WeakMap<MeetingStat, Set<string>>();

/**
 * The seats whose first note of this meeting is a red herring: `talk.npc.herringsPerMeeting` living NPC seats, drawn
 * once a meeting from the `talk:~herrings` stream, whatever their cards.
 */
function herringsOf(room: PartyRoom, meeting: MeetingStat): Set<string> {
  let seats = herringSeats.get(meeting);
  if (seats) return seats;
  const rng = room.seeds.get('talk', '~herrings');
  const ids: string[] = [];
  room.state.players.forEach((p: PlayerState, id: string) => {
    if (p.alive && isNpcSeat(room, id)) ids.push(id);
  });
  const { min, max } = balance.talk.npc.herringsPerMeeting;
  const k = Math.min(ids.length, min + Math.floor(rng() * (max - min + 1)));
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (ids.length - i));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  herringSeats.set(meeting, (seats = new Set(ids.slice(0, k))));
  return seats;
}

function matchOf(room: PartyRoom): TalkMatch {
  const flow = flowOf(room);
  let match = matches.get(flow);
  if (!match) matches.set(flow, (match = { calls: 0, tokens: 0, lines: [], findings: new Map() }));
  return match;
}

/** The match log's `talk` rows (`logMatch`): absent when no NPC wrote, so a match without notes logs as before. */
export function talkLog(room: PartyRoom): { talk?: TalkLine[] } {
  const lines = matchOf(room).lines;
  return lines.length === 0 ? {} : { talk: [...lines] };
}

/** A replay (GDD 3.25 "Replay"): each NPC seat's n-th note is the logged one, and no model is called. */
export function setTalkReplay(room: PartyRoom, lines: readonly TalkLine[]): void {
  replays.set(room, lines);
}

/**
 * 8S's hook: something an NPC seat found itself (its own view), which its next model notes may draw on. Never another
 * seat's card or private view.
 */
export function addNpcFinding(room: PartyRoom, seatId: string, text: string): void {
  const findings = matchOf(room).findings;
  findings.set(seatId, [...(findings.get(seatId) ?? []), text]);
}

/** Model calls only with the server key, outside auto runs and replays, and inside the match's caps. */
function modelOn(room: PartyRoom, match: TalkMatch): boolean {
  const m = balance.talk.model;
  return (
    talkTransport.enabled() &&
    simOf(room).auto === null &&
    !replays.has(room) &&
    match.calls < m.callsPerMatch &&
    match.tokens < m.tokensPerMatch
  );
}

/**
 * An NPC seat's meeting notes (GDD 3.8, 3.25), called once a tick for every living NPC seat in the discussion and
 * the vote (the hook in `sim/npc/meeting.ts`). On its first call of a meeting the seat draws how many notes it means
 * to write (`talk.npc.notesPerMeeting`) and when (`talk.npc.windowFrac` of the discussion plus the vote time), from
 * its own `talk` stream and whatever its card; a note the human limits refuse waits for the next tick. At a note's
 * tick the template line is drawn first, always, so the stream moves alike whatever the source; with the model on,
 * the call runs off the tick and a later tick posts its filtered answer, or the template line at the deadline.
 */
export function runNpcNotes(room: PartyRoom, player: PlayerState): void {
  const meeting = flowOf(room).current;
  if (meeting === null) return;
  const id = player.id;
  let seats = plans.get(room);
  if (!seats) plans.set(room, (seats = new Map()));
  let plan = seats.get(id);
  const tick = room.state.tick;
  if (plan?.meeting !== meeting) {
    plan = {
      meeting,
      ticks: drawTicks(room, id, tick),
      pending: null,
      herring: herringsOf(room, meeting).has(id),
    };
    seats.set(id, plan);
  }
  const next = plan.ticks[0];
  if (next === undefined || tick < next || noteRefusal(room, id) !== null) return;
  const match = matchOf(room);
  const pending = plan.pending;
  if (pending !== null) {
    if (pending.reply === undefined && tick < pending.deadline) return;
    plan.pending = null;
    const line = pending.reply ? filterLine(room, pending.reply) : null;
    say(room, plan, match, id, line ?? pending.fallback, line !== null ? 'model' : 'template');
    return;
  }
  const facts = publicFacts(room, id);
  const rng = room.seeds.get('talk', id);
  // Every kind is drawn at every note, so the stream moves alike whatever is posted (and a replay draws the same).
  const fallback = templateNote(facts, rng);
  const herring = herringNote(facts, rng);
  const smallTalk = smallTalkNote(rng);
  const uKind = rng();
  const replay = replays.get(room);
  if (replay) {
    const nth = match.lines.filter((l) => l.seat === id).length;
    const logged = replay.filter((l) => l.seat === id)[nth];
    say(room, plan, match, id, logged?.text ?? fallback, logged?.source ?? 'template');
    return;
  }
  if (plan.herring || uKind < balance.talk.npc.smallTalkChance) {
    const text = plan.herring ? herring : smallTalk;
    plan.herring = false;
    say(room, plan, match, id, text, 'template');
    return;
  }
  if (!modelOn(room, match)) {
    say(room, plan, match, id, fallback, 'template');
    return;
  }
  const call: Pending = { deadline: tick + Math.round(balance.talk.model.timeoutS * TICK_RATE), fallback };
  plan.pending = call;
  match.calls += 1;
  const user = talkPrompt(player.name, facts, meetingTranscript(room), match.findings.get(id) ?? []);
  void talkTransport.request(TALK_SYSTEM, user).then((reply) => {
    match.tokens += reply.tokens;
    call.reply = reply.text;
  });
}

function say(
  room: PartyRoom,
  plan: NotePlan,
  match: TalkMatch,
  id: string,
  text: string,
  source: TalkLine['source'],
): void {
  if (!postNote(room, id, text)) return;
  plan.ticks.shift();
  match.lines.push({ tick: room.state.tick, seat: id, text, source });
}

function drawTicks(room: PartyRoom, id: string, tick: number): number[] {
  const rng = room.seeds.get('talk', id);
  const { notesPerMeeting: count, windowFrac: f } = balance.talk.npc;
  const n = count.min + Math.floor(rng() * (count.max - count.min + 1));
  const span = Math.max(0, room.state.phaseEndsTick - tick) + balance.phases.voteS * TICK_RATE;
  const ticks: number[] = [];
  for (let i = 0; i < n; i++) ticks.push(tick + Math.round(span * (f.min + rng() * (f.max - f.min))));
  return ticks.sort((a, b) => a - b);
}
