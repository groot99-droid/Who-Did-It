import { describe, expect, it } from 'vitest';
import {
  ErrorCode,
  isRefusalReason,
  REASON_CODE,
  REFUSAL_REASONS,
  refusalFrame,
  type ErrorPayload,
} from '../src/protocol/index';

// Round 10, A1 (docs/round9/failures.md 4 to 6): the closed list of refusal reasons and the error frame.

/** The list as A1 shipped it. The list is append-only (docs/round10/seams.md 1), so this stays its prefix. */
// prettier-ignore
const A1_REASONS = [
  'NFY', 'BAD_REQUEST', 'DEBUG_ONLY',
  'PHASE_CLOSED', 'NOT_IN_PLAY', 'DOWN_OR_STUNNED', 'BUSY', 'COOLDOWN', 'SPENT', 'LOBBY_ONLY', 'NOT_LEADER', 'LOBBY_RULE',
  'TOO_FAR', 'NO_TARGET', 'NOTHING_THERE', 'TARGET_DOWN', 'NOTHING_TO_CURE', 'VOIDED', 'NO_WAY', 'NOT_AIMED',
  'ALREADY_DONE', 'ALREADY_HAVE',
  'NEED_TOOL', 'NEED_KEY', 'LOCKED', 'CURFEW', 'BOARDED', 'NEED_ITEM', 'NEED_MATERIALS', 'NEED_STATION', 'NEED_SCRIP',
  'NEED_FAITH', 'NOT_YOUR_POWER',
  'PACK_FULL', 'FAITH_FULL', 'NO_COUNTER', 'COUNTER_CLOSED', 'NOT_FOR_SALE', 'NOT_BOUGHT_HERE', 'NOTHING_OWED',
  'SEAL_BLOCKS', 'OWN_NAME',
  'NOT_YOURS', 'TASK_TAKEN', 'TOO_MANY_QUESTS', 'LOOK_TAKEN', 'SAY_SOMETHING', 'CHAT_RATE',
  'IN_JAIL', 'ASLEEP', 'NO_BED', 'BOARDED_HOME', 'PETITION_GRACE', 'PETITION_OPEN', 'NOT_HUNTED', 'PICK_SNAPPED',
  'GRID_NO_RECIPE', 'GRID_BOUND', 'NEEDS_PART',
];

describe('refusal reasons', () => {
  it('only ever grow at the end', () => {
    expect(REFUSAL_REASONS.slice(0, A1_REASONS.length)).toEqual(A1_REASONS);
    expect(new Set(REFUSAL_REASONS).size).toBe(REFUSAL_REASONS.length);
  });

  it('each have exactly one legacy code, and every code is an ErrorCode', () => {
    expect(Object.keys(REASON_CODE).sort()).toEqual([...REFUSAL_REASONS].sort());
    const codes = new Set<number>(Object.values(ErrorCode));
    for (const reason of REFUSAL_REASONS) expect(codes.has(REASON_CODE[reason])).toBe(true);
  });

  it('keep the codes of failures.md 4 for the reasons the client already sounds and shakes on', () => {
    expect(REASON_CODE.PHASE_CLOSED).toBe(ErrorCode.wrongPhase);
    expect(REASON_CODE.BUSY).toBe(ErrorCode.busy);
    expect(REASON_CODE.COOLDOWN).toBe(ErrorCode.cooldown);
    expect(REASON_CODE.TOO_FAR).toBe(ErrorCode.outOfRange);
    expect(REASON_CODE.LOCKED).toBe(ErrorCode.locked);
    expect(REASON_CODE.BOARDED).toBe(ErrorCode.closed);
  });

  it('are told apart from other strings', () => {
    expect(isRefusalReason('NEED_TOOL')).toBe(true);
    expect(isRefusalReason('need_tool')).toBe(false);
    expect(isRefusalReason(422)).toBe(false);
  });
});

describe('refusalFrame', () => {
  it('derives the code and keeps msg, so a client that ignores reason still reads code and msg', () => {
    const frame: ErrorPayload = refusalFrame('NEED_TOOL', { need: 'spade' }, { msg: 'needs a tool' });
    expect(frame).toEqual({ code: 422, msg: 'needs a tool', reason: 'NEED_TOOL', args: { need: 'spade' } });
    const legacy = frame as { code: number; msg: string };
    expect([legacy.code, legacy.msg]).toEqual([ErrorCode.cannot, 'needs a tool']);
  });

  it('sends no empty args, falls back to the reason as msg and carries the interaction', () => {
    expect(refusalFrame('BUSY')).toEqual({ code: ErrorCode.busy, msg: 'BUSY', reason: 'BUSY' });
    expect(refusalFrame('BUSY', {})).not.toHaveProperty('args');
    expect(refusalFrame('NEED_TOOL', { need: 'axe' }, { interaction: 'chopWoodpile' }).interaction).toBe(
      'chopWoodpile',
    );
  });
});
