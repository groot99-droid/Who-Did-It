import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, roles, scenes, validateContent, vendettas } from '@wdi/content';
import { BUILD_VERSION, C2S, NoteKind, Phase, TICK_RATE, TaskEntry } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { MatchSeeds, type SeedWords } from '../src/sim/seeds';
import {
  drawVendettas,
  eligibleVendettas,
  privateVendetta,
  vendettaHolders,
  vendettaOf,
} from '../src/sim/vendettas/state';
import { fixSeeds } from './seedHelpers';
import { sceneKey } from '../src/sim/World';
import { matchEvents } from '../src/sim/auto/log';
import { countsVote } from '../src/sim/vendettas/conversion';
import { vendettaGoalFor } from '../src/sim/vendettas/goal';
import { progressOf, vendettaSteps } from '../src/sim/vendettas/progress';
import { holdVendetta } from '../src/sim/vendettas/state';
import {
  bootFlowServer,
  events,
  idOf,
  murder,
  openMeeting,
  seat,
  sim,
  skipPhase,
  until,
  voteAll,
} from './flowHelpers';
import { type Match, sleep, standAt, startMatch } from './simHelpers';

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

// One server for the file: the debug handlers on (a second boot in the same file cannot be reached).
let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());

describe('the deal of a real match', () => {
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

describe('conversion and sabotage in a match', () => {
  beforeEach(async () => colyseus.cleanup());

  const ROLES = { Bot0: 'killer', Bot1: 'vicar', Bot2: 'detective', Bot3: 'townsfolk', Bot4: 'townsfolk' };
  const start = async (vendetta: string): Promise<Match> => {
    const m = await startMatch(colyseus, 5, ROLES);
    holdVendetta(m.room, idOf(m, 0), vendetta);
    return m;
  };
  const vendettaEvents = (m: Match) => matchEvents(m.room).filter((e) => e.kind.startsWith('vendetta.'));
  const stepsOf = (m: Match) => vendettaSteps(m.room).map((s) => s.kind);

  it('sows the doubt after the shared time and silences the Vicar at the next meeting only', async () => {
    const m = await start('zealot');
    const killer = idOf(m, 0);
    const vicar = idOf(m, 1);
    expect(sim(m, 0).sceneIdx).toBe(sim(m, 1).sceneIdx);
    expect(vendettaGoalFor(m.room, killer)).toEqual({ sceneId: 'overworld', targetSeat: vicar });
    progressOf(m.room, killer).sharedTicks = balance.vendettas.conversion.shareS * TICK_RATE - 2;
    await until(() => progressOf(m.room, killer).sown);
    expect(stepsOf(m)).toEqual(['vendetta.conversion.sown']);
    expect(vendettaGoalFor(m.room, killer)).toBeNull();
    expect([seat(m, 0).priv.vendetta, seat(m, 1).priv.vendetta]).toEqual(['zealot', '']);

    await openMeeting(m, 2);
    await until(() => stepsOf(m).length === 2);
    expect(stepsOf(m)).toEqual(['vendetta.conversion.sown', 'vendetta.conversion.doubt']);
    expect(countsVote(m.room, vicar)).toBe(false);
    expect(countsVote(m.room, killer)).toBe(true);
    await skipPhase(m);
    await voteAll(m, [0, 1, 2, 3, 4], (i) => (i === 1 ? idOf(m, 4) : idOf(m, 3)));
    const tally = events(m.bots[0] as never, 'voteResult').at(-1)?.tally as Record<string, number>;
    expect(tally[idOf(m, 4)] ?? 0).toBe(0);
    expect(tally[idOf(m, 3)]).toBe(4);
    // Publicly the doubted Vicar never voted, yet the meeting ended early; it alone holds the note.
    expect(seat(m, 1).hasVoted).toBe(false);
    await until(() => seat(m, 1).priv.notebook.some((n) => n.note === NoteKind.doubt));
    expect(seat(m, 1).priv.notebook.filter((n) => n.note === NoteKind.doubt)).toHaveLength(1);
    for (const i of [0, 2, 3, 4])
      expect(seat(m, i).priv.notebook.some((n) => n.note === NoteKind.doubt)).toBe(false);
    // Every step on the bus names no seat; the record keeps the holder.
    for (const e of vendettaEvents(m)) expect(e.seat).toBeUndefined();
    expect(vendettaSteps(m.room).every((s) => s.seat === killer)).toBe(true);
  });

  it('lapses when the Vicar dies before the doubt is sown', async () => {
    const m = await start('zealot');
    murder(m, 1);
    await until(() => stepsOf(m).length > 0);
    await sleep(200);
    expect(stepsOf(m)).toEqual(['vendetta.conversion.lapsed']);
  });

  it('tampers with still seconds at task targets, then undoes a finished task and readies the Knife', async () => {
    const m = await start('activist');
    const killer = idOf(m, 0);
    const p = sim(m, 0);
    const finished = new TaskEntry();
    finished.id = 'fixPump';
    finished.done = true;
    seat(m, 3).priv.tasks.push(finished);
    const other = new TaskEntry();
    other.id = 'lightLanterns';
    seat(m, 3).priv.tasks.push(other);
    m.room.state.taskBar = 50;
    seat(m, 0).priv.cooldownEndTick.set('kill', m.room.state.tick + 100 * TICK_RATE);

    expect(vendettaGoalFor(m.room, killer)?.sceneId).toBeTypeOf('string');
    const pump = scenes.overworld.props.find((q) => q.id === 'ov.pump') as { x: number; y: number };
    standAt(m, m.bots[0] as never, pump.x, pump.y + 1);
    expect(sceneKey(p.sceneIdx)).toBe('overworld');
    const prog = progressOf(m.room, killer);
    prog.tampered.push('ov.lantern_0');
    await sleep(200);
    expect(prog.holding?.prop).toBe('ov.pump');
    prog.holding = { prop: 'ov.pump', ticks: balance.vendettas.sabotage.tamperS * TICK_RATE - 2 };
    await until(() => prog.over);
    expect(stepsOf(m)).toEqual(['vendetta.sabotage.tampered', 'vendetta.sabotage.wrecked']);
    expect(finished.done).toBe(false);
    expect(m.room.state.taskBar).toBe(0);
    expect(seat(m, 0).priv.cooldownEndTick.get('kill')).toBeLessThanOrEqual(m.room.state.tick);
    expect(vendettaGoalFor(m.room, killer)).toBeNull();
    for (const e of vendettaEvents(m)) expect(e.seat).toBeUndefined();
  });
});
