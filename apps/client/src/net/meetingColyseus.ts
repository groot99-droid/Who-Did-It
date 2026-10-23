import mitt, { type Emitter } from 'mitt';
import type { Room } from '@colyseus/sdk';
import type {
  ChatLine,
  GameOver,
  MeetingFeed,
  MeetingFeedEvents,
  MeetingInfo,
  MeetingPlayer,
  MeetingStart,
  VoteResult,
} from './meeting';

// Reads the live room: the public roster, the MeetingState, the clock and this player's own private vote.
// Loose structural types keep the schema runtime out of the bundle (same approach as worldColyseus.ts).

interface PlayerState {
  id: string;
  name: string;
  traits?: { height: number; scarf: number; hat: number };
  look?: string;
  profile?: string;
  alive: boolean;
  hasVoted: boolean;
  priv?: { myVote?: string };
}
interface GameStateLike {
  tick: number;
  phase: number;
  phaseEndsTick: number;
  players: {
    forEach(cb: (p: PlayerState, id: string) => void): void;
    get(id: string): PlayerState | undefined;
  };
  meeting?: MeetingInfo;
}

export class ColyseusMeetingFeed implements MeetingFeed {
  readonly bus: Emitter<MeetingFeedEvents> = mitt<MeetingFeedEvents>();
  private begun: MeetingStart | null = null;
  private tally: VoteResult | null = null;
  private final: GameOver | null = null;
  private log: ChatLine[] = [];
  private readonly offs: Array<() => void> = [];

  constructor(private readonly room: Room) {
    // Registered before the router's listeners, so the cached state is current when a screen reads it
    // from inside an event handler.
    this.offs.push(
      room.onMessage('meetingStart', (m: MeetingStart) => {
        this.begun = m;
        this.tally = null;
        this.log = [];
        this.bus.emit('meetingStart', m);
      }),
      room.onMessage('voteResult', (m: VoteResult) => {
        this.tally = m;
        this.bus.emit('voteResult', m);
      }),
      room.onMessage('gameOver', (m: GameOver) => {
        this.final = m;
        this.bus.emit('gameOver', m);
      }),
      room.onMessage('chat.msg', (m: ChatLine) => {
        this.log.push({ from: m.from, text: m.text, channel: m.channel });
        this.bus.emit('chat.msg', m);
      }),
      room.onMessage('phaseChange', (m: { phase: number; endsTick: number }) =>
        this.bus.emit('phaseChange', m),
      ),
      room.onMessage('shot', (m: MeetingFeedEvents['shot']) => this.bus.emit('shot', m)),
    );
  }

  /** The room this feed reads; the router compares it to spot a reconnect to a new room. */
  get sessionRoom(): Room {
    return this.room;
  }

  get selfId(): string {
    return this.room.sessionId;
  }

  private get state(): GameStateLike {
    return this.room.state as unknown as GameStateLike;
  }

  roster(): MeetingPlayer[] {
    const out: MeetingPlayer[] = [];
    this.state.players.forEach((p) =>
      out.push({
        id: p.id,
        name: p.name,
        traits: { height: p.traits?.height ?? 0, scarf: p.traits?.scarf ?? 0, hat: p.traits?.hat ?? 0 },
        look: p.look ?? '',
        alive: p.alive,
        hasVoted: p.hasVoted,
        profile: p.profile ?? '',
      }),
    );
    return out;
  }

  meeting(): MeetingInfo {
    const m = this.state.meeting;
    return {
      phase: m?.phase ?? 0,
      reason: m?.reason ?? '',
      callerId: m?.callerId ?? '',
      bodyOf: m?.bodyOf ?? '',
      endsTick: m?.endsTick ?? 0,
    };
  }

  clock() {
    const s = this.state;
    return { tick: s.tick, phase: s.phase, phaseEndsTick: s.phaseEndsTick };
  }

  myVote(): string {
    return this.state.players.get(this.selfId)?.priv?.myVote ?? '';
  }

  started(): MeetingStart | null {
    return this.begun;
  }

  result(): VoteResult | null {
    return this.tally;
  }

  over(): GameOver | null {
    return this.final;
  }

  lines(): readonly ChatLine[] {
    return this.log;
  }

  vote(targetId: string): void {
    this.room.send('meeting.vote', { targetId });
  }

  say(text: string): void {
    this.room.send('chat.say', { text });
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.bus.all.clear();
  }
}
