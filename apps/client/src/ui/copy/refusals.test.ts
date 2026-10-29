import abilitiesJson from '@wdi/content/data/abilities.json';
import rolesJson from '@wdi/content/data/roles.json';
import { NFY_FEATURES, REFUSAL_REASONS, SILENT_REASONS, type RefusalReason } from '@wdi/shared/protocol';
import { describe, expect, it } from 'vitest';
import { aName, NOTHING_HAPPENS, REFUSAL_COPY, refusalLine } from './refusals';

// Round 10, A1 (docs/round9/failures.md 3 to 5, UI.md 14.43): the line of every refusal reason.

const release = { dev: false };
const dev = { dev: true };

/** Every argument any reason takes, with values that are no role's and no ability's name. */
const FULL = {
  feature: 'sleeping',
  until: 'night',
  why: 'ghost',
  readyInS: 4.2,
  what: 'power',
  rule: 'full',
  of: 'pile',
  item: 'timber',
  need: 'spade',
  tier: 1,
  lock: 'iron',
  pick: 'none',
  missing: ['timber', 'resin'],
  short: 3,
  kind: 'shop',
};

const linesOf = (reason: RefusalReason): string[] =>
  [refusalLine(reason, {}, dev), refusalLine(reason, FULL, dev)].filter((l): l is string => l !== null);

describe('refusal lines', () => {
  it('give every reason a line, so the unknown-reason fallback never fires for a known one', () => {
    expect(Object.keys(REFUSAL_COPY).sort()).toEqual([...REFUSAL_REASONS].sort());
    for (const reason of REFUSAL_REASONS) {
      if (SILENT_REASONS.has(reason) || reason === 'SAY_SOMETHING') continue;
      if (reason !== 'VOIDED') expect(refusalLine(reason, {}, release), reason).not.toBe(NOTHING_HAPPENS);
      expect(refusalLine(reason, {}, release) ?? '', reason).not.toMatch(/undefined|NaN|\{\w+\}|Bug:/);
      expect(refusalLine(reason, FULL, release) ?? '', reason).not.toMatch(/undefined|NaN|\{\w+\}|Bug:/);
    }
  });

  it('never name a role or an ability (rule 4)', () => {
    const roles = Object.values(rolesJson.roles).map((r) => r.name);
    const abilities = Object.values(abilitiesJson.abilities).map((a) => (a as { name: string }).name);
    const words = [...roles, ...abilities].map(
      (n) => new RegExp(`\\b${n.replace(/[^\w ]/g, '\\$&')}\\b`, 'i'),
    );
    const lines = [...REFUSAL_REASONS.flatMap(linesOf), ...NFY_FEATURES.map((f) => `NFY: ${f}.`)];
    for (const line of lines) for (const word of words) expect(line).not.toMatch(word);
  });

  it('name what is missing in the world voice (rule 2, the owner example)', () => {
    expect(refusalLine('LOCKED', { pick: 'none' }, release)).toBe(
      'Failed to pick the lock. Looks like you might need a lock pick.',
    );
    expect(refusalLine('NEED_TOOL', { need: 'spade' }, release)).toBe(
      'You cannot work this without a spade.',
    );
    expect(refusalLine('NEED_MATERIALS', { missing: ['timber', 'resin', 'stone'] }, release)).toBe(
      'You are short: timber, pine resin and stone.',
    );
    expect(refusalLine('NEED_SCRIP', { short: 3 }, release)).toBe('You are 3 Scrip short.');
    expect(refusalLine('COOLDOWN', { readyInS: 4.2 }, release)).toBe('Not ready yet: 5 s.');
    expect(refusalLine('PHASE_CLOSED', { until: 'night' }, release)).toBe(
      'Not now. This waits for nightfall.',
    );
    expect(aName('salts')).toBe('some salts');
  });

  it('keep a voided strike opaque, whatever stopped it (rule 4, FM4)', () => {
    expect(refusalLine('VOIDED', {}, release)).toBe(NOTHING_HAPPENS);
  });

  it('show NFY with its feature, or Nothing happens once the release switch is off (FM1)', () => {
    expect(refusalLine('NFY', { feature: 'fighting back' }, release)).toBe('NFY: fighting back.');
    expect(refusalLine('NFY', { feature: 'fighting back' }, { dev: false, nfy: false })).toBe(
      NOTHING_HAPPENS,
    );
  });

  it('hide malformed requests in release and name them in dev (rule 5); drop the empty line', () => {
    expect(refusalLine('BAD_REQUEST', {}, release)).toBeNull();
    expect(refusalLine('BAD_REQUEST', {}, dev)).toBe('Bug: bad request');
    expect(refusalLine('SAY_SOMETHING', {}, dev)).toBeNull();
    expect(refusalLine('ASLEEP', {}, release)).toBeNull();
  });

  it('read an unknown reason as Nothing happens in release and as a bug in dev (rule 3)', () => {
    expect(refusalLine('NOT_A_REASON', {}, release)).toBe(NOTHING_HAPPENS);
    expect(refusalLine(undefined, undefined, dev)).toBe('Bug: unhandled refusal undefined');
    expect(refusalLine('NEED_ITEM', 'garbage', release)).toBe('You are missing what it takes.');
  });
});
