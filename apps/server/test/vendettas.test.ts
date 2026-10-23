import { ColyseusTestServer, boot } from '@colyseus/testing';
import { roles, validateContent, vendettas } from '@wdi/content';
import { BUILD_VERSION, C2S, Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';
import { MatchSeeds, type SeedWords } from '../src/sim/seeds';
import {
  drawVendettas,
  eligibleVendettas,
  privateVendetta,
  vendettaHolders,
  vendettaOf,
} from '../src/sim/vendettas/state';
import { fixSeeds } from './seedHelpers';

// Round 7, Session 7H (GDD 3.20; docs/round7/vendettas.md 2): the four vendettas, the draw at the deal and its stream.

const WORDS: SeedWords = [0x0badf00d, 0x12345678, 0x9abcdef0, 0x0fedcba9];

/** The parts of a room the draw reads: the match's streams, the map and the seats' private cards. */
function fakeRoom(map = 'hollowmere', fixed?: Record<string, SeedWords>): PartyRoom {
  return {
    seeds: new MatchSeeds(fixed),
    state: { settings: { map }, players: new Map() },
  } as unknown as PartyRoom;
}

/** A deal of `n` seats `s0..`: `cards` first, the rest Townsfolk. */
const deal = (n: number, cards: string[]) =>
  new Map(Array.from({ length: n }, (_, i) => [`s${i}`, cards[i] ?? 'townsfolk']));

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('vendettas.json', () => {
  it('holds the four of the Bible, one per kind, each on the Killer card', () => {
    const rows = Object.values(vendettas.vendettas);
    expect(rows.map((v) => v.kind).sort()).toEqual(['contract', 'conversion', 'heist', 'sabotage']);
    for (const v of rows) {
      expect(v.role).toBe('killer');
      expect(roles.roles[v.role]?.abilities).toContain('kill');
      expect(v.emits).toContain(v.fires);
      for (const kind of v.emits) expect(kind.startsWith(`vendetta.${v.kind}.`)).toBe(true);
    }
  });

  it('is checked by the content validation', async () => {
    const content = await import('@wdi/content');
    const broken = structuredClone(content.content);
    const row = broken.vendettas.vendettas.zealot as { fires: string; role: string };
    row.fires = 'vendetta.heist.cracked';
    row.role = 'vicar';
    const errors = validateContent(broken as never).join('\n');
    expect(errors).toMatch(/vendetta zealot: vicar holds no Knife/);
    expect(errors).toMatch(/vendetta zealot: fires vendetta.heist.cracked/);
    expect(validateContent(content.content as never)).toEqual([]);
  });
});

describe('the draw', () => {
  it('offers the Zealot only with a Vicar dealt, the Bandit only where the manor is open, both only on HollowMere', () => {
    const room = fakeRoom();
    const small = (cards: string[]) => ids(eligibleVendettas(room, 'killer', [...deal(5, cards).values()]));
    expect(small(['killer', 'vicar'])).toEqual(['zealot', 'activist', 'hitman']);
    expect(small(['killer'])).toEqual(['activist', 'hitman']);
    const medium = [...deal(8, ['killer', 'vicar']).values()];
    expect(ids(eligibleVendettas(room, 'killer', medium))).toEqual([
      'zealot',
      'activist',
      'bandit',
      'hitman',
    ]);
    expect(ids(eligibleVendettas(fakeRoom('blackpine'), 'killer', medium))).toEqual(['zealot', 'activist']);
    expect(eligibleVendettas(room, 'accomplice', medium)).toEqual([]);
  });

  it('gives every Killer seat one vendetta and nobody else any', () => {
    const room = fakeRoom();
    drawVendettas(room, deal(10, ['killer', 'accomplice', 'killer', 'vicar']));
    expect([...vendettaHolders(room).keys()]).toEqual(['s0', 's2']);
    for (const seat of ['s1', 's3', 's4']) expect(vendettaOf(room, seat)).toBeNull();
    expect(vendettaOf(room, 's0')?.role).toBe('killer');
  });

  it('draws on the vendetta stream keyed by seat, so no other seat or stream moves it', () => {
    const one = fakeRoom('hollowmere', { vendetta: WORDS });
    drawVendettas(one, deal(8, ['killer']));
    const busy = fakeRoom('hollowmere', { vendetta: WORDS, deal: WORDS });
    busy.seeds.get('deal')();
    busy.seeds.get('vendetta', 's1')();
    drawVendettas(busy, deal(8, ['killer', 'townsfolk', 'killer']));
    expect(vendettaOf(busy, 's0')?.id).toBe(vendettaOf(one, 's0')?.id);
    const rng = new MatchSeeds({ vendetta: WORDS }).get('vendetta', 's0');
    const rows = eligibleVendettas(one, 'killer', [...deal(8, ['killer']).values()]);
    expect(vendettaOf(one, 's0')?.id).toBe(rows[Math.floor(rng() * rows.length)]?.id);
  });

  it('draws each eligible row about equally often', () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      const room = fakeRoom();
      drawVendettas(room, deal(8, ['killer', 'vicar']));
      const id = vendettaOf(room, 's0')?.id ?? '';
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual(['activist', 'bandit', 'hitman', 'zealot']);
    for (const n of seen.values()) expect(Math.abs(n - 750)).toBeLessThan(150);
  });

  it("shows an Accomplice its Killers' goals on its own card and a villager nothing", () => {
    const room = fakeRoom();
    drawVendettas(room, deal(10, ['killer', 'killer', 'accomplice']));
    const players = room.state.players as unknown as Map<string, unknown>;
    const card = (roleId: string, mates: string[]) => ({ priv: { role: { roleId }, cabalMates: mates } });
    players.set('s0', card('killer', ['s1', 's2']));
    players.set('s2', card('accomplice', ['s0', 's1']));
    players.set('s3', card('townsfolk', []));
    const [a, b] = [vendettaOf(room, 's0')?.id, vendettaOf(room, 's1')?.id];
    expect(privateVendetta(room, 's0')).toBe(a);
    expect(privateVendetta(room, 's2')).toBe(`${a},${b}`);
    expect(privateVendetta(room, 's3')).toBe('');
  });
});

describe('the deal of a real match', () => {
  let colyseus: ColyseusTestServer;
  beforeAll(async () => {
    colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  it('draws the Killer seat a vendetta at Start, from its own key of the vendetta stream', async () => {
    const leader = await colyseus.sdk.create('party', { name: 'Solo', build: BUILD_VERSION, deviceId: 'v' });
    await new Promise((r) => setTimeout(r, 100));
    const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
    fixSeeds(room, { deal: WORDS, npcNames: WORDS, vendetta: WORDS });
    leader.send(C2S.lobbyStart, {});
    await new Promise((r) => setTimeout(r, 300));
    expect(room.state.phase).toBe(Phase.roleReveal);
    const cards = [...room.state.players.values()].map((p) => p.priv.role.roleId);
    const killers = [...room.state.players].filter(([, p]) => p.priv.role.roleId === 'killer');
    expect([...vendettaHolders(room).keys()]).toEqual(killers.map(([id]) => id));
    for (const [seat] of killers) {
      const rows = eligibleVendettas(room, 'killer', cards);
      const rng = new MatchSeeds({ vendetta: WORDS }).get('vendetta', seat);
      expect(vendettaOf(room, seat)?.id).toBe(rows[Math.floor(rng() * rows.length)]?.id);
    }
    await leader.leave();
  });
});
