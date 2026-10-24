import { describe, expect, it } from 'vitest';
import { content, validateContent } from '../src/index.js';

// Round 8, 8L (GDD 3.8): `meeting.minVoteS` stays under the shortest discussion, or a meeting could end unvoted.
describe('meeting.minVoteS', () => {
  it('is under every party size discussion, and a value at or over the shortest is rejected', () => {
    expect(validateContent(content)).toEqual([]);
    const copy = structuredClone(content);
    copy.balance.meeting.minVoteS = Math.min(
      ...Object.values(copy.balance.byCount).map((r) => r.discussionS),
    );
    expect(validateContent(copy)).toEqual(
      expect.arrayContaining([expect.stringContaining('meeting.minVoteS')]),
    );
  });
});
