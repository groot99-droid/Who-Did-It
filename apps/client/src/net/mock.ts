import mitt, { type Emitter } from 'mitt';
import { MOCK_BOTS, MOCK_ROLE_REVEAL } from './fixtures';
import type { MeetingFeed } from './meeting';
import { MockMeetingFeed, type MockMeetingRequest } from './mock/meetingMock';
import {
  JoinError,
  type LobbySnapshot,
  type NetEvents,
  type NetworkService,
  type Room,
} from './NetworkService';
import type { WorldFeed } from './world';
import {
  type ClientMessages,
  type ClientMessageType,
  type LobbyPlayer,
  MAX_PLAYERS,
  type RoleRevealPayload,
} from './protocol';

/** Same alphabet idea as the server: no 0/O/1/I/L lookalikes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** A code the mock treats as "no such party", so the error path stays testable offline. */
export const MOCK_MISSING_CODE = 'ZZZZZ';
const BOT_STEP_MS = 350;

function randomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  return code;
}

/**
 * In-memory stand-in for the server behind `?mock=1`. Each browser context is its own
 * world: creating makes you leader and fixture bots join one by one; joining puts you
 * in a party that already has a leader. Any well-formed code works except `MOCK_MISSING_CODE`.
 */
export class MockNetwork implements NetworkService {
  readonly bus: Emitter<NetEvents> = mitt<NetEvents>();
  private lobby: LobbySnapshot | null = null;
  private timers: number[] = [];
  private card: RoleRevealPayload | null = null;
  private world: WorldFeed | null = null;
  private publishMeeting: ((feed: MeetingFeed) => void) | null = null;
  private meeting: MockMeetingFeed | null = null;

  /** There is no room behind ?mock=1; the router feeds the screens from the mock feeds instead. */
  get room(): Room | null {
    return null;
  }

  get code(): string | null {
    return this.lobby?.code ?? null;
  }

  get snapshot(): LobbySnapshot | null {
    return this.lobby;
  }

  get roleCard(): RoleRevealPayload | null {
    return this.card;
  }

  async create(name: string): Promise<string> {
    const me: LobbyPlayer = { id: 'mock-me', name, ready: false, connected: true };
    this.open(randomCode(), me.id, [me]);
    this.addBots(MOCK_BOTS.slice(0, 3));
    return this.lobby?.code ?? '';
  }

  async join(code: string, name: string): Promise<string> {
    const upper = code.toUpperCase();
    if (upper === MOCK_MISSING_CODE || !/^[A-Z0-9]{5}$/.test(upper)) throw new JoinError();
    const host: LobbyPlayer = { id: 'mock-host', name: 'Host', ready: false, connected: true };
    const me: LobbyPlayer = { id: 'mock-me', name, ready: false, connected: true };
    this.open(upper, host.id, [host, me]);
    this.addBots(MOCK_BOTS.slice(0, 2));
    return upper;
  }

  async resume(): Promise<boolean> {
    return false;
  }

  send<K extends ClientMessageType>(type: K, payload: ClientMessages[K]): void {
    const room = this.lobby;
    if (room === null) return;
    // Mirrors the server: Start is leader-only and needs one human; the rest of the party is Ready.
    if (type === 'lobby.start' && room.leaderId === room.selfId && this.card === null) {
      this.later(() => {
        this.card = MOCK_ROLE_REVEAL;
        this.bus.emit('roleReveal', MOCK_ROLE_REVEAL);
      }, 300);
    }
    if (type === 'lobby.ready' && this.card === null) {
      const ready = (payload as ClientMessages['lobby.ready']).ready;
      this.lobby = {
        ...room,
        players: room.players.map((p) => (p.id === room.selfId ? { ...p, ready } : p)),
      };
      this.bus.emit('lobby', this.lobby);
    }
  }

  /** The router hands over the published mock world feed and a way to publish the meeting feed. */
  bindWorld(world: WorldFeed, publishMeeting: (feed: MeetingFeed) => void): void {
    this.world = world;
    this.publishMeeting = publishMeeting;
    this.meeting = null;
  }

  /**
   * The mock world's report or bell asked for a meeting: run discussion -> vote -> reveal on a mock meeting
   * feed, then either end the match (the router shows game over, then the lobby) or resume the world.
   */
  openMeeting(req: MockMeetingRequest): void {
    const world = this.world;
    if (world === null || this.meeting !== null) return;
    const feed = new MockMeetingFeed(
      world.snapshot().map(({ id, name, traits }) => ({ id, name, traits })),
      world.selfId,
      {
        onDone: (outcome) => {
          if (outcome === 'resume') {
            this.meeting = null;
            // Until the mock world implements `resume()` (Session N), say what it would: the same scene again.
            if (world.resume) world.resume();
            else world.bus.emit('sceneEnter', { sceneId: 'overworld', spawn: 'square_0', facing: 's' });
          }
        },
      },
    );
    feed.bus.on('phaseChange', (e) => {
      if (e.phase === 0) this.backToLobby();
    });
    this.meeting = feed;
    this.publishMeeting?.(feed);
    feed.begin(req);
  }

  private backToLobby(): void {
    this.card = null;
    this.meeting = null;
    this.world = null;
    const room = this.lobby;
    if (room === null) return;
    this.lobby = { ...room, players: room.players.map((p) => ({ ...p, ready: false })) };
    this.bus.emit('lobby', this.lobby);
  }

  async request(): Promise<never> {
    throw new Error('requests are not available in mock mode');
  }

  async leave(): Promise<void> {
    this.close();
    this.bus.emit('left', { consented: true });
  }

  private open(code: string, leaderId: string, players: LobbyPlayer[]): void {
    this.close();
    this.lobby = { code, selfId: 'mock-me', leaderId, players };
  }

  private addBots(bots: LobbyPlayer[]): void {
    bots.forEach((bot, i) =>
      this.later(
        () => {
          const room = this.lobby;
          if (room === null || room.players.length >= MAX_PLAYERS) return;
          this.lobby = { ...room, players: [...room.players, bot] };
          this.bus.emit('lobby', this.lobby);
        },
        BOT_STEP_MS * (i + 1),
      ),
    );
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private close(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.lobby = null;
    this.card = null;
    this.meeting?.dispose();
    this.meeting = null;
    this.world = null;
  }
}
