import type { Client } from '@colyseus/core';
import { C2S } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';

/** A client message waiting for the next step(). Message callbacks only ever push here. */
export interface QueuedCommand {
  sessionId: string;
  type: string;
  payload: unknown;
}

export class CommandQueue {
  private items: QueuedCommand[] = [];

  push(client: Client, type: string, payload: unknown): void {
    this.items.push({ sessionId: client.sessionId, type, payload });
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
      case C2S.lobbyReady:
        if (room.state.phase === 0 && typeof payload.ready === 'boolean') player.ready = payload.ready;
        break;
      default:
        // act.*, meeting.*, chat.* arrive in M2+; queued and ignored until their stage exists.
        break;
    }
  }
}
