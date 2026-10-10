import { describe, expect, it } from 'vitest';
import { onubBalance, onubFor, onubRoles, PLAYER_COUNTS, type WinnerRow } from '../src/index.js';
import { binomial } from './helpers.js';

const counts = PLAYER_COUNTS.map(Number);
const tally = (deck: readonly string[], role: string) => deck.filter((r) => r === role).length;

describe('quick-mode decks (GDD 3.11)', () => {
  it('deals N + 3 loaves at every count', () => {
    for (const n of counts) {
      expect(onubFor(n).loaves, `${n}`).toBe(n + 3);
      expect(onubFor(n).deck, `${n}`).toHaveLength(n + 3);
      expect(onubFor(n).planned, `${n}`).toHaveLength(n + 3);
    }
  });

  it('follows the deck table', () => {
    expect([...onubFor(4).deck].sort()).toEqual(
      ['poisoner', 'poisoner', 'sinEater', 'cutpurse', 'busybody', 'mourner', 'mourner'].sort(),
    );
    const added = (n: number) => {
      const prev = [...onubFor(n - 1).planned];
      return onubFor(n).planned.filter((r) => {
        const i = prev.indexOf(r);
        if (i < 0) return true;
        prev.splice(i, 1);
        return false;
      });
    };
    expect(added(5)).toEqual(['debtor']);
    expect(added(6)).toEqual(['hireling']);
    expect(added(7)).toEqual(['lamplighter']);
    expect(added(8)).toEqual(['sot']);
    expect(added(9).sort()).toEqual(['pallbearer', 'pallbearer']);
    expect(tally(onubFor(9).planned, 'mourner')).toBe(1);
    expect(added(10)).toEqual(['gamekeeper']);
  });

  it('deals Mourners for the V1.1 roles in V1 (nine roles)', () => {
    expect(tally(onubFor(9).deck, 'mourner')).toBe(3);
    expect(tally(onubFor(10).deck, 'mourner')).toBe(4);
    const v1 = new Set(counts.flatMap((n) => onubFor(n).deck));
    expect(v1.size).toBe(9);
    for (const id of v1) expect(onubRoles.roles[id]?.ships).toBe('V1');
  });

  it('always has exactly two Poisoners', () => {
    for (const n of counts) expect(tally(onubFor(n).deck, 'poisoner')).toBe(2);
  });

  it('puts both Poisoners on the ledge in 3 / C(N+3, 2) of deals, as GDD 3.11 rounds it', () => {
    const pct = (n: number) => Math.round((100 * 3) / binomial(n + 3, 2));
    expect([pct(4), pct(6), pct(10)]).toEqual([14, 8, 4]);
  });

  it('gives the Village and Cabal the discussion times of the table', () => {
    expect(counts.map((n) => onubFor(n).discussionS)).toEqual([150, 150, 180, 180, 210, 210, 210]);
  });
});

describe('night windows (GDD 3.11)', () => {
  it('gives every waking role exactly one window and the others none', () => {
    for (const role of Object.values(onubRoles.roles)) {
      const windows = onubBalance.windows.filter((w) => w.role === role.id);
      expect(windows, role.id).toHaveLength(role.wakes ? 1 : 0);
    }
    expect(
      Object.values(onubRoles.roles)
        .filter((r) => !r.wakes)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['debtor', 'gamekeeper', 'mourner']);
  });

  it('gives every role dealt at any count a window or no night act', () => {
    for (const n of counts) {
      for (const id of new Set(onubFor(n).planned)) {
        const role = onubRoles.roles[id]!;
        expect(role.wakes || /^No night act/.test(role.nightAct), id).toBe(true);
      }
    }
  });

  it('orders the windows and their lengths as the table', () => {
    expect(onubBalance.windows.map((w) => [w.role, w.seconds])).toEqual([
      ['poisoner', 12],
      ['hireling', 8],
      ['pallbearer', 8],
      ['sinEater', 14],
      ['cutpurse', 12],
      ['busybody', 14],
      ['sot', 10],
      ['lamplighter', 8],
    ]);
  });

  it('makes night length the windows present plus a fade each', () => {
    const night = (deck: readonly string[]) =>
      onubBalance.windows
        .filter((w) => deck.includes(w.role))
        .reduce((s, w) => s + w.seconds + onubBalance.timers.fadeS, 0);
    expect(counts.map((n) => night(onubFor(n).deck))).toEqual([60, 60, 70, 80, 92, 92, 92]);
    expect(night(onubFor(10).planned)).toBe(102);
  });

  it('keeps whole matches inside the GDD 3.11 table, jitter included', () => {
    const t = onubBalance.timers;
    const match = (n: number, jitter: number) => {
      const row = onubFor(n);
      const windows = onubBalance.windows.filter((w) => row.planned.includes(w.role));
      const night = windows.reduce((s, w) => s + w.seconds + t.fadeS + jitter, 0);
      return t.roleCardS + t.duskS + night + t.dawnS + row.discussionS + t.voteS + t.revealS;
    };
    const bounds: Record<number, [number, number]> = {
      4: [4.5, 5.5],
      5: [4.5, 5.5],
      6: [5, 6.5],
      7: [5, 6.5],
      8: [6, 7.5],
      9: [6, 7.5],
      10: [6, 7.5],
    };
    for (const n of counts) {
      const [lo, hi] = bounds[n]!;
      expect(match(n, 0) / 60, `${n} min`).toBeGreaterThanOrEqual(lo);
      expect(match(n, t.windowJitterMaxS) / 60, `${n} max`).toBeLessThanOrEqual(hi);
    }
  });

  it("references only defined acts and makes the Sot's swap mandatory", () => {
    for (const w of onubBalance.windows)
      for (const a of w.acts) expect(onubBalance.acts[a.act]).toBeDefined();
    expect(onubBalance.windows.find((w) => w.role === 'sot')?.onTimeout).toBe('seededPick');
    expect(onubBalance.windows.find((w) => w.role === 'poisoner')?.onlyIfAlone).toBe(true);
  });
});

describe('dawn winner table (GDD 3.11)', () => {
  const matches = (row: WinnerRow, s: Record<keyof WinnerRow['when'], boolean>) =>
    (Object.keys(row.when) as Array<keyof WinnerRow['when']>).every((k) => row.when[k] === s[k]);

  it('matches exactly one row for every consistent dawn', () => {
    let consistent = 0;
    for (let bits = 0; bits < 16; bits++) {
      const s = {
        debtorOut: Boolean(bits & 1),
        poisonerOut: Boolean(bits & 2),
        poisonerAmongMourners: Boolean(bits & 4),
        anyoneOut: Boolean(bits & 8),
      };
      const possible =
        (!s.poisonerOut || (s.poisonerAmongMourners && s.anyoneOut)) && (!s.debtorOut || s.anyoneOut);
      const hits = onubBalance.winners.filter((r) => matches(r, s));
      if (possible) {
        consistent++;
        expect(
          hits.map((h) => h.id),
          JSON.stringify(s),
        ).toHaveLength(1);
      }
    }
    expect(consistent).toBe(8);
  });

  it('lets a turned-out Debtor beat the Cabal', () => {
    for (const row of onubBalance.winners.filter((r) => r.when.debtorOut === true)) {
      expect(row.winners).toContain('debtor');
      expect(row.winners).not.toContain('cabal');
    }
  });
});

describe('dawn vote', () => {
  it('has no Skip, no self-vote and needs two votes to turn anyone out', () => {
    expect(onubBalance.vote).toMatchObject({
      skipAllowed: false,
      selfVoteAllowed: false,
      minVotesToTurnOut: 2,
      tiesTurnOutAll: true,
      gamekeeperHops: 1,
    });
  });
});
