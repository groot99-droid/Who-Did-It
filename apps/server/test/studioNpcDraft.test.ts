import { readFileSync } from 'node:fs';
import { content } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import type { NpcDraftSink } from '../src/services/studioRoutes';
import { type NpcData, SaveRefused, checkNpcDraft } from '../src/services/studioSave';
import {
  type StudioSim,
  createStudio,
  parseStudio,
  stepStudio,
  studioSnapshot,
} from '../src/sim/studio/Studio';
import { bearer, harness } from './studioHttpHelpers';

// Round 9 (N1, docs/round9/admin-studio.md 8): the NPC editor's live preview.

const DATA = new URL('../../../packages/content/data/', import.meta.url);
const raw = (file: string) => JSON.parse(readFileSync(new URL(file, DATA), 'utf8'));

function send(sim: StudioSim, ...msgs: [string, unknown][]): string[] {
  const out: string[] = [];
  for (const [type, payload] of msgs) {
    const cmd = parseStudio(type, payload);
    if (typeof cmd === 'string') out.push(cmd);
    else sim.commands.push(cmd);
  }
  return [...out, ...stepStudio(sim)];
}

/** Routines with a new townsfolk kind, `porter`, that walks to the pump in a plain villager look. */
function withPorter() {
  const r = raw('routines.json');
  r.townsfolk.porter = { look: 'villager', named: false, fixed: false, stations: ['pump'] };
  return r;
}

const sink = (answer: ReturnType<NpcDraftSink> = 'queued') => {
  const got: Array<{ roomId: string; npc: NpcData }> = [];
  const fn: NpcDraftSink = (roomId, npc) => {
    got.push({ roomId, npc });
    return answer;
  };
  return { got, fn };
};

describe('checkNpcDraft', () => {
  it('checks each file sent with the others in place and keeps the committed ones', () => {
    const npc = checkNpcDraft({ routines: withPorter() });
    expect(npc.routines.townsfolk.porter?.stations).toEqual(['pump']);
    expect(npc.quests).toBe(content.quests);
    expect(npc.looks).toBe(content.looks);
    expect(checkNpcDraft({ quests: raw('quests.json'), looks: raw('looks.json') }).routines).toBe(
      content.routines,
    );
  });

  it('refuses nothing sent, unknown keys, and a broken reference', () => {
    const refused = (body: Record<string, unknown>) => {
      try {
        checkNpcDraft(body);
      } catch (e) {
        if (e instanceof SaveRefused) return e.problems.join('\n');
        throw e;
      }
      return '';
    };
    expect(refused({})).toBe('send routines, quests or looks');
    const deep = withPorter();
    deep.townsfolk.porter.colour = 'red';
    expect(refused({ routines: deep })).toMatch(/routines.json townsfolk.porter.*colour/);
    const orphan = raw('quests.json');
    delete orphan.npcs.smith;
    expect(refused({ quests: orphan })).toContain('smith');
  });
});

describe('POST /studio/npc-draft', () => {
  it('hands checked NPC data to the room without GitHub, and refuses what a save refuses', async () => {
    const room = sink();
    const { call, gh } = harness(false, undefined, room.fn);
    const ok = await call('POST', '/studio/npc-draft', {
      auth: bearer(),
      body: { roomId: 'Ab_c-1', routines: withPorter() },
    });
    expect(ok).toMatchObject({ status: 202, body: { queued: true } });
    expect(room.got[0]!.roomId).toBe('Ab_c-1');
    expect(room.got[0]!.npc.routines.townsfolk.porter).toBeDefined();
    expect(gh.calls).toEqual([]);
    const bad = await call('POST', '/studio/npc-draft', {
      auth: bearer(),
      body: { roomId: 'r', routines: { ...withPorter(), extra: 1 } },
    });
    expect(bad.status).toBe(422);
    expect(
      (await call('POST', '/studio/npc-draft', { auth: bearer(), body: { roomId: 'a/b' } })).status,
    ).toBe(422);
    expect(room.got).toHaveLength(1);
  });

  it('answers 404 without the room, 429 when busy, and 403 without the token', async () => {
    const body = { roomId: 'r', routines: withPorter() };
    expect((await harness(true).call('POST', '/studio/npc-draft', { auth: bearer(), body })).status).toBe(
      404,
    );
    const busy = harness(true, undefined, sink('busy').fn);
    expect((await busy.call('POST', '/studio/npc-draft', { auth: bearer(), body })).status).toBe(429);
    const room = sink();
    const { call } = harness(true, undefined, room.fn);
    expect((await call('POST', '/studio/npc-draft', { auth: 'Bearer x', body })).status).toBe(403);
    expect(room.got).toEqual([]);
  });
});

describe('the Studio room with an NPC draft', () => {
  it('spawns a kind only the draft holds, wears its looks, and drops it with the draft', () => {
    const sim = createStudio('overworld');
    send(sim, ['studio.teleport', { sceneId: 'overworld', x: 40, y: 24 }]);
    expect(send(sim, ['studio.spawn', { kind: 'townsfolk', ref: 'porter', x: 30, y: 24 }])).toEqual([
      'no such figure',
    ]);
    const routines = withPorter();
    routines.townsfolk.clerk.look = 'villager';
    sim.commands.push({ kind: 'npcDraft', npc: checkNpcDraft({ routines }) });
    expect(send(sim, ['studio.spawn', { kind: 'townsfolk', ref: 'porter', x: 30, y: 24 }])).toEqual([]);
    send(sim, ['studio.spawn', { kind: 'look', ref: 'villager', x: 31, y: 24 }]);
    const snap = studioSnapshot(sim);
    expect(snap.npcDraft).toBe(true);
    expect(snap.spawns.map((s) => [s.ref, s.look])).toEqual([
      ['porter', 'villager'],
      ['villager', 'villager'],
    ]);
    expect(send(sim, ['studio.npcDraft', { npc: null }])).toEqual([]);
    const after = studioSnapshot(sim);
    expect(after.npcDraft).toBe(false);
    expect(after.spawns.map((s) => s.ref)).toEqual(['villager']);
    expect(parseStudio('studio.npcDraft', { npc: {} })).toBe('send NPC data by POST /studio/npc-draft');
  });

  it("reports the scene's givers with the draft's names and looks", () => {
    const sim = createStudio('bp_smithy');
    expect(studioSnapshot(sim).givers).toEqual([
      {
        id: 'bf.gv_smith',
        npc: 'smith',
        name: content.quests.npcs.smith!.name,
        look: content.quests.npcs.smith!.look,
        x: 10,
        y: 4,
        facing: 'w',
      },
    ]);
    const quests = raw('quests.json');
    quests.npcs.smith.name = 'Old Smith';
    sim.commands.push({ kind: 'npcDraft', npc: checkNpcDraft({ quests }) });
    stepStudio(sim);
    expect(studioSnapshot(sim).givers?.[0]?.name).toBe('Old Smith');
  });
});
