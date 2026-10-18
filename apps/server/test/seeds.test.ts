import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ColyseusTestServer, boot } from '@colyseus/testing';
import { BUILD_VERSION, C2S, Phase, type PlayerState, sfc32 } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';
import { MatchSeeds, type SeedWords } from '../src/sim/seeds';
import { fixSeeds } from './seedHelpers';

const draw = (rng: () => number, n = 8) => Array.from({ length: n }, () => rng());
const WORDS: SeedWords = [0x01234567, 0x89abcdef, 0xfedcba98, 0x76543210];

describe('MatchSeeds', () => {
  it('keeps one stream per name for the match', () => {
    const seeds = new MatchSeeds();
    const deal = seeds.get('deal');
    expect(seeds.get('deal')).toBe(deal);
  });

  it('gives every name its own stream', () => {
    const seeds = new MatchSeeds();
    const a = draw(seeds.get('deal'));
    const b = draw(seeds.get('traits'));
    expect(a).not.toEqual(b);
  });

  it('draws fresh seeds for every match', () => {
    expect(draw(new MatchSeeds().get('deal'))).not.toEqual(draw(new MatchSeeds().get('deal')));
    expect(draw(new MatchSeeds().get('npcPlay', 'seat'))).not.toEqual(
      draw(new MatchSeeds().get('npcPlay', 'seat')),
    );
  });

  it('gives every key its own stream, kept for the match', () => {
    const seeds = new MatchSeeds();
    const a = seeds.get('npcPlay', 'a');
    expect(seeds.get('npcPlay', 'a')).toBe(a);
    expect(seeds.get('npcPlay', 'b')).not.toBe(a);
    expect(seeds.get('npcPlay')).not.toBe(a);
    expect(seeds.get('npcTiming', 'a')).not.toBe(a);
    const runs = [draw(a), draw(seeds.get('npcPlay', 'b')), draw(seeds.get('npcPlay'))];
    expect(new Set(runs.map((r) => r.join())).size).toBe(3);
  });

  it('keeps keyed streams independent: drawing from one never moves another', () => {
    const alone = new MatchSeeds({ npcPlay: WORDS });
    const expected = draw(alone.get('npcPlay', 'a'), 16);
    const busy = new MatchSeeds({ npcPlay: WORDS });
    const a = busy.get('npcPlay', 'a');
    const got: number[] = [];
    for (let i = 0; i < 16; i++) {
      draw(busy.get('npcPlay', 'b'), 7);
      draw(busy.get('npcTiming', 'a'), 3);
      got.push(a());
    }
    expect(got).toEqual(expected);
  });

  it('seeds a fixed name from its words and each key from the fourth word XOR the FNV-1a hash', () => {
    const fixed = new MatchSeeds({ deal: WORDS, npcPlay: WORDS });
    expect(draw(fixed.get('deal'))).toEqual(draw(sfc32(...WORDS)));
    expect(draw(fixed.get('npcPlay'))).toEqual(draw(sfc32(...WORDS)));
    // FNV-1a 32 test vectors: "a" -> 0xe40c292c, "foobar" -> 0xbf9cf968.
    const [w0, w1, w2, w3] = WORDS;
    expect(draw(fixed.get('npcPlay', 'a'))).toEqual(draw(sfc32(w0, w1, w2, (w3 ^ 0xe40c292c) >>> 0)));
    expect(draw(fixed.get('npcPlay', 'foobar'))).toEqual(draw(sfc32(w0, w1, w2, (w3 ^ 0xbf9cf968) >>> 0)));
    // A name that is not listed keeps crypto words.
    expect(draw(fixed.get('traits'))).not.toEqual(draw(new MatchSeeds({ deal: WORDS }).get('traits')));
  });
});

describe('fixSeeds (test helper)', () => {
  it('replaces the room streams with ones seeded from the fixed words', () => {
    const room = { seeds: new MatchSeeds(), fixedSeeds: undefined } as unknown as PartyRoom;
    fixSeeds(room, { piles: WORDS });
    expect(room.fixedSeeds).toEqual({ piles: WORDS });
    expect(draw(room.seeds.get('piles'))).toEqual(draw(sfc32(...WORDS)));
  });

  it('is never called or set by a production code path', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts')) files.push(path);
      }
    };
    walk(fileURLToPath(new URL('../src', import.meta.url)));
    const uses = files.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => /fixSeeds\(|fixedSeeds\s*=[^=]/.test(line) && !line.trim().startsWith('*'))
        .map((line) => `${path.slice(path.indexOf('src'))}: ${line.trim()}`),
    );
    // The field's declaration (`fixedSeeds: FixedSeeds | undefined = undefined`) is not an assignment.
    expect(uses).toEqual([]);
  });
});

describe('fixSeeds across Start', () => {
  let colyseus: ColyseusTestServer;
  beforeAll(async () => {
    colyseus = await boot(
      createServer({ ipBurst: 100_000, ipPerMin: 100_000_000, globalPerMin: 100_000_000 }),
    );
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** One human starts a fixed-seed party; NPC seats fill it to the minimum. Returns each seat in seat order. */
  async function fixedStart(): Promise<string[]> {
    const leader = await colyseus.sdk.create('party', {
      name: 'Solo',
      build: BUILD_VERSION,
      deviceId: 'dev-solo',
    });
    await sleep(100);
    const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
    fixSeeds(room, { deal: WORDS, traits: WORDS, npcNames: WORDS });
    leader.send(C2S.lobbyStart, {});
    await sleep(300);
    expect(room.state.phase).toBe(Phase.roleReveal);
    const seats: string[] = [];
    room.state.players.forEach((p: PlayerState) =>
      seats.push(`${p.name}|${p.priv.role.roleId}|${p.traits.height},${p.traits.scarf},${p.traits.hat}`),
    );
    await leader.leave();
    return seats;
  }

  it('reproduces the NPC names, the deal and the traits of a run in another room', async () => {
    const one = await fixedStart();
    const two = await fixedStart();
    expect(one.length).toBeGreaterThan(1);
    expect(two).toEqual(one);
  });
});
