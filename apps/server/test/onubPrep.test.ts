import { ColyseusTestServer, boot } from '@colyseus/testing';
import { onubBalance } from '@wdi/content';
import { ErrorCode, Phase, S2C, type NightRevealEntry } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { endPrep } from '../src/sim/onub/Prep';
import { fixSeeds } from './seedHelpers';
import {
  commit,
  errorsOf,
  memory,
  onubLobby,
  onubPrep,
  phaseOf,
  runOutPrep,
  startOnub,
  toPrep,
  until,
} from './onubPrepHelpers';
import { sleep, type Bot } from './simHelpers';

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await boot(createServer({ ipBurst: 100_000, ipPerMin: 100_000_000, globalPerMin: 100_000_000 }));
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

const bot = (bots: Bot[], i: number): Bot => bots[i] as Bot;
const msgs = (b: Bot, type: string) => b.events.filter((e) => e.type === type).map((e) => e.payload);
const lastError = (b: Bot) => errorsOf(b).at(-1);
/** Four humans: two Spores, the Levain and the Apprenti, who may all sabotage, in a custom 7-card deck. */
const MOLD_DECK = ['champignon', 'champignon', 'levain', 'apprenti', 'ratDeCave', 'chef', 'aboyeur'];
const MOLD_ROLES = { 0: 'champignon', 1: 'champignon', 2: 'levain', 3: 'apprenti' };

describe('onub.prep commits', () => {
  it('accepts a good card and writes only the seat’s own private view', async () => {
    const m = await onubPrep(colyseus, 5);
    commit(bot(m.bots, 1), 'oven', 'oakFirewood');
    await until(() => memory(m).commits.size === 1);
    const priv = m.room.state.players.get(bot(m.bots, 1).id)?.priv;
    expect([priv?.onubLoc, priv?.onubCard]).toEqual(['oven', 'oakFirewood']);
    expect(memory(m).commits.get(bot(m.bots, 1).id)).toEqual({ station: 'oven', card: 'oakFirewood' });
    expect(phaseOf(m)).toBe(Phase.dusk);
    // Nobody else's view moved, and no one is shown ready.
    for (const i of [0, 2, 3, 4]) {
      const p = m.room.state.players.get(bot(m.bots, i).id);
      expect([p?.priv.onubLoc, p?.priv.onubCard]).toEqual(['', '']);
      expect(p?.ready).toBe(false);
    }
  });

  it('refuses a second commit with 422 and keeps the first', async () => {
    const m = await onubPrep(colyseus, 5);
    commit(bot(m.bots, 0), 'fridge', 'pureDairy');
    await until(() => memory(m).commits.size === 1);
    commit(bot(m.bots, 0), 'mixer', 't55Flour');
    await until(() => errorsOf(bot(m.bots, 0)).length > 0);
    expect(lastError(bot(m.bots, 0))?.code).toBe(ErrorCode.cannot);
    expect(memory(m).commits.get(bot(m.bots, 0).id)).toEqual({ station: 'fridge', card: 'pureDairy' });
  });

  it('refuses a card a baker may not play (a sabotage card) and an unknown station or card, 422', async () => {
    const m = await onubPrep(colyseus, 4, { roles: { 0: 'chef' } });
    const b = bot(m.bots, 0);
    for (const [station, card] of [
      ['oven', 'wetWood'], // a sabotage card for a role that does not sabotage
      ['oven', 'pureDairy'], // another station's card
      ['attic', 'time'],
      ['oven', 'nothing'],
    ] as const) {
      commit(b, station, card);
    }
    await until(() => errorsOf(b).length === 4);
    expect(errorsOf(b).map((e) => e.code)).toEqual(Array(4).fill(ErrorCode.cannot));
    expect(memory(m).commits.size).toBe(0);
  });

  it('lets a Team Mold seat play a sabotage card, and a good one to blend in', async () => {
    const m = await onubPrep(colyseus, 4, { roles: MOLD_ROLES, deck: MOLD_DECK });
    commit(bot(m.bots, 0), 'oven', 'wetWood');
    commit(bot(m.bots, 2), 'fridge', 'pureDairy');
    await until(() => memory(m).commits.size === 2);
    expect(errorsOf(bot(m.bots, 0))).toHaveLength(0);
    expect(errorsOf(bot(m.bots, 2))).toHaveLength(0);
  });

  it('refuses malformed targets with 422', async () => {
    const m = await onubPrep(colyseus, 4);
    const b = bot(m.bots, 0);
    for (const targets of [undefined, 'oven', ['oven'], ['oven', 'oakFirewood', 'x'], [1, 2], [null, 'x']]) {
      b.room.send('act.ability', { abilityId: 'onub.prep', targets });
    }
    await until(() => errorsOf(b).length === 6);
    expect(errorsOf(b).map((e) => e.code)).toEqual(Array(6).fill(ErrorCode.cannot));
    expect(memory(m).commits.size).toBe(0);
  });

  it('refuses a commit outside Evening Prep with 425, on the role card and in the crime scenes', async () => {
    const m = await onubLobby(colyseus, 4);
    await startOnub(m);
    commit(bot(m.bots, 0), 'oven', 'oakFirewood'); // role card phase
    await until(() => errorsOf(bot(m.bots, 0)).length === 1);
    expect(lastError(bot(m.bots, 0))?.code).toBe(ErrorCode.wrongPhase);
    await toPrep(m);
    runOutPrep(m);
    await until(() => phaseOf(m) === Phase.prepReveal);
    commit(bot(m.bots, 0), 'oven', 'oakFirewood');
    await until(() => errorsOf(bot(m.bots, 0)).length === 2);
    expect(lastError(bot(m.bots, 0))?.code).toBe(ErrorCode.wrongPhase);
    expect(memory(m).commits.get(bot(m.bots, 0).id)?.card).not.toBe(undefined); // the server's own timeout commit
  });
});

describe('the end of prep', () => {
  it('does not end early while a seat is missing, and ends the moment every seat has committed', async () => {
    const m = await onubPrep(colyseus, 4);
    expect(onubBalance.prep.endsWhenAllCommitted).toBe(true);
    for (const i of [0, 1, 2]) commit(bot(m.bots, i), 'fridge', 'pureDairy');
    await sleep(300);
    expect(phaseOf(m)).toBe(Phase.dusk);
    commit(bot(m.bots, 3), 'oven', 'oakFirewood');
    await until(() => phaseOf(m) === Phase.prepReveal);
    expect(phaseOf(m)).toBe(Phase.prepReveal);
    expect(memory(m).prepAuto.size).toBe(0);
    const left = m.room.state.phaseEndsTick - m.room.state.tick;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(onubBalance.timers.prepRevealS * 20);
  });

  it('commits a seeded station and a good card for every seat that ran out of time', async () => {
    const m = await onubPrep(colyseus, 5);
    commit(bot(m.bots, 0), 'oven', 'oakFirewood');
    await until(() => memory(m).commits.size === 1);
    runOutPrep(m);
    await until(() => phaseOf(m) === Phase.prepReveal);
    const o = memory(m);
    expect(o.commits.size).toBe(5);
    expect([...o.prepAuto].sort()).toEqual(
      m.bots
        .slice(1)
        .map((b) => b.id)
        .sort(),
    );
    for (const [id, c] of o.commits) {
      const st = onubBalance.stations.find((s) => s.id === c.station);
      expect(st?.good).toContain(c.card);
      const priv = m.room.state.players.get(id)?.priv;
      expect([priv?.onubLoc, priv?.onubCard]).toEqual([c.station, c.card]);
    }
  });

  it('makes the same timeout commits from the same prepTimeout words', async () => {
    const words = [5, 6, 7, 8] as const;
    const run = async () => {
      const m = await onubLobby(colyseus, 5);
      fixSeeds(m.room, { prepTimeout: words });
      await startOnub(m);
      await toPrep(m);
      runOutPrep(m);
      await until(() => phaseOf(m) === Phase.prepReveal);
      const out = [...memory(m).commits.values()].map((c) => `${c.station}/${c.card}`);
      await colyseus.cleanup();
      return out;
    };
    expect(await run()).toEqual(await run());
  });

  it('writes the table at night: each seat’s dealt Role and committed station, then the Pantry', async () => {
    const m = await onubPrep(colyseus, 5);
    runOutPrep(m);
    await until(() => phaseOf(m) === Phase.prepReveal);
    const o = memory(m);
    o.seats.forEach((id, i) => {
      expect(o.cards.roles.get(`seat.${i}.role`)).toBe(o.dealt.get(id));
      expect(o.cards.locs.get(`seat.${i}.loc`)).toBe(o.commits.get(id)?.station);
    });
    o.pantryRolesDealt.forEach((r, k) => expect(o.cards.roles.get(`pantry.role.${k}`)).toBe(r));
    o.pantryLocsDealt.forEach((l, k) => expect(o.cards.locs.get(`pantry.loc.${k}`)).toBe(l));
    expect(o.cards.roles.size).toBe(5 + 3);
    expect(o.cards.locs.size).toBe(5 + 3);
  });

  it('puts every pile on the public board: cards plus the thaw’s count equal the visitors', async () => {
    const m = await onubPrep(colyseus, 5);
    runOutPrep(m);
    await until(() => phaseOf(m) === Phase.prepReveal);
    await sleep(150);
    const o = memory(m);
    const visitors = (station: string) => [...o.commits.values()].filter((c) => c.station === station).length;
    for (const b of m.bots) {
      const board = (b.room.state as unknown as typeof m.room.state).onub;
      expect(board.piles.size).toBe(4);
      for (const st of onubBalance.stations) {
        const pile = board.piles.get(st.id);
        expect(pile?.cards.length).toBe(o.prep?.piles[st.id]?.cards.length);
        expect((pile?.cards.length ?? 0) + (pile?.lost ?? 0)).toBe(visitors(st.id));
      }
      expect(board.ruinWeight).toBe(o.prep?.ruinWeight);
      expect(board.ruined).toBe(o.prep?.ruined);
    }
  });

  it('ruins the Mother Dough when Team Mold plays all-in at the Oven', async () => {
    const m = await onubPrep(colyseus, 4, { roles: MOLD_ROLES, deck: MOLD_DECK });
    for (let i = 0; i < 4; i++) commit(bot(m.bots, i), 'oven', 'wetWood');
    await until(() => phaseOf(m) === Phase.prepReveal);
    expect(m.room.state.onub.ruinWeight).toBe(8);
    expect(m.room.state.onub.ruined).toBe(true);
    expect([...(m.room.state.onub.piles.get('oven')?.cards ?? [])]).toEqual(Array(4).fill('wetWood'));
  });

  it('keeps the dough sound when everyone plays good cards', async () => {
    const m = await onubPrep(colyseus, 4);
    for (let i = 0; i < 4; i++) commit(bot(m.bots, i), 'oven', 'oakFirewood');
    await until(() => phaseOf(m) === Phase.prepReveal);
    expect(m.room.state.onub.ruined).toBe(false);
    expect(m.room.state.onub.ruinWeight).toBe(0);
    expect(m.room.state.onub.perk).toBe(false);
  });

  it('never ends prep twice', async () => {
    const m = await onubPrep(colyseus, 4);
    runOutPrep(m);
    await until(() => phaseOf(m) === Phase.prepReveal);
    const piles = JSON.stringify(memory(m).prep);
    const endsAt = m.room.state.phaseEndsTick;
    endPrep(m.room);
    expect(JSON.stringify(memory(m).prep)).toBe(piles);
    expect(m.room.state.phaseEndsTick).toBe(endsAt);
  });
});

describe('the proofing perk', () => {
  const proofing = async (cards: string[], elsewhere = 'oven') => {
    const m = await onubPrep(colyseus, 4, { roles: MOLD_ROLES, deck: MOLD_DECK });
    cards.forEach((card, i) => commit(bot(m.bots, i), 'proofing', card));
    for (let i = cards.length; i < 4; i++) commit(bot(m.bots, i), elsewhere, 'oakFirewood');
    await until(() => phaseOf(m) === Phase.prepReveal);
    await sleep(150);
    return m;
  };
  const entries = (b: Bot) =>
    msgs(b, S2C.nightReveal).flatMap((p) => (p as { entries: NightRevealEntry[] }).entries);

  it('shows every proofing visitor the same Pantry Location card, and nobody else anything', async () => {
    const m = await proofing(['time', 'warmSteam']);
    expect(m.room.state.onub.perk).toBe(true);
    const o = memory(m);
    const slot = o.prep?.perk?.slot as string;
    const seen = o.pantryLocsDealt[Number(slot.split('.')[2])];
    for (const i of [0, 1]) {
      expect(entries(bot(m.bots, i))).toEqual([{ slot, kind: 'loc', value: seen, of: '' }]);
      const rows = m.room.state.players.get(bot(m.bots, i).id)?.priv.nightReveal;
      expect([...(rows ?? [])].map((r) => [r.slot, r.kind, r.value, r.of])).toEqual([
        [slot, 'loc', seen, ''],
      ]);
    }
    for (const i of [2, 3]) {
      expect(entries(bot(m.bots, i))).toEqual([]);
      expect(m.room.state.players.get(bot(m.bots, i).id)?.priv.nightReveal.length).toBe(0);
    }
  });

  it('stays dark when a sabotage card was played at the Proofing Drawer', async () => {
    const m = await proofing(['time', 'coldDraft']);
    expect(m.room.state.onub.perk).toBe(false);
    for (const b of m.bots) expect(entries(b)).toEqual([]);
  });

  it('stays dark when nobody proofed', async () => {
    const m = await proofing([]);
    expect(m.room.state.onub.perk).toBe(false);
    for (const b of m.bots) expect(entries(b)).toEqual([]);
  });
});
