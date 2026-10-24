import type { Client } from '@colyseus/core';
import { C2S } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { runAction } from './Actions';
import { handleBank } from './economy/bank';
import { handleBuy, handleSell } from './economy/shops';
import { handleMinigameResult } from './Minigames';
import { handleLight } from './mobs/light';
import { handleQuestAccept, handleQuestTurnIn } from './Quests';
import { runHolds } from './Hold';
import { handleInspect } from './inspect';
import { queuePortal } from './PortalQueue';
import { handleMug } from './townsfolk/mug';

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
      case C2S.ability:
      case C2S.hold:
      case C2S.reportBody:
      case C2S.bell:
        runAction(room, cmd.sessionId, cmd.type, payload);
        break;
      // Round 6 (locked call sites): the M5b commands go to their owners' files (6H); each refuses until it lands.
      case C2S.questAccept:
        handleQuestAccept(room, cmd.sessionId, payload);
        break;
      case C2S.questTurnIn:
        handleQuestTurnIn(room, cmd.sessionId, payload);
        break;
      case C2S.minigameResult:
        handleMinigameResult(room, cmd.sessionId, payload);
        break;
      case C2S.light:
        handleLight(room, cmd.sessionId, payload);
        break;
      // Round 8 (GDD 3.22 "Inspect"): 8B's `sim/inspect/`.
      case C2S.inspect:
        handleInspect(room, cmd.sessionId, payload);
        break;
      // Round 8, 8C (locked; GDD 3.23): trading at the shop, and banking at the bank, a hold opened.
      case C2S.buy:
        handleBuy(room, cmd.sessionId, payload);
        break;
      case C2S.sell:
        handleSell(room, cmd.sessionId, payload);
        break;
      case C2S.bank:
        handleBank(room, cmd.sessionId, payload);
        break;
      // Round 8 (8E, GDD 3.24): the answer to a mugging prompt.
      case C2S.mug:
        handleMug(room, cmd.sessionId, payload);
        break;
      default:
        // act.interact, hide, check, burst, present arrive with M4+; queued and ignored until then.
        break;
    }
  }
  runHolds(room);
}
