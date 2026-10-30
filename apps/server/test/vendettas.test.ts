import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, roles, scenes, validateContent, vendettas } from '@wdi/content';
import {
  BUILD_VERSION,
  C2S,
  ClueKind,
  ErrorCode,
  NoteKind,
  Phase,
  QuestState,
  TICK_RATE,
  TILE_PX,
  TaskEntry,
} from '@wdi/shared';
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
import { emitSim } from '../src/sim/events/bus';
import { count } from '../src/sim/Inventory';
import { simOf } from '../src/sim/RoomSim';
import { STRONGBOX_ITEM, strongboxOf } from '../src/sim/vendettas/heist';
import { act, errorCodes, setPhase, teleport } from './killHelpers';
import { markDead } from '../src/sim/Death';
import { CONTRACT_QUEST, openContract } from '../src/sim/vendettas/contract';
import { matchEvents } from '../src/sim/auto/log';
import { countsVote } from '../src/sim/vendettas/conversion';
import { vendettaGoalFor } from '../src/sim/vendettas/goal';
import { emitStep, progressOf, vendettaSteps } from '../src/sim/vendettas/progress';
import { registeredInvariants, runInvariants } from '../src/sim/auto/invariants';
import { addStack } from '../src/sim/Inventory';
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
import { type Bot, type Match, sleep, standAt, startMatch } from './simHelpers';

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
    expect(small(['killer', 'vicar'])).toEqual(['zealot', 'activist']);
    expect(small(['killer'])).toEqual(['activist']);
    const medium = [...deal(8, ['killer', 'vicar']).values()];
    expect(ids(eligibleVendettas(room, 'killer', medium))).toEqual(['zealot', 'activist', 'bandit']);
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
    expect([...seen.keys()].sort()).toEqual(['activist', 'bandit', 'zealot']);
    for (const n of seen.values()) expect(Math.abs(n - 1000)).toBeLessThan(150);
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

describe('the heist in a match', () => {
  beforeEach(async () => colyseus.cleanup());

  it('loads the strongbox at the delivery, then the Bandit cracks it alone after dark', async () => {
    const m = await startMatch(colyseus, 5, { Bot0: 'killer', Bot1: 'detective' });
    const killer = idOf(m, 0);
    holdVendetta(m.room, killer, 'bandit');
    // White-box: the hall opens at the medium profile; a party of five plays the small one.
    simOf(m.room).profile = 'medium';
    const box = strongboxOf(m.room);
    expect(vendettaGoalFor(m.room, killer)).toBeNull();
    const data = { map: 'hollowmere', station: 'overworld.platform', round: 1 };
    emitSim(m.room, { tick: m.room.state.tick, kind: 'train.delivery', sceneId: 'overworld', data });
    await until(() => box.loaded);
    expect(vendettaGoalFor(m.room, killer)).toEqual({ sceneId: 'manor_hall' });

    const prog = progressOf(m.room, killer);
    const bots = m.bots as Bot[];
    const [b0, b2] = [bots[0]!, bots[2]!];
    setPhase(m, Phase.day);
    teleport(m, b0, 'manor_hall', 18, 1);
    await sleep(200);
    expect(prog.holding).toBeNull();
    setPhase(m, Phase.night);
    const home = { x: Math.floor(sim(m, 2).x / TILE_PX), y: Math.floor(sim(m, 2).y / TILE_PX) };
    teleport(m, b2, 'manor_hall', 14, 4);
    await sleep(200);
    expect(prog.holding).toBeNull();
    teleport(m, b2, 'overworld', home.x, home.y);
    await until(() => prog.holding !== null);
    expect(prog.holding?.prop).toBe('mh.safe');
    seat(m, 0).priv.cooldownEndTick.set('kill', m.room.state.tick + 100 * TICK_RATE);
    prog.holding = { prop: 'mh.safe', ticks: balance.vendettas.heist.crackS * TICK_RATE - 2 };
    await until(() => prog.over);

    expect(box.taken).toBe(true);
    expect(count(seat(m, 0), STRONGBOX_ITEM)).toBe(1);
    expect(seat(m, 0).priv.cooldownEndTick.get('kill')).toBeLessThanOrEqual(m.room.state.tick);
    const prints = [...m.room.state.scenes.get('manor_hall')!.clues.values()].filter(
      (c) => c.kind === ClueKind.footprints,
    );
    expect(prints.map((c) => c.value)).toEqual([seat(m, 0).traits.height]);
    expect(vendettaGoalFor(m.room, killer)).toBeNull();
    expect(vendettaSteps(m.room).map((s) => s.kind)).toEqual(['vendetta.heist.cracked']);
    const heistEvents = () => matchEvents(m.room).filter((e) => e.kind.startsWith('vendetta.'));
    await until(() => heistEvents().length === 2);
    const kinds = heistEvents();
    expect(kinds.map((e) => e.kind)).toEqual(['vendetta.heist.loaded', 'vendetta.heist.cracked']);
    for (const e of kinds) expect(e.seat).toBeUndefined();
  });
});

describe('the contract in a match', () => {
  beforeEach(async () => colyseus.cleanup());

  const ROLES = {
    Bot0: 'killer',
    Bot1: 'detective',
    Bot2: 'townsfolk',
    Bot3: 'townsfolk',
    Bot4: 'townsfolk',
  };
  const arrive = (m: Match) =>
    emitSim(m.room, {
      tick: m.room.state.tick,
      kind: 'train.arrive',
      sceneId: 'overworld',
      data: { map: 'hollowmere', station: 'overworld.platform', round: 1 },
    });
  /** A landed Knife strike as `sim/Kill.ts` sends it: the `kill` event, then the death. */
  const knife = (m: Match, by: string, victim: string) => {
    emitSim(m.room, { tick: m.room.state.tick, kind: 'kill', seat: victim, data: { by } });
    markDead(m.room, victim, 'knife', by);
  };
  const stepsOf = (m: Match) => vendettaSteps(m.room).map((s) => s.kind);
  const hitmanStart = async () => {
    const m = await startMatch(colyseus, 5, ROLES);
    const hitman = idOf(m, 0);
    holdVendetta(m.room, hitman, 'hitman');
    arrive(m);
    await until(() => openContract(m.room, hitman) !== null);
    return { m, hitman, target: openContract(m.room, hitman)!.target };
  };

  it('mails the Hitman a target to its own Notebook, accepted from anywhere, paid by the Knife on the mark', async () => {
    const { m, hitman, target } = await hitmanStart();
    expect(target).not.toBe(hitman);
    expect(
      seat(m, 0)
        .priv.notebook.filter((n) => n.note === NoteKind.contract)
        .map((n) => n.of),
    ).toEqual([target]);
    for (const i of [1, 2, 3, 4])
      expect(seat(m, i).priv.notebook.some((n) => n.note === NoteKind.contract)).toBe(false);
    expect(vendettaGoalFor(m.room, hitman)?.targetSeat).toBe(target);

    // Nobody else can take it; the Hitman takes it wherever it stands, once.
    const other = [1, 2, 3, 4].find((i) => idOf(m, i) !== target)!;
    await act(m.bots[other] as Bot, 'quest.accept', { questId: CONTRACT_QUEST });
    expect(errorCodes(m.bots[other] as Bot)).toContain(ErrorCode.cannot);
    await act(m.bots[0] as Bot, 'quest.accept', { questId: CONTRACT_QUEST });
    await act(m.bots[0] as Bot, 'quest.accept', { questId: CONTRACT_QUEST });
    expect(seat(m, 0).priv.quests.map((q) => [q.id, q.done])).toEqual([[CONTRACT_QUEST, false]]);
    expect(errorCodes(m.bots[0] as Bot)).toContain(ErrorCode.cannot);

    // A kill off the mark rests the Knife the longer; the mark's kill pays and readies it.
    const bystander = [1, 2, 3, 4].map((i) => idOf(m, i)).find((id) => id !== target)!;
    const rest = m.room.state.tick + 100 * TICK_RATE;
    seat(m, 0).priv.cooldownEndTick.set('kill', rest);
    knife(m, hitman, bystander);
    await until(() => (seat(m, 0).priv.cooldownEndTick.get('kill') ?? 0) > rest);
    expect(seat(m, 0).priv.cooldownEndTick.get('kill')).toBe(
      rest + balance.vendettas.contract.offTargetRestS * TICK_RATE,
    );
    knife(m, hitman, target);
    await until(() => progressOf(m.room, hitman).over);
    expect(stepsOf(m)).toEqual([
      'vendetta.contract.offered',
      'vendetta.contract.accepted',
      'vendetta.contract.done',
    ]);
    expect(seat(m, 0).priv.quests[0]?.done).toBe(true);
    expect(seat(m, 0).priv.cooldownEndTick.get('kill')).toBeLessThanOrEqual(m.room.state.tick);
    expect(vendettaGoalFor(m.room, hitman)).toBeNull();
    await sleep(100);
    for (const e of matchEvents(m.room).filter((e) => e.kind.startsWith('vendetta.')))
      expect(e.seat).toBeUndefined();
  });

  it('ends unpaid when the mark dies any other way', async () => {
    const { m, hitman, target } = await hitmanStart();
    await act(m.bots[0] as Bot, 'quest.accept', { questId: CONTRACT_QUEST });
    expect(seat(m, 0).priv.quests).toHaveLength(1);
    markDead(m.room, target, 'poison');
    await until(() => progressOf(m.room, hitman).over);
    expect(stepsOf(m)).toEqual([
      'vendetta.contract.offered',
      'vendetta.contract.accepted',
      'vendetta.contract.lapsed',
    ]);
    expect(seat(m, 0).priv.quests).toHaveLength(0);
  });
});

describe('the vendetta invariants', () => {
  beforeEach(async () => colyseus.cleanup());

  const CHECKS = ['vendettaOnce', 'contractQuest', 'strongboxOnce', 'vendettaPublic'];
  const ROLES = {
    Bot0: 'killer',
    Bot1: 'detective',
    Bot2: 'townsfolk',
    Bot3: 'townsfolk',
    Bot4: 'townsfolk',
  };
  const failing = (room: PartyRoom) =>
    runInvariants(room)
      .filter((f) => CHECKS.includes(f.name))
      .map((f) => f.name);

  it('register after the round-6 checks', () => {
    expect(registeredInvariants().slice(-CHECKS.length)).toEqual(CHECKS);
  });

  it('stay quiet through a played contract, then catch each breach', async () => {
    const m = await startMatch(colyseus, 5, ROLES);
    const hitman = idOf(m, 0);
    holdVendetta(m.room, hitman, 'hitman');
    emitSim(m.room, {
      tick: m.room.state.tick,
      kind: 'train.arrive',
      sceneId: 'overworld',
      data: { map: 'hollowmere', station: 'overworld.platform', round: 1 },
    });
    await until(() => openContract(m.room, hitman) !== null);
    await act(m.bots[0] as Bot, 'quest.accept', { questId: CONTRACT_QUEST });
    emitStep(m.room, hitman, 'vendetta.contract.done');
    await sleep(100);
    expect(failing(m.room)).toEqual([]);

    // A second fire of the same vendetta.
    emitStep(m.room, hitman, 'vendetta.contract.done');
    expect(failing(m.room)).toEqual(['vendettaOnce']);
    // A contract quest on a seat without the contract, and the strongbox in two inventories.
    const quest = new QuestState();
    quest.id = CONTRACT_QUEST;
    seat(m, 1).priv.quests.push(quest);
    addStack(seat(m, 2), STRONGBOX_ITEM, 1);
    addStack(seat(m, 3), STRONGBOX_ITEM, 1);
    // A public vendetta event that names a seat, reported once.
    emitSim(m.room, { tick: m.room.state.tick, kind: 'vendetta.contract.offered', seat: hitman });
    await sleep(100);
    expect(failing(m.room)).toEqual(CHECKS);
    expect(failing(m.room)).toEqual(CHECKS.slice(0, 3));
  });
});
