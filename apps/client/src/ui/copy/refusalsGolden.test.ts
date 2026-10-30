import { describe, expect, it } from 'vitest';
import { NOTHING_HAPPENS, refusalText, type InteractionFails } from './refusals';

// Round 10, A4 (docs/round9/failures.md 5 and 6.2): the line a player reads is the interaction's own `fail` line for
// the reason when the frame names an interaction, else the general line of the reason, and never the server's `msg`.

/** The seven owner-visible examples of failures.md 5 as the logic table will hold them (the lines are the draft copy). */
const FAILS: Record<string, Record<string, string>> = {
  pickLock: { NEED_TOOL: 'Failed to pick the lock. Looks like you might need a lock pick.' },
  chopWoodpile: {
    NEED_TOOL: 'You tug at the timber. It will not come apart by hand. An axe would.',
  },
  fellTree: { NEED_TOOL: 'The trunk will not move for your hands. An axe would fell it.' },
  sawLogs: { NEED_STATION: 'Logs want a saw. The lumber mill has one, or a saw horse will do slowly.' },
  digSeam: { NEED_TOOL: 'The seam will not give. A spade would.' },
  breakBoulder: { NEED_TOOL: 'The boulder does not care. You would want a pickaxe.' },
  openChest: { NEED_KEY: 'The lock holds. It wants a key, or a pick.' },
};
const fails: InteractionFails = (id) => FAILS[id];
const release = { dev: false, fails };

describe('the line of a refusal', () => {
  it.each([
    [
      'pickLock',
      'NEED_TOOL',
      { need: 'pick' },
      'Failed to pick the lock. Looks like you might need a lock pick.',
    ],
    [
      'chopWoodpile',
      'NEED_TOOL',
      { need: 'axe' },
      'You tug at the timber. It will not come apart by hand. An axe would.',
    ],
    [
      'fellTree',
      'NEED_TOOL',
      { need: 'axe' },
      'The trunk will not move for your hands. An axe would fell it.',
    ],
    [
      'sawLogs',
      'NEED_STATION',
      { need: 'saw' },
      'Logs want a saw. The lumber mill has one, or a saw horse will do slowly.',
    ],
    ['digSeam', 'NEED_TOOL', { need: 'spade' }, 'The seam will not give. A spade would.'],
    [
      'breakBoulder',
      'NEED_TOOL',
      { need: 'pickaxe' },
      'The boulder does not care. You would want a pickaxe.',
    ],
    ['openChest', 'NEED_KEY', {}, 'The lock holds. It wants a key, or a pick.'],
  ])('reads the %s line of the interaction for %s', (interaction, reason, args, line) => {
    expect(refusalText({ reason, args, interaction }, release)).toBe(line);
  });

  it('falls back to the general line of the reason when the interaction has none for it', () => {
    expect(
      refusalText({ reason: 'NEED_TOOL', args: { need: 'spade' }, interaction: 'openChest' }, release),
    ).toBe('You cannot work this without a spade.');
    expect(
      refusalText({ reason: 'NEED_TOOL', args: { need: 'spade' }, interaction: 'unknown' }, release),
    ).toBe('You cannot work this without a spade.');
  });

  it('reads the general line of the reason when no interaction is named', () => {
    expect(refusalText({ reason: 'LOCKED', args: { pick: 'none' } }, release)).toBe(
      'Failed to pick the lock. Looks like you might need a lock pick.',
    );
    expect(refusalText({ reason: 'PHASE_CLOSED', args: { until: 'night' } }, release)).toBe(
      'Not now. This waits for nightfall.',
    );
    expect(refusalText({ reason: 'VOIDED' }, release)).toBe(NOTHING_HAPPENS);
  });

  it('shows the NFY tag as written, and hides it behind the release switch', () => {
    expect(refusalText({ reason: 'NFY', args: { feature: 'petition' } }, release)).toBe('NFY: petition.');
    expect(refusalText({ reason: 'NFY', args: { feature: 'petition' } }, { ...release, nfy: false })).toBe(
      NOTHING_HAPPENS,
    );
  });

  it('shows nothing for a silent reason in a release build, and never the server msg', () => {
    expect(refusalText({ reason: 'ASLEEP' }, release)).toBeNull();
    expect(refusalText({ reason: 'SAY_SOMETHING' }, release)).toBeNull();
    expect(refusalText({ reason: 'NOT_A_REASON' }, release)).toBe(NOTHING_HAPPENS);
    expect(refusalText({ reason: 'NOT_A_REASON' }, { ...release, dev: true })).toBe(
      'Bug: unhandled refusal NOT_A_REASON',
    );
  });
});
