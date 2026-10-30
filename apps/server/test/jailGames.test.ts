import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import {
  C2S,
  Phase,
  S2C,
  TICK_RATE,
  type CratesPublic,
  type PourPublic,
  type RefusalFrame,
  type TapPublic,
} from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { avatarMemory } from '../src/sim/Avatars';
import { bodyOf } from '../src/sim/body/state';
import { handleStrike } from '../src/sim/body/fists';
import { balanceOf } from '../src/sim/economy/purse';
import { strengthOf } from '../src/sim/JailGames';
import { isJailed, shaveSentence } from '../src/sim/law/Jail';
import { cuffSeat } from '../src/sim/law/Manhunt';
import { handlePetitionOpen, handlePetitionSign } from '../src/sim/law/Petition';
import { figuresOf } from '../src/sim/townsfolk/figures';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  start,
  toWorld,
} from './npcHelpers';

/**
 * The county jail's games (round 10, D8; GDD 3.27): the gym (Strength), the yard fight (maximum health or a little
 * purse) and scrubbing (a wage and time off the sentence), each once a day. The boards are the stations' own, answered
 * here from what the client is sent.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Four humans by day; seat 3 is cuffed and walked into the cell, beside the three props. */
async function cell(): Promise<{ party: Party; seat: string }> {
  const party = await lobbyOf(colyseus, 4);
  await send(party.humans[0]!, C2S.lobbyAddNpc);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 3600);
  party.humans.forEach((h, i) => placeSeat(party, h.id, 'overworld', 34 + i, 21));
  for (const f of figuresOf(party.room).values()) if (f.kind === 'constable') f.dead = true;
  advance(party, 1);
  const [a, b, c, d] = party.humans.map((h) => h.id) as [string, string, string, string];
  handlePetitionOpen(party.room, a, { accused: d, charge: 'robbery', entries: [] });
  for (const id of [b, c]) handlePetitionSign(party.room, id, { id: party.room.state.petition.id });
  advance(party, 1);
  cuffSeat(party.room, d);
  advance(party, S(balance.jail.walkS) + 1);
  return { party, seat: d };
}

const PROPS = {
  gym: ['cj.barbell', 9, 4],
  yard: ['cj.sparring_post', 9, 6],
  scrub: ['cj.scrub_pail', 2, 6],
} as const;

const human = (party: Party, seat: string) => party.humans.find((h) => h.id === seat)!;
const starts = (party: Party, seat: string) =>
  human(party, seat).log.filter((m) => m.type === S2C.minigameStart);
const reasons = (party: Party, seat: string): string[] =>
  human(party, seat)
    .log.filter((m) => m.type === 'error')
    .map((m) => String((m.payload as RefusalFrame).reason));

/** Stands at the game's prop and holds the interact; returns the board the client was sent, if one was. */
async function open(
  party: Party,
  seat: string,
  game: keyof typeof PROPS,
): Promise<{ kind: string; public: unknown } | null> {
  const [id, x, y] = PROPS[game];
  placeSeat(party, seat, 'cj_cell', x, y);
  advance(party, 1);
  const before = starts(party, seat).length;
  await send(human(party, seat), C2S.hold, { action: 'interact', targetId: id, on: true }, 60);
  advance(party, 1);
  await sleep(60);
  const sent = starts(party, seat);
  return sent.length > before ? (sent.at(-1)!.payload as { kind: string; public: unknown }) : null;
}

/** The answer that wins a board, read off what the client is sent. */
function solve(kind: string, pub: unknown): unknown {
  const mid = (start: number, frac: number) => start + frac / 2;
  if (kind === 'tap') {
    const s = pub as TapPublic;
    return { taps: s.bands.map((band, i) => (i + mid(band, s.bandFrac) / 2) * s.periodS) };
  }
  if (kind === 'crates') {
    const s = pub as CratesPublic;
    return { placed: s.steps, stop: mid(s.bandStart, s.bandFrac) };
  }
  const s = pub as PourPublic;
  return { holdsS: s.bands.map((band) => mid(band, s.bandFrac) / s.ratePerS) };
}

async function answer(party: Party, seat: string, game: keyof typeof PROPS, payload: unknown): Promise<void> {
  await send(human(party, seat), 'minigame.result', { taskId: PROPS[game][0], answer: payload }, 60);
  advance(party, 1);
  await sleep(60);
}

async function play(party: Party, seat: string, game: keyof typeof PROPS, secondsIn = 2): Promise<void> {
  const board = await open(party, seat, game);
  expect(board).not.toBeNull();
  advance(party, S(secondsIn));
  await answer(party, seat, game, solve(board!.kind, board!.public));
}

const nextDay = (party: Party): void => {
  party.room.state.round += 1;
};

describe('the jail games (GDD 3.27)', () => {
  it("opens each game on the stations' own board: the gym a tap, the yard crates, scrubbing a pour", async () => {
    const { party, seat } = await cell();
    expect((await open(party, seat, 'gym'))?.kind).toBe('tap');
    expect((await open(party, seat, 'yard'))?.kind).toBe('crates');
    expect((await open(party, seat, 'scrub'))?.kind).toBe('pour');
  });

  it('gives Strength for the match, once a day, and a harder fist', async () => {
    const { party, seat } = await cell();
    await play(party, seat, 'gym');
    expect(strengthOf(party.room, seat)).toBe(balance.jail.gym.damage);
    // The same day: refused, and no board is sent.
    expect(await open(party, seat, 'gym')).toBeNull();
    expect(reasons(party, seat).at(-1)).toBe('NOTHING_THERE');
    nextDay(party);
    await play(party, seat, 'gym');
    expect(strengthOf(party.room, seat)).toBe(2 * balance.jail.gym.damage);

    // Out on the square, the same fist lands two harder per gym.
    const [a, , ,] = party.humans.map((h) => h.id);
    const victim = party.humans[0]!.id === seat ? a! : a!;
    placeSeat(party, seat, 'overworld', 34, 22);
    placeSeat(party, victim, 'overworld', 35, 22);
    advance(party, 2);
    const handle = avatarMemory(party.room).handleOf.get(victim)!;
    const hp = bodyOf(party.room, victim)!.hp;
    handleStrike(party.room, seat, { targetId: handle });
    expect(hp - bodyOf(party.room, victim)!.hp).toBeCloseTo(
      balance.body.damage.strike.dmg + 2 * balance.jail.gym.damage,
      5,
    );
  });

  it('pays a won yard fight from the town and spends it for the day', async () => {
    const { party, seat } = await cell();
    const purse = balanceOf(party.room, seat);
    await play(party, seat, 'yard');
    expect(balanceOf(party.room, seat)).toBeGreaterThan(purse);
    expect(bodyOf(party.room, seat)!.maxHp).toBe(balance.body.maxHp);
    expect(await open(party, seat, 'yard')).toBeNull();
  });

  it('costs maximum health on a wrong or a slow answer, to the floor and no lower', async () => {
    const { party, seat } = await cell();
    const y = balance.jail.yard;
    await open(party, seat, 'yard');
    await answer(party, seat, 'yard', { placed: 99, stop: 5 }); // wrong
    expect(bodyOf(party.room, seat)!.maxHp).toBe(balance.body.maxHp - y.maxHpLoss);
    expect(bodyOf(party.room, seat)!.hp).toBeLessThanOrEqual(bodyOf(party.room, seat)!.maxHp);
    nextDay(party);
    await play(party, seat, 'yard', y.boardS + 2); // right, but slow
    expect(bodyOf(party.room, seat)!.maxHp).toBe(
      Math.max(y.maxHpFloor, balance.body.maxHp - 2 * y.maxHpLoss),
    );
    for (let i = 0; i < 3; i++) {
      nextDay(party);
      await play(party, seat, 'yard', y.boardS + 2);
    }
    expect(bodyOf(party.room, seat)!.maxHp).toBe(y.maxHpFloor);
  });

  it('pays scrubbing a wage and takes a tenth of a day off the sentence', async () => {
    const { party, seat } = await cell();
    const priv = party.room.state.players.get(seat)!.priv;
    const until = priv.jailUntilTick;
    const purse = balanceOf(party.room, seat);
    await play(party, seat, 'scrub');
    expect(balanceOf(party.room, seat)).toBeGreaterThan(purse);
    const off = until - priv.jailUntilTick;
    expect(off).toBeGreaterThan(0);
    expect(off).toBeLessThanOrEqual(
      Math.round(balance.jail.scrub.offDayFrac * balance.phases.dayS * TICK_RATE),
    );
    expect(isJailed(party.room, seat)).toBe(true);
  });

  it('lets a seat out when its shortened sentence runs out, with no train line', async () => {
    const { party, seat } = await cell();
    const priv = party.room.state.players.get(seat)!.priv;
    shaveSentence(party.room, seat, priv.jailUntilTick); // more than is left: one tick stays
    expect(priv.jailUntilTick).toBe(party.room.state.tick + 1);
    advance(party, 3);
    expect(isJailed(party.room, seat)).toBe(false);
    expect(priv.jailUntilTick).toBe(0);
    const lines = party.humans.flatMap((h) =>
      h.log.filter(
        (m) =>
          m.type === S2C.chatMsg && (m.payload as { text: string }).text.endsWith('steps off the train.'),
      ),
    );
    expect(lines).toHaveLength(0);
  });

  it('refuses a seat out of reach of the prop', async () => {
    const { party, seat } = await cell();
    placeSeat(party, seat, 'cj_cell', 2, 2);
    advance(party, 1);
    await send(human(party, seat), C2S.hold, { action: 'interact', targetId: PROPS.gym[0], on: true }, 60);
    advance(party, 1);
    await sleep(60);
    expect(starts(party, seat)).toHaveLength(0);
    expect(reasons(party, seat)).toContain('TOO_FAR');
  });
});
