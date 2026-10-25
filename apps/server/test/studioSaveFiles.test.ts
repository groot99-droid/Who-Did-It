import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SaveRefused, checkDataSave, formatDataJson } from '../src/services/studioSave';
import { bearer, harness } from './studioHttpHelpers';

// Round 9 (N1, docs/round9/admin-studio.md 8): the save route takes `{ file, json }` for the content allowlist.

const DATA = new URL('../../../packages/content/data/', import.meta.url);
const raw = (file: string) => JSON.parse(readFileSync(new URL(file, DATA), 'utf8'));
const fromB64 = (b64: string | undefined) => Buffer.from(b64 ?? '', 'base64').toString('utf8');
const problems = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (e) {
    if (e instanceof SaveRefused) return e.problems;
    throw e;
  }
  return [];
};

/** The clerk walks the pump first. */
function editedRoutines() {
  const r = raw('routines.json');
  r.townsfolk.clerk.stations = ['pump', 'ledger', 'noticeBoard', 'window'];
  return r;
}

describe('checkDataSave', () => {
  it('accepts a valid edit of each data file, in the content layout, with a change list', () => {
    const save = checkDataSave('routines.json', editedRoutines());
    expect(save.text).toBe(formatDataJson(editedRoutines()));
    expect(save.summary).toEqual(['- townsfolk: changed `clerk`']);
    const talk = raw('talk.json');
    talk.smallTalk.push('Is the kettle on?');
    expect(checkDataSave('talk.json', talk).summary).toEqual(['- `smallTalk` changed']);
    const quests = raw('quests.json');
    quests.npcs.smith.name = 'Old Smith';
    expect(checkDataSave('quests.json', quests).summary).toEqual(['- npcs: changed `smith`']);
    const lore = raw('lore.json');
    const shelf = Object.keys(lore.shelves)[0]!;
    lore.shelves[shelf].title = 'A shelf';
    expect(checkDataSave('lore.json', lore).summary).toEqual([`- shelves: changed \`${shelf}\``]);
  });

  it('refuses an unchanged file, an unknown key at any depth, a schema error and a broken reference', () => {
    expect(problems(() => checkDataSave('routines.json', raw('routines.json')))).toEqual(['nothing changed']);
    const deep = editedRoutines();
    deep.townsfolk.clerk.colour = 'red';
    expect(problems(() => checkDataSave('routines.json', deep)).join('\n')).toContain('colour');
    const top = { ...editedRoutines(), extra: 1 };
    expect(problems(() => checkDataSave('routines.json', top)).join('\n')).toContain('extra');
    const bad = editedRoutines();
    bad.townsfolk.clerk.look = 'detective';
    expect(problems(() => checkDataSave('routines.json', bad)).length).toBeGreaterThan(0);
    const orphan = raw('quests.json');
    delete orphan.npcs.foreman;
    expect(problems(() => checkDataSave('quests.json', orphan)).join('\n')).toContain('foreman');
  });

  it('refuses a talk line that names a role (role secrecy)', () => {
    const talk = raw('talk.json');
    talk.notes.push({ text: 'The Killer is among us.' });
    expect(problems(() => checkDataSave('talk.json', talk)).join('\n')).toContain('killer');
  });
});

describe('POST /studio/save with a file', () => {
  it('commits a data file on studio/<stem>-<stamp> and opens one draft PR', async () => {
    const { call, gh } = harness();
    const json = editedRoutines();
    const res = await call('POST', '/studio/save', {
      auth: bearer(),
      body: { file: 'routines.json', json, note: 'Pump first.' },
    });
    expect(res).toMatchObject({ status: 201, body: { branch: 'studio/routines-20261025-0405' } });
    const branch = 'studio/routines-20261025-0405';
    expect(fromB64(gh.files.get(`${branch}:packages/content/data/routines.json`)?.content)).toBe(
      formatDataJson(json),
    );
    expect([...gh.files.keys()].filter((k) => k.startsWith(branch))).toHaveLength(1);
    const pull = gh.pulls[0]!;
    expect(pull).toMatchObject({ head: branch, title: 'Studio: routines.json', draft: true });
    expect(pull.body).toContain('Pump first.');
    expect(pull.body).toContain('- townsfolk: changed `clerk`');
  });

  it('takes a scene as scenes/<id>.json, the same as the older { scene } body', async () => {
    const { call, gh } = harness();
    const scene = raw('scenes/bakery.json');
    scene.name = 'The Bakery, edited';
    const res = await call('POST', '/studio/save', {
      auth: bearer(),
      body: { file: 'scenes/bakery.json', json: scene },
    });
    expect(res).toMatchObject({ status: 201, body: { branch: 'studio/bakery-20261025-0405' } });
    expect(gh.files.has('studio/bakery-20261025-0405:packages/content/data/scenes/bakery.nav.json')).toBe(
      true,
    );
    const wrong = await call('POST', '/studio/save', {
      auth: bearer(),
      body: { file: 'scenes/barn.json', json: scene },
    });
    expect(wrong.status).toBe(422);
  });

  it('refuses a file off the allowlist, a file with a scene body, and a refused edit, writing nothing', async () => {
    const { call, gh } = harness();
    for (const body of [
      { file: 'balance.json', json: raw('balance.json') },
      { file: 'looks.json', json: raw('looks.json') },
      { file: '../routines.json', json: editedRoutines() },
      { file: 'routines.json', json: editedRoutines(), scene: {} },
      { file: 'routines.json', json: editedRoutines(), nav: {} },
      { file: 'routines.json', json: raw('routines.json') },
    ]) {
      expect((await call('POST', '/studio/save', { auth: bearer(), body })).status).toBe(422);
    }
    expect(gh.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });
});
