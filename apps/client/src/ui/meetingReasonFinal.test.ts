import { describe, expect, it } from 'vitest';
import { reasonLine } from './meetingText';

describe('the Final Night meeting line (GDD 3.2, UI.md 14.40)', () => {
  it('names the forced meeting, not a roll call, and still says missing for a missing meeting', () => {
    const nameOf = (id: string) => (id === 'h' ? 'Hana' : 'Someone');
    expect(reasonLine({ reason: 'final', callerId: '', missing: [] }, nameOf)).toBe(
      'The Final Night: the village must choose',
    );
    expect(reasonLine({ reason: 'missing', callerId: 'h', missing: ['g'] }, nameOf)).toBe(
      'Roll call: someone is missing',
    );
  });
});
