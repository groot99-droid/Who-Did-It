import { NoteKind } from '@wdi/shared/constants';
import { describe, expect, it, vi } from 'vitest';
import { acceptContract, openContractEntry } from './vendettas';

// GDD 3.20 "Contract": the Notebook's Accept button shows on the seat's own open contract note only.

const clue = { id: 'entry_1', note: 0, of: '' };
const power = { id: 'entry_2', note: 1, of: 'b' };
const mail = { id: 'entry_3', note: NoteKind.contract, of: 'b' };
const alive = (seat: string) => seat === 'b';

describe('openContractEntry', () => {
  it('names the contract note while the offer is open', () => {
    expect(openContractEntry([clue, power, mail], [], alive)).toBe('entry_3');
  });

  it('shows on no other note and on a Notebook without the mail', () => {
    expect(openContractEntry([clue, power], [], alive)).toBeNull();
    expect(openContractEntry([], [], alive)).toBeNull();
    // A seat that holds no contract (any other seat's own view) never has the note, so nothing renders there.
    expect(openContractEntry([{ id: 'entry_9' }], [{ id: 'herbs' }], () => true)).toBeNull();
  });

  it('closes once accepted or once the mark is off the roster', () => {
    expect(openContractEntry([mail], [{ id: 'contract' }], alive)).toBeNull();
    expect(openContractEntry([mail], [], () => false)).toBeNull();
  });
});

describe('acceptContract', () => {
  it('sends quest.accept for the contract', () => {
    const questAccept = vi.fn();
    acceptContract({ questAccept });
    expect(questAccept).toHaveBeenCalledExactlyOnceWith('contract');
  });
});
