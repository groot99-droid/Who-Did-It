import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import { actLogLine } from './actlog';
import { overHeadline } from './over';
import { ONUB_NIGHT_COPY } from '../copy/onubNight';

const slotName = (s: string) => `[${s}]`;

describe('act log lines', () => {
  it('has a line for every act of the content', () => {
    for (const id of Object.keys(onubBalance.acts))
      expect(`onub.log.${id.replace(/^onub\./, '')}` in ONUB_NIGHT_COPY, id).toBe(true);
  });

  it('names the window role, the card taken and marks an act the server made', () => {
    expect(
      actLogLine(
        { order: 9, roleId: 'sousChef', act: 'onub.rob', slots: ['seat.0.role', 'seat.2.role'], auto: false },
        slotName,
      ),
    ).toBe('Le Sous-Chef took [seat.2.role]');
    expect(
      actLogLine(
        {
          order: 12,
          roleId: 'gardeManger',
          act: 'onub.drunk',
          slots: ['seat.1.role', 'pantry.role.0'],
          auto: true,
        },
        slotName,
      ),
    ).toBe('Le Garde Manger swapped with [pantry.role.0], without looking (the kitchen chose for them)');
  });

  it('names both cards of a pair', () => {
    expect(
      actLogLine(
        {
          order: 11,
          roleId: 'plongeur',
          act: 'onub.dishLocs',
          slots: ['seat.1.loc', 'seat.2.loc'],
          auto: false,
        },
        slotName,
      ),
    ).toBe('Le Plongeur swapped [seat.1.loc] and [seat.2.loc], without looking');
  });
});

describe('end screen headline', () => {
  it('has its own line for every winners row, not the Winner enum', () => {
    for (const w of onubBalance.winners) {
      const line = overHeadline(w.id);
      expect(line, w.id).not.toBe('');
      expect(line).not.toBe(w.text);
    }
  });
});
