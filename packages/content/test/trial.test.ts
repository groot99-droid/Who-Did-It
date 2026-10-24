import { describe, expect, it } from 'vitest';
import { content, validateContent, type Content } from '../src/index.js';

// Round 8 (8M, DECISIONS A171; GDD 3.3): the Final Night's trial is longer than every ordinary discussion.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}

describe('finalNight.trialS (GDD 3.3)', () => {
  it('is accepted as shipped', () => {
    expect(validateContent(content)).toEqual([]);
  });

  it('is refused when it is no longer than the longest discussion', () => {
    const longest = Math.max(...Object.values(content.balance.byCount).map((row) => row.discussionS));
    const msg = `balance.json finalNight.trialS: must be longer than the longest discussion (${longest} s)`;
    expect(broken((c) => (c.balance.finalNight.trialS = longest))).toContain(msg);
    expect(broken((c) => (c.balance.finalNight.trialS = longest + 1))).toEqual([]);
  });
});
