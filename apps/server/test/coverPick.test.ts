import { ColyseusTestServer, boot } from '@colyseus/testing';
import { deckFor, looks, roles } from '@wdi/content';
import {
  BUILD_VERSION,
  C2S,
  ErrorCode,
  Phase,
  S2C,
  coverHints,
  dealDeck,
  mulberry32,
  type GameStateType,
  type PlayerState,
  type RoleRevealPayload,
} from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';
import { flowOf } from '../src/sim/Flow';
import { MatchSeeds } from '../src/sim/seeds';
import { fixSeeds } from './seedHelpers';

// Stand-in for 5G's `dealMainDeck` until its PR merges (deck-wire.md 4.4): the same call, `dealDeck` on the `deal`
// stream with every Killer card always dealt, `flow.deck` and `flow.undealt` kept for 5F's `assignCovers`.
vi.mock('../src/sim/Deck', async () => {
  const content = await import('@wdi/content');
  const shared = await import('@wdi/shared');
  const flow = await import('../src/sim/Flow');
  return {
    dealMainDeck: (room: PartyRoom, ids: readonly string[]) => {
      const cards = content.deckFor(ids.length).cards;
      const kills = (card: string) => content.roles.roles[card]?.abilities.includes('kill') === true;
      const deal = shared.dealDeck(ids, cards, kills, room.seeds.get('deal'));
      const f = flow.flowOf(room);
      f.deck = [...cards];
      f.undealt = deal.undealt;
      return deal.dealt;
    },
  };
});

vi.setConfig({ testTimeout: 60_000 });

const opts = (name: string) => ({ name, build: BUILD_VERSION, deviceId: `dev-${name}` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

type Room = Awaited<ReturnType<ColyseusTestServer['sdk']['create']>>;
interface Bot {
  room: Room;
  log: { type: string; payload: unknown }[];
}
const stateOf = (bot: Bot) => bot.room.state as unknown as GameStateType;
const received = <T>(bot: Bot, type: string) =>
  bot.log.filter((m) => m.type === type).map((m) => m.payload as T);

async function party(
  count: number,
  before?: (room: PartyRoom) => void,
): Promise<{ bots: Bot[]; room: PartyRoom }> {
  const connect = async (join: () => Promise<Room>): Promise<Bot> => {
    const room = await join();
    const bot: Bot = { room, log: [] };
    room.onMessage('*', (type: string | number, payload: unknown) =>
      bot.log.push({ type: String(type), payload }),
    );
    return bot;
  };
  const leader = await connect(() => colyseus.sdk.create('party', opts('Bot0')));
  const bots = [leader];
  for (let i = 1; i < count; i++)
    bots.push(await connect(() => colyseus.sdk.joinById(leader.room.roomId, opts(`Bot${i}`))));
  await sleep(100);
  const room = colyseus.getRoomById(leader.room.roomId) as unknown as PartyRoom;
  before?.(room);
  return { bots, room };
}

/** A party of `count` humans that Started and holds the role card. */
async function onCard(count: number, before?: (room: PartyRoom) => void) {
  const p = await party(count, before);
  p.bots[0]?.room.send(C2S.lobbyStart, {});
  await sleep(350);
  expect(p.room.state.phase).toBe(Phase.roleReveal);
  return p;
}

/** Seed words whose `deal` stream leaves the cards `pred` accepts undealt, so a test can rely on who is dealt. */
function dealWords(n: number, pred: (undealt: string[]) => boolean): [number, number, number, number] {
  const ids = Array.from({ length: n }, (_, i) => `s${i}`);
  const kills = (card: string) => roles.roles[card]?.abilities.includes('kill') === true;
  for (let k = 1; k < 10_000; k++) {
    const words: [number, number, number, number] = [k, 2, 3, 4];
    const { undealt } = dealDeck(ids, deckFor(n).cards, kills, new MatchSeeds({ deal: words }).get('deal'));
    if (pred(undealt)) return words;
  }
  throw new Error('no seed words');
}

const idOf = (bot: Bot): string => bot.room.sessionId;
const roleOf = (p: { room: PartyRoom }, bot: Bot): string =>
  p.room.state.players.get(idOf(bot))?.priv.role.roleId ?? '';
const isCover = (card: string): boolean => roles.roles[card]?.cover === true;
const lookIdOf = (card: string): string => roles.roles[card]?.look ?? '';
const cardOf = (bot: Bot) => received<RoleRevealPayload>(bot, S2C.roleReveal)[0] as RoleRevealPayload;

/** Ends the card on the next tick, white-box. */
async function closeCard(room: PartyRoom): Promise<void> {
  room.state.phaseEndsTick = room.state.tick;
  await sleep(300);
}

describe('the deal and the hints (P13)', () => {
  it('property: 200 deals at every count: Killers dealt, n cards dealt, 2 undealt, hints valid', () => {
    const isKill = (card: string) => roles.roles[card]?.abilities.includes('kill') === true;
    const isCabal = (card: string) => roles.roles[card]?.faction === 'cabal';
    for (let n = 4; n <= 10; n++) {
      const cards = deckFor(n).cards;
      const ids = Array.from({ length: n }, (_, i) => `s${i}`);
      for (let seed = 1; seed <= 200; seed++) {
        const { dealt, undealt } = dealDeck(ids, cards, isKill, mulberry32(seed * 7919 + n));
        const held = [...dealt.values()];
        expect(held).toHaveLength(n);
        expect(undealt).toHaveLength(2);
        expect([...held, ...undealt].sort()).toEqual([...cards].sort());
        expect(held.filter(isKill)).toHaveLength(cards.filter(isKill).length);

        const hints = coverHints(dealt, undealt, cards, isCover, isCabal);
        const coverSeats = ids.filter((id) => isCover(dealt.get(id) as string));
        expect([...hints.keys()].sort()).toEqual([...coverSeats].sort());
        const firsts = [...hints.values()].map((list) => list[0]);
        expect(new Set(firsts).size).toBe(firsts.length);
        for (const [seat, list] of hints) {
          expect(list.length).toBeGreaterThan(0);
          expect(new Set(list).size).toBe(list.length);
          for (const card of list) {
            expect(undealt).toContain(card);
            expect(isCover(card)).toBe(false);
          }
          if (!isCabal(dealt.get(seat) as string)) expect(list).toHaveLength(1);
        }
        // Cabal mates share one list with different first hints; no Drifter hint is in a Cabal list.
        const cabal = coverSeats.filter((id) => isCabal(dealt.get(id) as string));
        const drifter = coverSeats.filter((id) => !isCabal(dealt.get(id) as string));
        for (const a of cabal) {
          for (const b of cabal)
            expect([...(hints.get(a) as string[])].sort()).toEqual([...(hints.get(b) as string[])].sort());
          for (const d of drifter) expect(hints.get(a)).not.toContain(hints.get(d)?.[0]);
        }
        if (coverSeats.length === 1 && n === 4) expect(hints.get(coverSeats[0] as string)).toHaveLength(2);
      }
    }
  });

  it('roleReveal: the deck is identical for all seats, the hints go to cover seats only, look and portrait match', async () => {
    const { bots, room } = await onCard(6);
    const deck = deckFor(6).cards;
    let covers = 0;
    for (const bot of bots) {
      const card = cardOf(bot);
      expect(card.deck).toEqual(deck);
      const role = roleOf({ room }, bot);
      expect(card.portrait).toBe(looks.looks[lookIdOf(role)]?.portrait);
      if (isCover(role)) {
        covers++;
        expect(card.coverHints?.length).toBeGreaterThan(0);
        for (const hint of card.coverHints ?? []) {
          expect(flowOf(room).undealt).toContain(hint);
          expect(isCover(hint)).toBe(false);
        }
        expect(card.look).toBe(lookIdOf(card.coverHints?.[0] as string));
      } else {
        expect(card.coverHints).toBeUndefined();
        expect(card.look).toBe(lookIdOf(role));
        expect(deck).toContain(role);
      }
    }
    expect(covers).toBeGreaterThanOrEqual(1);
  });
});

describe('Ready and the public look (P7)', () => {
  it('a non-Cabal client sees no look and no Ready while others press Ready and pick; the looks arrive in one patch', async () => {
    const { bots, room } = await onCard(6);
    const observer = bots.find((b) => roles.roles[roleOf({ room }, b)]?.faction !== 'cabal') as Bot;
    const litLooks: number[] = [];
    observer.room.onStateChange(() => {
      let lit = 0;
      stateOf(observer).players.forEach((p: PlayerState) => {
        if (p.look !== '') lit++;
        expect(p.ready).toBe(false);
      });
      litLooks.push(lit);
    });
    // A cover role picks and everyone else presses Ready, in both ways.
    for (const bot of bots) {
      if (bot === observer) continue;
      const card = cardOf(bot);
      if (card.coverHints)
        bot.room.send(C2S.coverPick, { lookId: lookIdOf(card.deck?.find((c) => !isCover(c)) as string) });
      bot.room.send(C2S.lobbyReady, { ready: true });
    }
    await sleep(500);
    expect(room.state.phase).toBe(Phase.roleReveal);
    stateOf(observer).players.forEach((p: PlayerState) => {
      expect(p.look).toBe('');
      expect(p.ready).toBe(false);
    });
    observer.room.send(C2S.roleReady, {});
    await sleep(600);
    expect(room.state.phase).toBe(Phase.grace);
    const seats = stateOf(observer).players.size;
    stateOf(observer).players.forEach((p: PlayerState) => expect(p.look).not.toBe(''));
    // No patch showed some looks and not others.
    expect(new Set(litLooks.filter((n) => n > 0))).toEqual(new Set([seats]));
    for (const bot of bots) {
      stateOf(observer).players.forEach((p: PlayerState) => expect(p.ready).toBe(false));
      expect(bot).toBeDefined();
    }
  });

  it('with no pick the cover seat wears its first hint', async () => {
    const { bots, room } = await onCard(5);
    await closeCard(room);
    for (const bot of bots) {
      const card = cardOf(bot);
      const seat = room.state.players.get(idOf(bot)) as PlayerState;
      if (card.coverHints) expect(seat.look).toBe(lookIdOf(card.coverHints[0] as string));
      else expect(seat.look).toBe(lookIdOf(roleOf({ room }, bot)));
    }
  });

  it('an NPC cover seat never picks and wears its first hint', async () => {
    const { bots, room } = await party(1);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(350);
    await closeCard(room);
    let covers = 0;
    room.state.players.forEach((p: PlayerState) => {
      if (!isCover(p.priv.role.roleId)) return;
      covers++;
      expect(p.look).not.toBe('');
      expect(isCover(p.look)).toBe(false);
    });
    expect(covers).toBeGreaterThanOrEqual(1);
  });

  it('in the quick mode every ready stays false through the card too', async () => {
    const { bots, room } = await party(5);
    bots[0]?.room.send(C2S.lobbySettings, { mode: 1 });
    await sleep(150);
    bots[0]?.room.send(C2S.lobbyStart, {});
    await sleep(350);
    if (room.state.phase !== Phase.roleReveal) return; // the quick-mode Start is 5A's; nothing to check without it
    for (const bot of bots) bot.room.send(C2S.lobbyReady, { ready: true });
    await sleep(100);
    stateOf(bots[0] as Bot).players.forEach((p: PlayerState) => expect(p.ready).toBe(false));
    for (const bot of bots) expect(cardOf(bot).deck).toBeUndefined();
    for (const bot of bots) expect(cardOf(bot).look).toBeUndefined();
    for (const bot of bots) expect(cardOf(bot).coverHints).toBeUndefined();
  });
});

describe('role.cover refusals and mates (P14)', () => {
  const codes = (bot: Bot) => received<{ code: number }>(bot, S2C.error).map((e) => e.code);

  it('425 outside the card, 422 for a non-cover seat, a cover look or a look outside the deck', async () => {
    const { bots, room } = await onCard(7);
    const cover = bots.find((b) => isCover(roleOf({ room }, b))) as Bot;
    const plain = bots.find((b) => !isCover(roleOf({ room }, b))) as Bot;
    const deck = cardOf(cover).deck as string[];
    const free = lookIdOf(deck.find((c) => !isCover(c) && !flowOf(room).undealt.includes(c)) as string);
    plain.room.send(C2S.coverPick, { lookId: free });
    cover.room.send(C2S.coverPick, { lookId: 'killer' });
    cover.room.send(C2S.coverPick, { lookId: 'nobody' });
    cover.room.send(C2S.coverPick, { lookId: 7 });
    cover.room.send(C2S.coverPick, {});
    await sleep(300);
    expect(codes(plain)).toEqual([ErrorCode.cannot]);
    expect(codes(cover)).toEqual(Array(4).fill(ErrorCode.cannot));
    expect(room.state.players.get(idOf(cover))?.priv.coverLook).toBe(
      lookIdOf(cardOf(cover).coverHints?.[0] as string),
    );
    await closeCard(room);
    const before = codes(cover).length;
    cover.room.send(C2S.coverPick, { lookId: free });
    await sleep(200);
    expect(codes(cover).slice(before)).toEqual([ErrorCode.wrongPhase]);
  });

  it('refuses a look a Cabal mate wears; accepts a Drifter/Killer pick equal to the other; updates only mates', async () => {
    const words = dealWords(7, (undealt) => !undealt.includes('accomplice'));
    const { bots, room } = await onCard(7, (r) => fixSeeds(r, { deal: words }));
    const killer = bots.find((b) => roleOf({ room }, b) === 'killer') as Bot;
    const mate = bots.find((b) => roleOf({ room }, b) === 'accomplice') as Bot;
    const deck = cardOf(killer).deck as string[];
    const looksOf = deck.filter((c) => !isCover(c)).map(lookIdOf);
    const pick = looksOf[0] as string;
    killer.room.send(C2S.coverPick, { lookId: pick });
    await sleep(200);
    const priv = (b: Bot) => room.state.players.get(idOf(b))?.priv;
    expect(priv(killer)?.coverLook).toBe(pick);
    expect(priv(mate)?.mateLooks.get(idOf(killer))).toBe(pick);
    const refusals = codes(mate).length;
    mate.room.send(C2S.coverPick, { lookId: pick });
    await sleep(200);
    expect(codes(mate).slice(refusals)).toEqual([ErrorCode.cannot]);
    expect(priv(mate)?.coverLook).not.toBe(pick);
    // The non-Cabal seats' mateLooks stay empty and their coverLook ''.
    for (const b of bots) {
      if (isCover(roleOf({ room }, b))) continue;
      expect(priv(b)?.mateLooks.size).toBe(0);
      expect(priv(b)?.coverLook).toBe('');
    }
  });

  it('a Drifter may pick the Killer look and a Killer the Drifter look; neither learns from a refusal', async () => {
    const words = dealWords(5, (undealt) => !undealt.includes('drifter'));
    const { bots, room } = await onCard(5, (r) => fixSeeds(r, { deal: words }));
    const killer = bots.find((b) => roleOf({ room }, b) === 'killer') as Bot;
    const drifter = bots.find((b) => roleOf({ room }, b) === 'drifter') as Bot;
    const priv = (b: Bot) => room.state.players.get(idOf(b))?.priv;
    const k = priv(killer)?.coverLook as string;
    drifter.room.send(C2S.coverPick, { lookId: k });
    await sleep(200);
    expect(priv(drifter)?.coverLook).toBe(k);
    expect(priv(drifter)?.mateLooks.size).toBe(0);
    expect(priv(killer)?.mateLooks.size).toBe(0);
    const d = priv(drifter)?.coverLook as string;
    killer.room.send(C2S.coverPick, { lookId: d });
    await sleep(200);
    expect(priv(killer)?.coverLook).toBe(d);
    expect(codes(drifter)).toEqual([]);
    expect(codes(killer)).toEqual([]);
  });
});

describe('P8: a cover seat is indistinguishable from a non-cover seat (fuzz, 50 matches)', () => {
  it('has the same fields and types for a non-Cabal observer, and distinct looks when nobody duplicates', async () => {
    for (let game = 0; game < 50; game++) {
      const n = 4 + (game % 7);
      const { bots, room } = await onCard(n);
      await closeCard(room);
      const observer = bots.find((b) => roles.roles[roleOf({ room }, b)]?.faction !== 'cabal') as Bot;
      const rows = new Map<string, Record<string, unknown>>();
      stateOf(observer).players.forEach((p: PlayerState, id: string) => {
        if (id !== idOf(observer))
          rows.set(id, JSON.parse(JSON.stringify(p.toJSON())) as Record<string, unknown>);
      });
      const shape = (row: Record<string, unknown>) =>
        Object.entries(row)
          .filter(([k]) => k !== 'priv' && k !== 'presence')
          .map(([k, v]) => `${k}:${typeof v}`)
          .sort()
          .join(',');
      const plainLooks = deckFor(n)
        .cards.filter((c) => !isCover(c))
        .map(lookIdOf);
      const shapes = new Set<string>();
      const seenLooks: string[] = [];
      for (const row of rows.values()) {
        shapes.add(shape(row));
        const look = (row.look as string) ?? '';
        expect(look).not.toBe('');
        expect(plainLooks).toContain(look);
        seenLooks.push(look);
      }
      expect(shapes.size).toBe(1);
      const own = room.state.players.get(idOf(observer))?.look as string;
      expect(new Set([...seenLooks, own]).size).toBe(n);
      await colyseus.cleanup();
    }
  }, 180_000);
});

describe('P16: the deal draws from its own stream', () => {
  it('the same deal words reproduce the deck and the hints whatever the other streams draw', async () => {
    const run = async () => {
      const { bots, room } = await party(6, (r) => fixSeeds(r, { deal: [5, 6, 7, 8] }));
      bots[0]?.room.send(C2S.lobbyStart, {});
      await sleep(350);
      const dealt = [...room.state.players.entries()].map(([id, p]) => [id, p.priv.role.roleId]);
      const out = {
        roles: dealt.map(([, role]) => role),
        undealt: flowOf(room).undealt,
        looks: [...room.state.players.values()].map((p) => p.priv.coverLook),
      };
      await colyseus.cleanup();
      return out;
    };
    const a = await run();
    const b = await run();
    expect(b.undealt).toEqual(a.undealt);
    // Traits, NPC names and handles come from crypto streams of their own: the hands match seat for seat.
    expect(b.roles).toEqual(a.roles);
    expect(b.looks).toEqual(a.looks);
  });
});
