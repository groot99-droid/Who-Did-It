import type { Emitter } from 'mitt';
import type { S2CPayloads } from '@wdi/shared/protocol';

// What the Meeting and GameOver screens need from the network. `ColyseusMeetingFeed` reads the room, the
// mock feed (?mock=1) simulates the same data; the screens cannot tell them apart. Public roster fields and
// what the server reveals are all that ever reach this file (role secrecy, CLAUDE.md).

export interface MeetingPlayer {
  id: string;
  name: string;
  /** Trait indices as dealt (height S/M/T, scarf red/green/blue, hat cap/bowler/bare, GDD 3.1). */
  traits: { height: number; scarf: number; hat: number };
  /** Public look id (`Player.look`, looks.json): '' until the role card closes (GDD 3.17). */
  look: string;
  alive: boolean;
  hasVoted: boolean;
  /** Round 7 (GDD 3.21): the seat's public profile code, '' or absent without one; says nothing of a role. */
  profile?: string;
}

export interface MeetingInfo {
  /** Same `Phase` id as `GameState.phase`; 0 outside a meeting. */
  phase: number;
  reason: string;
  callerId: string;
  bodyOf: string;
  endsTick: number;
}

export interface ChatLine {
  from: string;
  text: string;
  channel: S2CPayloads['chat.msg']['channel'];
}

export type MeetingStart = S2CPayloads['meetingStart'];
export type VoteResult = S2CPayloads['voteResult'];
export type GameOver = S2CPayloads['gameOver'];

export type MeetingFeedEvents = {
  meetingStart: MeetingStart;
  voteResult: VoteResult;
  gameOver: GameOver;
  'chat.msg': S2CPayloads['chat.msg'];
  phaseChange: S2CPayloads['phaseChange'];
  /** Main mode, during a reveal: the ejected Gamekeeper's Last Shot (GDD 3.2). */
  shot: S2CPayloads['shot'];
};

export interface MeetingFeed {
  readonly bus: Emitter<MeetingFeedEvents>;
  readonly selfId: string;
  /** Everyone seated, public fields only. */
  roster(): MeetingPlayer[];
  meeting(): MeetingInfo;
  clock(): { tick: number; phase: number; phaseEndsTick: number };
  /** The id (or `"skip"`) this player voted for; empty before a vote. Private to this client. */
  myVote(): string;
  /** The last `meetingStart` and `voteResult` of this meeting, so a screen that mounts late still renders. */
  started(): MeetingStart | null;
  /**
   * Round 8 (8L, GDD 3.8): the tick votes open, `meeting.minVoteS` after the `meetingStart` this feed saw; 0 when it
   * saw none (the server still refuses an early vote).
   */
  votesOpenTick(): number;
  result(): VoteResult | null;
  /** The last `gameOver`, kept for the GameOver screen. */
  over(): GameOver | null;
  /** Chat lines since the meeting opened. */
  lines(): readonly ChatLine[];
  /** `targetId` is a living player's id or `"skip"`. */
  vote(targetId: string): void;
  say(text: string): void;
  dispose(): void;
}

/** Phaser registry key under which the router publishes the active meeting feed. */
export const REG_MEETING = 'meetingFeed';

/** The vote id for Skip (`meeting.vote`, GDD 3.8). */
export const SKIP = 'skip';
