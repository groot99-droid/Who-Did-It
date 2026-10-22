import type { ColyseusTestServer } from '@colyseus/testing';
import { onubBalance } from '@wdi/content';
import { ErrorCode, type GameStateType, Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setPhase } from '../src/sim/Flow';
import { bootFlowServer } from './flowHelpers';
import {
  type NightMatch,
  type NightTable,
  TABLE5,
  act,
  clock,
  closeWindowNow,
  endFadeNow,
  errorsOf,
  msgs,
  startNightMatch,
  until,
  waitMsgs,
} from './onubNightHelpers';
import { fixSeeds } from './seedHelpers';
import { type Bot, sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootFlowServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const publicOf = (bot: Bot) => (bot.room.state as unknown as GameStateType).onub;
const seatOf = (m: NightMatch, i: number) => m.room.state.players.get((m.bots[i] as Bot).id)!;

/** Opens the night and returns once the first window is open. */
async function startNight(m: NightMatch): Promise<void> {
  await clock(m, { phase: 'night' });
  expect(await until(() => m.o.stage === 'window')).toBe(true);
}

/** Opens the window of `role` and waits for the step to apply it. */
async function openWindow(m: NightMatch, role: string): Promise<void> {
  await clock(m, { window: role });
  expect(m.o.script[m.o.windowIdx]?.role).toBe(role);
}

/** Runs the rest of the night to its end, window by window. */
async function runToDawn(m: NightMatch): Promise<void> {
  while (m.o.stage !== 'done') {
    if (m.o.stage === 'window') await closeWindowNow(m);
    else await endFadeNow(m);
  }
  await sleep(100);
}

const decks = (t: NightTable): string[] => [...t.roles, ...t.pantryRoles];
const expectedRoles = (t: NightTable): string[] =>
  onubBalance.windows.filter((w) => decks(t).includes(w.role)).map((w) => w.role);

describe('the Conductor', () => {
  it('runs every window of the deck in order, dealt or in the Pantry, and ends in dawn', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await startNight(m);
    expect(m.room.state.phase).toBe(Phase.night);
    expect(m.o.script.map((w) => w.role)).toEqual(expectedRoles(TABLE5));
    const seen: string[] = [];
    while (m.o.stage !== 'done') {
      if (m.o.stage === 'window') {
        seen.push(m.room.state.onub.window);
        await closeWindowNow(m);
        expect(m.room.state.onub.window).toBe('');
      } else await endFadeNow(m);
    }
    expect(seen).toEqual(expectedRoles(TABLE5));
    expect(m.room.state.phase).toBe(Phase.dawn);
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeGreaterThan(0);
    expect(m.room.state.onub.window).toBe('');
  });

  it('gives each window its length, jitter included, whether or not anyone is dealt the role', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    fixSeeds(m.room, { script: [1, 2, 3, 4] });
    await startNight(m);
    // Le Boulanger is not in this deck, Le Champignon is: the first window is the Spores'.
    const first = m.o.script[0]!;
    expect(first.role).toBe('champignon');
    const ticks = m.o.stageEndsTick - m.room.state.tick;
    expect(ticks).toBeLessThanOrEqual(Math.round(first.seconds * 20));
    expect(ticks).toBeGreaterThan(Math.round(first.seconds * 20) - 10);
    // The Aboyeur sits in the Pantry: its window still runs and nobody is woken.
    await clock(m, { window: 'aboyeur' });
    expect(m.o.wakers).toEqual([]);
    expect(m.o.stageEndsTick - m.room.state.tick).toBeGreaterThan(
      Math.round(onubBalance.windows.find((w) => w.role === 'aboyeur')!.seconds * 20) - 10,
    );
  });

  it(
    'draws the jitter from the script stream only: the night length is the same across 50 deals (O5)',
    { timeout: 30000 },
    async () => {
      const m = await startNightMatch(colyseus, TABLE5);
      const all = decks(TABLE5);
      const lengths = new Set<string>();
      for (let n = 0; n < 50; n++) {
        // Deal the same deck differently: rotate the roles over the seats.
        const rotated = all.map((_, i) => all[(i + n) % all.length] as string);
        m.o.seats.forEach((id, i) => m.o.dealt.set(id, rotated[i] as string));
        fixSeeds(m.room, { script: [9, 8, 7, 6] });
        setPhase(m.room, Phase.prepReveal, 3600);
        m.o.stage = 'idle';
        (m.bots[0] as Bot).room.send('debug.clock', { phase: 'night' });
        await until(() => m.room.state.phase === Phase.night);
        lengths.add(JSON.stringify(m.o.script));
      }
      expect(lengths.size).toBe(1);
    },
  );

  it('sends the narrator window to every seat in deck order, whatever was dealt (O8)', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await startNight(m);
    const heard: string[][] = m.bots.map(() => []);
    const sample = async (): Promise<void> => {
      await sleep(80);
      m.bots.forEach((b, i) => heard[i]!.push(publicOf(b).window));
    };
    await sample();
    while (m.o.stage !== 'done') {
      if (m.o.stage === 'window') await closeWindowNow(m);
      else await endFadeNow(m);
      await sample();
    }
    const roles = expectedRoles(TABLE5);
    const expected = [roles[0], '', ...roles.slice(1).flatMap((r) => [r, ''])];
    // Every seat reads the same sequence; windows alternate with '' for the fade.
    for (const h of heard) expect(h.filter((_, i) => i % 1 === 0)).toEqual(heard[0]);
    expect(heard[0]!.filter((w, i, a) => w !== a[i - 1])).toEqual(expected);
  });

  it('hands over to dawn with the Cloche public only then', async () => {
    const t: NightTable = {
      ...TABLE5,
      roles: ['boulanger', 'chef', 'sousChef', 'croissant', 'champignon'],
      pantryRoles: ['aboyeur', 'plongeur', 'inspecteur'],
    };
    const m = await startNightMatch(colyseus, t);
    await startNight(m);
    expect(m.o.script[0]!.role).toBe('boulanger');
    act(m, 0, 'onub.cloche', ['seat.1.role']);
    await until(() => m.o.cloche !== '');
    expect(m.o.cloche).toBe('seat.1.role');
    await sleep(100);
    for (const b of m.bots) expect(publicOf(b).cloche).toBe('');
    await runToDawn(m);
    expect(m.room.state.phase).toBe(Phase.dawn);
    for (const b of m.bots) expect(publicOf(b).cloche).toBe('seat.1.role');
  });
});

describe('waking', () => {
  it('wakes only the seats dealt the open role, with a view, and sends nothing to sleepers (O4)', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await startNight(m); // Le Champignon: seat 0 alone
    await waitMsgs(m.bots[0]!, 'nightWake', 1);
    const wake = msgs(m.bots[0]!, 'nightWake')[0] as {
      windowRole: string;
      endsTick: number;
      view: { alone: boolean; legal: { act: string }[]; mates: string[] };
    };
    expect(wake.windowRole).toBe('champignon');
    expect(wake.view.alone).toBe(true);
    expect(wake.view.legal.map((l) => l.act)).toEqual(['onub.sporePeek']);
    expect(wake.endsTick).toBe(m.o.stageEndsTick);
    await sleep(100);
    for (const i of [1, 2, 3, 4]) {
      expect(msgs(m.bots[i]!, 'nightWake')).toEqual([]);
      expect(msgs(m.bots[i]!, 'nightReveal')).toEqual([]);
    }
    await closeWindowNow(m);
    await waitMsgs(m.bots[0]!, 'nightSleep', 1);
    await sleep(60);
    for (const i of [1, 2, 3, 4]) expect(msgs(m.bots[i]!, 'nightSleep')).toEqual([]);
  });

  it('shows two Spores to each other and gives them no act, and a Levain the Spores', async () => {
    const t: NightTable = {
      ...TABLE5,
      roles: ['champignon', 'levain', 'champignon', 'croissant', 'critique'],
      pantryRoles: ['chef', 'aboyeur', 'plongeur'],
    };
    const m = await startNightMatch(colyseus, t);
    await startNight(m);
    await waitMsgs(m.bots[0]!, 'nightWake', 1);
    const w0 = msgs(m.bots[0]!, 'nightWake')[0] as {
      view: { mates: string[]; alone: boolean; legal: unknown[] };
    };
    expect(w0.view.mates).toEqual([m.bots[2]!.id]);
    expect(w0.view.alone).toBe(false);
    expect(w0.view.legal).toEqual([]);
    await waitMsgs(m.bots[0]!, 'nightReveal', 1);
    expect(msgs(m.bots[0]!, 'nightReveal')[0]).toEqual({
      entries: [{ slot: 'seat.2', kind: 'mate', value: 'champignon', of: m.bots[2]!.id }],
    });
    expect(seatOf(m, 0).priv!.nightReveal.length).toBe(1);
    // A sleeping Levain sees nothing until its window.
    expect(msgs(m.bots[1]!, 'nightWake')).toEqual([]);
    await openWindow(m, 'levain');
    await waitMsgs(m.bots[1]!, 'nightWake', 1);
    const w1 = msgs(m.bots[1]!, 'nightWake')[0] as { view: { seen: unknown[] } };
    expect(w1.view.seen).toEqual([
      { seat: m.bots[0]!.id, roleId: 'champignon' },
      { seat: m.bots[2]!.id, roleId: 'champignon' },
    ]);
    await waitMsgs(m.bots[1]!, 'nightReveal', 1);
    expect((msgs(m.bots[1]!, 'nightReveal')[0] as { entries: unknown[] }).entries).toHaveLength(2);
  });
});

describe('acts', () => {
  it('answers an accepted act with a reveal, writes it to Private, and leaves the cards alone for a peek', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await startNight(m);
    await openWindow(m, 'chef');
    act(m, 1, 'onub.peekRole', ['seat.2.role']);
    await waitMsgs(m.bots[1]!, 'nightReveal', 1);
    expect(msgs(m.bots[1]!, 'nightReveal').at(-1)).toEqual({
      entries: [{ slot: 'seat.2.role', kind: 'role', value: 'sousChef', of: m.bots[2]!.id }],
    });
    const row = seatOf(m, 1).priv!.nightReveal[0]!;
    expect([row.slot, row.kind, row.value, row.of]).toEqual([
      'seat.2.role',
      'role',
      'sousChef',
      m.bots[2]!.id,
    ]);
    expect(m.o.cards.roles.get('seat.2.role')).toBe('sousChef');
    expect(m.o.actLog).toEqual([
      { order: 7, roleId: 'chef', act: 'onub.peekRole', slots: ['seat.2.role'], auto: false },
    ]);
    // The wake is re-sent with nothing left to do.
    await waitMsgs(m.bots[1]!, 'nightWake', 2);
    expect((msgs(m.bots[1]!, 'nightWake').at(-1) as { view: { legal: unknown[] } }).view.legal).toEqual([]);
  });

  it('refuses 422 for a bad pick, an act of another window, a second act and an unknown id', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await startNight(m);
    await openWindow(m, 'chef');
    const bot = m.bots[1]!;
    const bad: Array<[string, string[]]> = [
      ['onub.peekRole', ['seat.1.role']], // own card
      ['onub.peekRole', ['seat.2.loc']], // wrong kind
      ['onub.peekRole', []], // wrong count
      ['onub.peekRole', ['seat.2.role', 'seat.3.role']],
      ['onub.peekPantry', ['pantry.role.0', 'pantry.role.0']], // repeat
      ['onub.peekPantry', ['pantry.role.0']],
      ['onub.rob', ['seat.2.role']], // not this window's act
      ['onub.sporePeek', ['pantry.role.0']],
      ['onub.nonsense', []],
    ];
    for (const [id, targets] of bad) act(m, 1, id, targets);
    await until(() => errorsOf(bot).length >= bad.length);
    expect(errorsOf(bot)).toEqual(bad.map(() => ErrorCode.cannot));
    expect(m.o.acted.size).toBe(0);
    act(m, 1, 'onub.peekPantry', ['pantry.role.0', 'pantry.role.2']);
    await waitMsgs(bot, 'nightReveal', 1);
    expect((msgs(bot, 'nightReveal')[0] as { entries: unknown[] }).entries).toHaveLength(2);
    act(m, 1, 'onub.peekRole', ['seat.2.role']); // already acted
    await until(() => errorsOf(bot).length > bad.length);
    expect(errorsOf(bot).at(-1)).toBe(ErrorCode.cannot);
    expect(m.o.actLog).toHaveLength(1);
  });

  it('refuses a lone-Spore act when another Spore was dealt (onlyIfAlone)', async () => {
    const t: NightTable = {
      ...TABLE5,
      roles: ['champignon', 'chef', 'champignon', 'croissant', 'critique'],
      pantryRoles: ['sousChef', 'aboyeur', 'plongeur'],
    };
    const m = await startNightMatch(colyseus, t);
    await startNight(m);
    act(m, 0, 'onub.sporePeek', ['pantry.role.0']);
    await until(() => errorsOf(m.bots[0]!).length > 0);
    expect(errorsOf(m.bots[0]!)).toEqual([ErrorCode.cannot]);
  });

  it('refuses 425 for a seat whose window is not open, whichever window is open or fading (O7)', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    const wakeFor = (i: number) => TABLE5.roles[i] as string;
    await startNight(m);
    let sent = 0;
    const blast = async (open: string): Promise<void> => {
      const before = m.bots.map((b) => errorsOf(b).length);
      const senders: number[] = [];
      m.bots.forEach((_, i) => {
        if (wakeFor(i) === open) return;
        act(m, i, 'onub.inspect');
        senders.push(i);
      });
      sent += senders.length;
      await until(() => senders.every((i) => errorsOf(m.bots[i]!).length > before[i]!));
      for (const i of senders) expect(errorsOf(m.bots[i]!).at(-1)).toBe(ErrorCode.wrongPhase);
    };
    for (const role of ['champignon', 'chef', 'sousChef']) {
      await openWindow(m, role);
      await blast(role);
    }
    // During a fade nobody may act, the previous window's waker included.
    await closeWindowNow(m);
    const before = errorsOf(m.bots[2]!).length;
    act(m, 2, 'onub.rob', ['seat.1.role']);
    await until(() => errorsOf(m.bots[2]!).length > before);
    expect(errorsOf(m.bots[2]!).at(-1)).toBe(ErrorCode.wrongPhase);
    expect(m.o.actLog).toEqual([]);
    expect(sent).toBeGreaterThan(0);
  });

  it('refuses 425 outside the night', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    act(m, 1, 'onub.peekRole', ['seat.2.role']);
    await until(() => errorsOf(m.bots[1]!).length > 0);
    expect(errorsOf(m.bots[1]!)).toEqual([ErrorCode.wrongPhase]);
  });

  it('moves cards for a swap and shows the actor only the new card', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await startNight(m);
    await openWindow(m, 'sousChef');
    act(m, 2, 'onub.rob', ['seat.1.role']);
    await waitMsgs(m.bots[2]!, 'nightReveal', 1);
    expect(m.o.cards.roles.get('seat.2.role')).toBe('chef');
    expect(m.o.cards.roles.get('seat.1.role')).toBe('sousChef');
    expect(msgs(m.bots[2]!, 'nightReveal')[0]).toEqual({
      entries: [{ slot: 'seat.2.role', kind: 'role', value: 'chef', of: m.bots[2]!.id }],
    });
    expect(m.o.actLog[0]).toMatchObject({
      act: 'onub.rob',
      slots: ['seat.2.role', 'seat.1.role'],
      auto: false,
    });
    // The dealt role is what woke it, and a later window for the swapped role wakes the DEALT owner.
    await openWindow(m, 'chef');
    expect(m.o.wakers).toEqual([m.bots[1]!.id]);
  });

  it('changes no seat`s Private role, station or card, and nothing public, whatever it does (O6)', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    const priv = () =>
      m.bots.map((_, i) => ({
        r: seatOf(m, i).priv!.role.roleId,
        l: seatOf(m, i).priv!.onubLoc,
        c: seatOf(m, i).priv!.onubCard,
      }));
    const before = priv();
    await startNight(m);
    await openWindow(m, 'sousChef');
    act(m, 2, 'onub.rob', ['seat.0.role']);
    await openWindow(m, 'plongeur');
    await until(() => m.o.actLog.length === 1);
    await runToDawn(m);
    expect(m.o.cards.roles.get('seat.2.role')).toBe('champignon');
    expect(priv()).toEqual(before);
  });

  it('lets the Inspecteur read both own cards', async () => {
    const t: NightTable = {
      ...TABLE5,
      roles: ['inspecteur', 'chef', 'sousChef', 'croissant', 'champignon'],
      pantryRoles: ['aboyeur', 'plongeur', 'critique'],
    };
    const m = await startNightMatch(colyseus, t);
    await startNight(m);
    await openWindow(m, 'inspecteur');
    act(m, 0, 'onub.inspect');
    await waitMsgs(m.bots[0]!, 'nightReveal', 1);
    expect((msgs(m.bots[0]!, 'nightReveal')[0] as { entries: unknown[] }).entries).toEqual([
      { slot: 'seat.0.role', kind: 'role', value: 'inspecteur', of: m.bots[0]!.id },
      { slot: 'seat.0.loc', kind: 'loc', value: 'fridge', of: m.bots[0]!.id },
    ]);
    expect(m.o.actLog[0]).toMatchObject({ slots: ['seat.0.role', 'seat.0.loc'] });
  });
});

describe('must-acts and the Tourrier', () => {
  const T: NightTable = {
    roles: ['tourrier', 'gardeManger', 'chef', 'croissant', 'champignon'],
    locs: ['fridge', 'mixer', 'oven', 'proofing', 'fridge'],
    pantryRoles: ['aboyeur', 'sousChef', 'inspecteur'],
    pantryLocs: ['oven', 'oven', 'mixer'],
  };

  it('takes the Tourrier in two steps, the second naming the seat that takes the Pantry card', async () => {
    const m = await startNightMatch(colyseus, T);
    await startNight(m);
    await openWindow(m, 'tourrier');
    act(m, 0, 'onub.laminateSwap', ['seat.2.role']); // no peek yet
    await until(() => errorsOf(m.bots[0]!).length > 0);
    expect(errorsOf(m.bots[0]!)).toEqual([ErrorCode.cannot]);
    act(m, 0, 'onub.laminatePeek', ['pantry.role.1']);
    await waitMsgs(m.bots[0]!, 'nightWake', 2);
    const second = msgs(m.bots[0]!, 'nightWake').at(-1) as {
      view: { legal: { act: string; slots: string[] }[] };
    };
    expect(second.view.legal.map((l) => l.act)).toEqual(['onub.laminateSwap']);
    expect(second.view.legal[0]!.slots).toContain('seat.0.role');
    await waitMsgs(m.bots[0]!, 'nightReveal', 1);
    expect(msgs(m.bots[0]!, 'nightReveal')[0]).toEqual({
      entries: [{ slot: 'pantry.role.1', kind: 'role', value: 'sousChef', of: '' }],
    });
    act(m, 0, 'onub.laminatePeek', ['pantry.role.2']); // a second peek is not allowed
    act(m, 0, 'onub.laminateSwap', ['seat.2.role']);
    await until(() => m.o.acted.has(m.bots[0]!.id));
    expect(m.o.cards.roles.get('seat.2.role')).toBe('sousChef');
    expect(m.o.cards.roles.get('pantry.role.1')).toBe('chef');
    expect(m.o.actLog.map((e) => [e.act, e.auto])).toEqual([
      ['onub.laminatePeek', false],
      ['onub.laminateSwap', false],
    ]);
    // The second refusal is a message, which may land after the swap the test waited for.
    await until(() => errorsOf(m.bots[0]!).length >= 2);
    expect(errorsOf(m.bots[0]!)).toEqual([ErrorCode.cannot, ErrorCode.cannot]);
  });

  it('completes a must-act left undone by seed, flags it auto and writes the reveal', async () => {
    const m = await startNightMatch(colyseus, T);
    await startNight(m);
    await openWindow(m, 'tourrier');
    await closeWindowNow(m); // the Tourrier did nothing
    await waitMsgs(m.bots[0]!, 'nightSleep', 1);
    expect(m.o.actLog.map((e) => [e.act, e.auto])).toEqual([
      ['onub.laminatePeek', true],
      ['onub.laminateSwap', true],
    ]);
    const peeked = m.o.actLog[0]!.slots[0]!;
    expect(peeked.startsWith('pantry.role.')).toBe(true);
    expect(m.o.actLog[1]!.slots[0]).toBe(peeked);
    await waitMsgs(m.bots[0]!, 'nightReveal', 2);
    expect(msgs(m.bots[0]!, 'nightReveal').length).toBe(2);
    expect(seatOf(m, 0).priv!.nightReveal.length).toBe(1); // the peek; the swap shows nothing
    // Roles stay a permutation of the deal.
    expect([...m.o.cards.roles.values()].sort()).toEqual([...T.roles, ...T.pantryRoles].sort());
  });

  it('finishes the Tourrier`s swap by seed when the window ends after the peek', async () => {
    const m = await startNightMatch(colyseus, T);
    await startNight(m);
    await openWindow(m, 'tourrier');
    act(m, 0, 'onub.laminatePeek', ['pantry.role.0']);
    await until(() => m.o.peeked.size === 1);
    await closeWindowNow(m);
    expect(m.o.actLog.map((e) => [e.act, e.auto])).toEqual([
      ['onub.laminatePeek', false],
      ['onub.laminateSwap', true],
    ]);
    expect(m.o.actLog[1]!.slots[0]).toBe('pantry.role.0');
  });

  it('makes the Garde Manger swap with a Pantry Role card by seed, unseen', async () => {
    const m = await startNightMatch(colyseus, T);
    await startNight(m);
    await openWindow(m, 'gardeManger');
    await closeWindowNow(m);
    expect(m.o.actLog).toHaveLength(1);
    expect(m.o.actLog[0]).toMatchObject({ act: 'onub.drunk', auto: true, roleId: 'gardeManger' });
    expect(m.o.cards.roles.get('seat.1.role')).not.toBe('gardeManger');
    // The window closes on the server; its empty reveal is a message, which may still be on its way.
    await until(() => JSON.stringify(msgs(m.bots[1]!, 'nightReveal').at(-1)) === '{"entries":[]}');
    expect(msgs(m.bots[1]!, 'nightReveal').at(-1)).toEqual({ entries: [] });
    expect(seatOf(m, 1).priv!.nightReveal.length).toBe(0);
  });

  it('draws timeouts from the nightTimeout stream, reproducibly', async () => {
    const picks: string[] = [];
    for (let n = 0; n < 2; n++) {
      const m = await startNightMatch(colyseus, T);
      fixSeeds(m.room, { nightTimeout: [5, 6, 7, 8] });
      await startNight(m);
      await openWindow(m, 'gardeManger');
      await closeWindowNow(m);
      picks.push(m.o.actLog[0]!.slots[1]!);
      await colyseus.cleanup();
    }
    expect(picks[0]).toBe(picks[1]);
  });

  it('skips the Garde Manger`s must-act when its own Role card is under the Cloche', async () => {
    const t: NightTable = { ...T, roles: ['boulanger', 'gardeManger', 'chef', 'croissant', 'champignon'] };
    const m = await startNightMatch(colyseus, t);
    await startNight(m);
    act(m, 0, 'onub.cloche', ['seat.1.role']);
    await until(() => m.o.cloche === 'seat.1.role');
    await openWindow(m, 'gardeManger');
    await waitMsgs(m.bots[1]!, 'nightWake', 1);
    const view = (
      msgs(m.bots[1]!, 'nightWake').at(-1) as { view: { legal: unknown[]; cloche: string; must: boolean } }
    ).view;
    expect(view.cloche).toBe('seat.1.role');
    expect(view.legal).toEqual([]);
    expect(view.must).toBe(true);
    act(m, 1, 'onub.drunk', ['pantry.role.0']);
    await until(() => errorsOf(m.bots[1]!).length > 0);
    expect(errorsOf(m.bots[1]!)).toEqual([ErrorCode.cannot]);
    await closeWindowNow(m);
    expect(m.o.actLog.map((e) => e.act)).toEqual(['onub.cloche']);
    expect(m.o.cards.roles.get('seat.1.role')).toBe('gardeManger');
  });
});

describe('the Iron Cloche', () => {
  const T: NightTable = {
    roles: ['boulanger', 'chef', 'sousChef', 'inspecteur', 'champignon'],
    locs: ['fridge', 'mixer', 'oven', 'proofing', 'fridge'],
    pantryRoles: ['aboyeur', 'plongeur', 'croissant'],
    pantryLocs: ['oven', 'oven', 'mixer'],
  };

  it('lets the Boulanger cover any card, their own included, and only one', async () => {
    const m = await startNightMatch(colyseus, T);
    await startNight(m);
    act(m, 0, 'onub.cloche', ['pantry.role.0']); // never a Pantry card
    act(m, 0, 'onub.cloche', ['seat.0.loc']);
    await until(() => m.o.cloche !== '');
    expect(m.o.cloche).toBe('seat.0.loc');
    await until(() => errorsOf(m.bots[0]!).length >= 1);
    expect(errorsOf(m.bots[0]!)).toEqual([ErrorCode.cannot]);
    act(m, 0, 'onub.cloche', ['seat.2.loc']);
    await until(() => errorsOf(m.bots[0]!).length > 1);
    expect(errorsOf(m.bots[0]!)).toEqual([ErrorCode.cannot, ErrorCode.cannot]);
    expect(m.o.cloche).toBe('seat.0.loc');
    await waitMsgs(m.bots[0]!, 'nightReveal', 1);
    expect(msgs(m.bots[0]!, 'nightReveal')).toEqual([{ entries: [] }]);
  });

  it('blocks peeks and swaps of the covered card and shows later wakers where it lies', async () => {
    const m = await startNightMatch(colyseus, T);
    await startNight(m);
    act(m, 0, 'onub.cloche', ['seat.1.role']);
    await until(() => m.o.cloche !== '');
    await openWindow(m, 'chef');
    await waitMsgs(m.bots[1]!, 'nightWake', 1);
    const view = (
      msgs(m.bots[1]!, 'nightWake').at(-1) as {
        view: { cloche: string; legal: { act: string; slots: string[] }[] };
      }
    ).view;
    expect(view.cloche).toBe('seat.1.role');
    act(m, 1, 'onub.peekRole', ['seat.1.role']);
    await openWindow(m, 'sousChef');
    act(m, 2, 'onub.rob', ['seat.1.role']);
    await until(() => errorsOf(m.bots[2]!).length > 0);
    expect(errorsOf(m.bots[2]!)).toEqual([ErrorCode.cannot]);
    // The Sous-Chef may still take another card; the Inspecteur still reads their own covered card.
    await openWindow(m, 'inspecteur');
    act(m, 3, 'onub.inspect');
    await waitMsgs(m.bots[3]!, 'nightReveal', 1);
    expect(m.o.cards.roles.get('seat.1.role')).toBe('chef');
  });

  it('refuses a swap of the actor`s own covered card (the Sous-Chef`s)', async () => {
    const m = await startNightMatch(colyseus, T);
    await startNight(m);
    act(m, 0, 'onub.cloche', ['seat.2.role']);
    await until(() => m.o.cloche !== '');
    await openWindow(m, 'sousChef');
    act(m, 2, 'onub.rob', ['seat.1.role']);
    await until(() => errorsOf(m.bots[2]!).length > 0);
    expect(errorsOf(m.bots[2]!)).toEqual([ErrorCode.cannot]);
    expect(m.o.cards.roles.get('seat.2.role')).toBe('sousChef');
  });
});

describe('the night looks the same to a sleeper (O4)', () => {
  const strip = (e: { type: string; payload: unknown }) =>
    e.type === 'phaseChange' ? { type: e.type, phase: (e.payload as { phase: number }).phase } : e;

  async function sleeperLog(everyoneActs: boolean): Promise<unknown[]> {
    const m = await startNightMatch(colyseus, TABLE5);
    fixSeeds(m.room, { script: [3, 3, 3, 3] });
    await startNight(m);
    const states: unknown[] = [];
    const sample = async () => {
      await sleep(80);
      states.push({ window: publicOf(m.bots[4]!).window, cloche: publicOf(m.bots[4]!).cloche });
    };
    while (m.o.stage !== 'done') {
      if (m.o.stage === 'window') {
        if (everyoneActs) {
          const role = m.o.script[m.o.windowIdx]!.role;
          if (role === 'chef') act(m, 1, 'onub.peekRole', ['seat.2.role']);
          if (role === 'sousChef') act(m, 2, 'onub.rob', ['seat.1.role']);
          if (role === 'champignon') act(m, 0, 'onub.sporePeek', ['pantry.role.0']);
          await sleep(60);
        }
        await closeWindowNow(m);
      } else await endFadeNow(m);
      await sample();
    }
    const log = m.bots[4]!.events.filter((e) => e.type !== 'error').map(strip);
    await colyseus.cleanup();
    return [states, log];
  }

  it('shows a sleeper identical state and messages whether every waker acts or none does', async () => {
    const quiet = await sleeperLog(false);
    const busy = await sleeperLog(true);
    expect(busy).toEqual(quiet);
  });
});

describe('debug.clock in the quick mode', () => {
  it('starts the night from prepReveal and refuses it elsewhere', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await clock(m, { phase: 'dawn' }); // from prepReveal: runs the whole night
    expect(m.room.state.phase).toBe(Phase.dawn);
    await clock(m, { phase: 'night' }); // from dawn: wrong phase
    await until(() => errorsOf(m.bots[0]!).length >= 1);
    expect(errorsOf(m.bots[0]!)).toEqual([ErrorCode.wrongPhase]);
    expect(m.room.state.phase).toBe(Phase.dawn);
  });

  it('runs every remaining step at once to dawn, must-acts by seed and no other act', async () => {
    const T: NightTable = {
      roles: ['boulanger', 'gardeManger', 'chef', 'tourrier', 'champignon'],
      locs: TABLE5.locs,
      pantryRoles: ['aboyeur', 'sousChef', 'inspecteur'],
      pantryLocs: TABLE5.pantryLocs,
    };
    const m = await startNightMatch(colyseus, T);
    await clock(m, { phase: 'dawn' });
    expect(m.room.state.phase).toBe(Phase.dawn);
    expect(m.o.actLog.map((e) => [e.act, e.auto])).toEqual([
      ['onub.laminatePeek', true],
      ['onub.laminateSwap', true],
      ['onub.drunk', true],
    ]);
    expect(m.room.state.onub.window).toBe('');
  });

  it('closes the open window and opens another with {window}', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await startNight(m);
    await clock(m, { window: 'sousChef' });
    expect(m.room.state.onub.window).toBe('sousChef');
    await clock(m, { window: 'chef' });
    expect(m.room.state.onub.window).toBe('chef');
    expect(m.o.wakers).toEqual([m.bots[1]!.id]);
    await clock(m, { window: 'tourrier' }); // not in this deck
    await until(() => errorsOf(m.bots[0]!).length >= 1);
    expect(errorsOf(m.bots[0]!)).toEqual([ErrorCode.cannot]);
    await clock(m, { bogus: true }); // no window and no phase: refused as 'not now'
    await until(() => errorsOf(m.bots[0]!).length >= 2);
    expect(errorsOf(m.bots[0]!)).toEqual([ErrorCode.cannot, ErrorCode.wrongPhase]);
  });

  it('refuses {window} outside the night with 425', async () => {
    const m = await startNightMatch(colyseus, TABLE5);
    await clock(m, { window: 'chef' });
    await until(() => errorsOf(m.bots[0]!).length >= 1);
    expect(errorsOf(m.bots[0]!)).toEqual([ErrorCode.wrongPhase]);
  });
});
