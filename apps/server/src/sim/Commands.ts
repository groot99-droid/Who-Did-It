import type { Client } from '@colyseus/core';
import { C2S } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { runAction } from './Actions';
import { handleBank } from './economy/bank';
import { handleBuy, handleSell } from './economy/shops';
import { handleMinigameResult } from './Minigames';
import { handleLight } from './mobs/light';
import { handleTalk } from './townsfolk/talk';
import { handleQuestAccept, handleQuestTurnIn } from './Quests';
import { runHolds } from './Hold';
import { handleInspect } from './inspect';
import { queuePortal } from './PortalQueue';
import { handleDonate, handleFaith } from './economy/faith';
import { handlePayRent } from './economy/rent';
import { handleHq } from './economy/hq';
import { handleNotice } from './economy/notices';
import { handleMug } from './townsfolk/mug';
import { handleCraftGrid } from './Craft';
import { handleInvMove, handleInvSelect } from './InventoryMoves';
import { handlePairAnswer, handlePairAsk } from './law/Pairing';
import { handlePetitionOpen, handlePetitionSign } from './law/Petition';
import { handlePresent } from './law/Tribunal';
import { wakeOnInput } from './Sleep';

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
    // Round 10, A7 (GDD 3.32): a sleeper's first input wakes it and is refused, silently; chat is not an act.
    if (cmd.type !== C2S.say && wakeOnInput(room, cmd.sessionId, true)) continue;
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
      case C2S.talkAsk: // round 10, D9c (GDD 3.24, seams.md 3 row 16)
        handleTalk(room, cmd.sessionId, payload);
        break;
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
      // Round 8 (GDD 3.23, 8D): the civic commands; each refuses until its loop lands.
      case C2S.notice:
        handleNotice(room, cmd.sessionId, payload);
        break;
      case C2S.donate: // round 8, 8D (GDD 3.23)
        handleDonate(room, cmd.sessionId, payload);
        break;
      case C2S.faith: // round 8, 8D (GDD 3.23)
        handleFaith(room, cmd.sessionId, payload);
        break;
      case C2S.payRent: // round 8, 8D (GDD 3.23)
        handlePayRent(room, cmd.sessionId);
        break;
      case C2S.hq: // round 8, 8D (GDD 3.23)
        handleHq(room, cmd.sessionId, payload);
        break;
      // Round 8 (8E, GDD 3.24): the answer to a mugging prompt.
      case C2S.mug:
        handleMug(room, cmd.sessionId, payload);
        break;
      // Round 10, A12 (GDD 3.30): the inventory screen's moves.
      case C2S.invMove:
        handleInvMove(room, cmd.sessionId, payload);
        break;
      case C2S.invSelect:
        handleInvSelect(room, cmd.sessionId, payload);
        break;
      case C2S.craftGrid: // round 10, A13 (GDD 3.30)
        handleCraftGrid(room, cmd.sessionId, payload);
        break;
      // Round 10, B8 (GDD 3.31): Walk with me.
      case C2S.pairAsk:
        handlePairAsk(room, cmd.sessionId, payload);
        break;
      case C2S.pairAnswer:
        handlePairAnswer(room, cmd.sessionId, payload);
        break;
      // Round 10, B3 (GDD 3.31): petitions.
      case C2S.petitionOpen:
        handlePetitionOpen(room, cmd.sessionId, payload);
        break;
      case C2S.petitionSign:
        handlePetitionSign(room, cmd.sessionId, payload);
        break;
      // Round 10, B6a (GDD 3.8): presenting at the Tribunal.
      case C2S.present:
        handlePresent(room, cmd.sessionId, payload);
        break;
      default:
        // act.interact, hide, check and burst arrive with M4+; queued and ignored until then.
        break;
    }
  }
  runHolds(room);
}
