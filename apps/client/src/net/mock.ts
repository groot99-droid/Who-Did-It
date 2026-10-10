import mitt, { type Emitter } from 'mitt';
import { MOCK_BOTS, MOCK_ROLE_REVEAL } from './fixtures';
import { JoinError, type LobbySnapshot, type NetEvents, type NetworkService } from './NetworkService';
import {
  type ClientMessages,
  type ClientMessageType,
  type LobbyPlayer,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
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
  private room: LobbySnapshot | null = null;
  private timers: number[] = [];

  get code(): string | null {
    return this.room?.code ?? null;
  }

  get snapshot(): LobbySnapshot | null {
    return this.room;
  }

  async create(name: string): Promise<string> {
    const me: LobbyPlayer = { id: 'mock-me', name, ready: false, connected: true };
    this.open(randomCode(), me.id, [me]);
    this.addBots(MOCK_BOTS.slice(0, 3));
    return this.room?.code ?? '';
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

  send<K extends ClientMessageType>(type: K, _payload: ClientMessages[K]): void {
    const room = this.room;
    if (room === null) return;
    if (
      type === 'lobby.start' &&
      room.leaderId === room.selfId &&
      room.players.length >= MIN_PLAYERS_TO_START
    ) {
      this.later(() => this.bus.emit('roleReveal', MOCK_ROLE_REVEAL), 300);
    }
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
    this.room = { code, selfId: 'mock-me', leaderId, players };
  }

  private addBots(bots: LobbyPlayer[]): void {
    bots.forEach((bot, i) =>
      this.later(
        () => {
          const room = this.room;
          if (room === null || room.players.length >= MAX_PLAYERS) return;
          this.room = { ...room, players: [...room.players, bot] };
          this.bus.emit('lobby', this.room);
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
    this.room = null;
  }
}
