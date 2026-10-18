import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';

// The frozen `data-testid` hooks of onub-contract.md 7 that this session's files own: a spec may rely on them,
// so a rename must fail here first.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const prep = read('./PrepView.ts');
const station = read('./StationView.ts');
const piles = read('./PilesView.ts');
const deck = read('../../ui/lobby/DeckEditor.ts');

describe('frozen kitchen hooks', () => {
  it.each(['kitchen', 'onub-clock', 'prep-done', 'prep-board', 'perk-card'])('PrepView carries %s', (id) => {
    expect(prep).toContain(`'data-testid': '${id}'`);
  });

  it('PrepView builds station-<id> for each station', () => {
    expect(prep).toContain('`station-${s.id}`');
    expect(onubBalance.stations.map((s) => s.id)).toEqual(['fridge', 'mixer', 'proofing', 'oven']);
  });

  it.each(['station-room', 'station-back', 'minigame-assist', 'hand', 'prep-commit'])(
    'StationView carries %s',
    (id) => {
      expect(station).toContain(`'data-testid': '${id}'`);
    },
  );

  it.each(['`minigame-${stationId}`', '`card-${id}`'])('StationView builds %s', (expr) => {
    expect(station).toContain(expr);
  });

  it.each(['`pile-${stationId}`', "'under-mix-flag'", "'ruin-banner'"])('PilesView carries %s', (expr) => {
    expect(piles).toContain(expr);
  });

  it.each(['deck-editor', 'deck-reset', 'deck-problem'])('DeckEditor carries %s', (id) => {
    expect(deck).toContain(`'data-testid': '${id}'`);
  });

  it('DeckEditor builds one deck-role-<id> toggle for each of the 15 roles', () => {
    expect(deck).toContain('`deck-role-${id}`');
    expect(Object.keys(onubRoles.roles)).toHaveLength(15);
  });
});
