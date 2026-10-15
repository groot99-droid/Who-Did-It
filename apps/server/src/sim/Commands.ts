import type { Client } from '@colyseus/core';
import { C2S } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { queuePortal } from './PortalQueue';

/** A client message waiting for the next step(). Message callbacks only ever push here. */
export interface QueuedCommand {
  sessionId: string;
  type: string;
  payload: unknown;
}

export class CommandQueue {
  private items: QueuedCommand[] = [];
  /** `input.move` keeps only the newest per client: one is applied per tick, newest wins (5.6). */
  private moves = new Map<string, unknown>();

  push(client: Client, type: string, payload: unknown): void {
    if (type === C2S.move) this.moves.set(client.sessionId, payload);
    else this.items.push({ sessionId: client.sessionId, type, payload });
  }

  /** The newest queued `input.move` of every client; consumed by `applyInputs`. */
  takeMoves(): Map<string, unknown> {
    const out = this.moves;
    this.moves = new Map();
    return out;
  }

  /** Drops a client's pending move (a portal crossing clears inputs). */
  clearMove(sessionId: string): void {
    this.moves.delete(sessionId);
  }

  /** Hands over everything queued so far in arrival order. */
  drain(): QueuedCommand[] {
    const out = this.items;
    this.items = [];
    return out;
  }
}

/** Every payload is untrusted: validate before touching state. */
export function runCommands(room: PartyRoom): void {
  for (const cmd of room.commands.drain()) {
    const player = room.state.players.get(cmd.sessionId);
    if (!player) continue;
    const payload = (cmd.payload ?? {}) as Record<string, unknown>;
    switch (cmd.type) {
      case C2S.enterPortal:
        queuePortal(room, cmd.sessionId, payload);
        break;
      default:
        // act.*, meeting.*, chat.* arrive in M2+; queued and ignored until their stage exists.
        break;
    }
  }
}
