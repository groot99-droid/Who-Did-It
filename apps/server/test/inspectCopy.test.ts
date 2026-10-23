import { describe, expect, it } from 'vitest';
import { inspectLine } from '../../client/src/ui/copy/inspect';
import { SIGN_OF_BIT, SIGN_OF_EFFECT } from '../src/sim/inspect/read';

// Round 8 (GDD 3.22 "Inspect"), Session 8B: every sign id the server sends has words in the client's copy (UI.md 14.33).

describe('inspect sign copy', () => {
  it('covers every sign of a status bit and of a close-look effect', () => {
    for (const [, id] of [...SIGN_OF_BIT, ...SIGN_OF_EFFECT]) expect(inspectLine(id), id).not.toBeNull();
  });
});
