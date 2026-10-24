import { ColyseusTestServer, boot } from '@colyseus/testing';
import { BUILD_VERSION, C2S, Phase, type PlayerState, dealTraits } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';
import { matchLog } from '../src/services/MatchLog';
import { MatchSeeds, type SeedWords } from '../src/sim/seeds';
import { endMatch } from '../src/sim/Win';

// Round 8, 8L (docs/round8/teardown.md 1.4, A170): the match log carries the build and every stream's seed words,
// and `MatchSeeds.replay` seeds from them, so a logged match's draws come out again.

vi.setConfig({ testTimeout: 40_000 });

const draw = (rng: () => number, n = 8) => Array.from({ length: n }, () => rng());

describe('MatchSeeds.recorded and replay', () => {
  it('records the words of every stream drawn, keyed ones apart, and replays each one exactly', () => {
    const live = new MatchSeeds();
    const runs = {
      deal: draw(live.get('deal')),
      traits: draw(live.get('traits')),
      'npcPlay:a': draw(live.get('npcPlay', 'a')),
      'npcPlay:b': draw(live.get('npcPlay', 'b')),
    };
    const words = live.recorded();
    expect(Object.keys(words).sort()).toEqual(Object.keys(runs).sort());
    const again = MatchSeeds.replay(JSON.parse(JSON.stringify(words)) as Record<string, SeedWords>);
    expect(draw(again.get('npcPlay', 'b'))).toEqual(runs['npcPlay:b']); // order of first use does not matter
    expect(draw(again.get('deal'))).toEqual(runs.deal);
    expect(draw(again.get('traits'))).toEqual(runs.traits);
    expect(draw(again.get('npcPlay', 'a'))).toEqual(runs['npcPlay:a']);
    // A stream the log does not list keeps crypto words, and is recorded in its turn.
    expect(draw(again.get('mobs', 'x'))).not.toEqual(draw(MatchSeeds.replay(words).get('mobs', 'x')));
    expect(Object.keys(again.recorded())).toContain('mobs:x');
  });

  it('records fixed words as they seeded the stream, so a keyed fixed stream replays too', () => {
    const words: SeedWords = [1, 2, 3, 4];
    const fixed = new MatchSeeds({ npcPlay: words });
    const run = draw(fixed.get('npcPlay', 'seat'));
    expect(draw(MatchSeeds.replay(fixed.recorded()).get('npcPlay', 'seat'))).toEqual(run);
  });
});

describe('the match log replay record', () => {
  let colyseus: ColyseusTestServer;
  beforeAll(async () => {
    colyseus = await boot(
      createServer({ ipBurst: 100_000, ipPerMin: 100_000_000, globalPerMin: 100_000_000 }),
    );
  });
  afterAll(async () => colyseus.shutdown());
  beforeEach(async () => colyseus.cleanup());

  for (const debug of [false, true])
    it(`no stdout line before game over carries a seed word, and the game-over line is the only match line (WDI_DEBUG ${debug ? 'on' : 'off'})`, async () => {
      const before = process.env.WDI_DEBUG;
      if (debug) process.env.WDI_DEBUG = '1';
      else delete process.env.WDI_DEBUG;
      const lines: string[] = [];
      const write = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
        lines.push(String(chunk));
        return (write as (c: unknown, ...r: unknown[]) => boolean)(chunk, ...rest);
      }) as typeof process.stdout.write;
      try {
        const leader = await colyseus.sdk.create('party', {
          name: 'Solo',
          build: BUILD_VERSION,
          deviceId: `dev-${debug}`,
        });
        await new Promise((r) => setTimeout(r, 100));
        const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
        leader.send(C2S.lobbyStart, {});
        await new Promise((r) => setTimeout(r, 1500)); // the deal, the card, the first ticks of play
        const live = lines.length;
        endMatch(room, 'village'); // after the reveal: the cards are public now
        const words = Object.values(room.seeds.recorded()).flat().map(String);
        expect(words.length).toBeGreaterThan(0);
        const early = lines.slice(0, live).join('');
        expect(early).not.toContain('"seeds"');
        for (const w of words) expect(early).not.toMatch(new RegExp(`\\b${w}\\b`));
        const matchLines = lines.filter((l) => l.includes('"event":"match"'));
        expect(matchLines).toHaveLength(1);
        expect(lines.indexOf(matchLines[0]!)).toBeGreaterThanOrEqual(live);
        await leader.leave();
      } finally {
        process.stdout.write = write;
        if (before === undefined) delete process.env.WDI_DEBUG;
        else process.env.WDI_DEBUG = before;
      }
    });

  it('a real Start, then game over: the line carries the build and the seeds, and they redraw the traits', async () => {
    const leader = await colyseus.sdk.create('party', {
      name: 'Solo',
      build: BUILD_VERSION,
      deviceId: 'dev-r',
    });
    await new Promise((r) => setTimeout(r, 100));
    const room = colyseus.getRoomById(leader.roomId) as unknown as PartyRoom;
    leader.send(C2S.lobbyStart, {});
    await new Promise((r) => setTimeout(r, 300));
    expect(room.state.phase).toBe(Phase.roleReveal);
    const traits = new Map<string, string>();
    room.state.players.forEach((p: PlayerState, id: string) =>
      traits.set(id, `${p.traits.height},${p.traits.scarf},${p.traits.hat}`),
    );

    const lines: string[] = [];
    const original = matchLog.write;
    matchLog.write = (line) => void lines.push(line);
    try {
      endMatch(room, 'village');
    } finally {
      matchLog.write = original;
    }
    const log = JSON.parse(lines.find((l) => l.includes('"event":"match"'))!);
    expect(log.build).toBe(BUILD_VERSION);
    expect(Object.keys(log.seeds)).toEqual(expect.arrayContaining(['deal', 'traits', 'npcNames']));

    const ids = [...traits.keys()];
    const redrawn = dealTraits(ids, MatchSeeds.replay(log.seeds).get('traits'));
    for (const id of ids) {
      const t = redrawn.get(id)!;
      expect(`${t.height},${t.scarf},${t.hat}`).toBe(traits.get(id));
    }
    await leader.leave();
  });
});
