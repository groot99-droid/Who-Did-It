import { content, scenes } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import {
  addGiver,
  linesOf,
  moveGiver,
  questErrors,
  removeGiver,
  sceneErrors,
  setLine,
  setNpc,
  talkErrors,
  villagerLooks,
} from './people';

const ov = scenes.overworld;

describe('villagerLooks', () => {
  it('offers only the villager family, never a seat card', () => {
    const ids = villagerLooks().map((l) => l.id);
    expect(ids).toContain('villager');
    for (const id of Object.keys(content.looks.looks)) expect(ids).not.toContain(id);
  });
});

describe('givers', () => {
  it('adds a giver under a new id and refuses a bad name, NPC, tile and a duplicate', () => {
    const ok = addGiver(ov, 'second', 'moll', 10, 10, 's');
    expect('value' in ok && ok.value.givers?.some((g) => g.id === `${ov.prefix}.gv_second`)).toBe(true);
    expect('error' in addGiver(ov, 'Bad Name', 'moll', 10, 10, 's')).toBe(true);
    expect('error' in addGiver(ov, 'x', 'nobody', 10, 10, 's')).toBe(true);
    expect('error' in addGiver(ov, 'x', 'moll', -1, 10, 's')).toBe(true);
    expect('error' in addGiver(ov, 'harbourmaster', 'moll', 10, 10, 's')).toBe(true);
  });

  it('moves a giver and keeps its id and NPC', () => {
    const id = ov.givers![0]!.id;
    const e = moveGiver(ov, id, 3, 4, 'e');
    expect('value' in e && e.value.givers![0]).toMatchObject({
      id,
      npc: ov.givers![0]!.npc,
      x: 3,
      y: 4,
      facing: 'e',
    });
    expect('error' in moveGiver(ov, 'nope', 1, 1)).toBe(true);
  });

  it('refuses to remove the only giver of an NPC that quests ask for', () => {
    const r = removeGiver(ov, ov.givers![0]!.id);
    expect('error' in r && r.error).toMatch(/quests ask for it/);
  });

  it('adds no scene error for the committed scene', () => {
    expect(sceneErrors(ov, ov)).toEqual([]);
  });
});

describe('quest NPCs', () => {
  it('changes a look to a villager look only', () => {
    const ok = setNpc(content.quests, 'moll', { look: 'villagerelder' });
    expect('value' in ok && ok.value.npcs.moll!.look).toBe('villagerelder');
    expect('error' in setNpc(content.quests, 'moll', { look: 'detective' })).toBe(true);
    expect('error' in setNpc(content.quests, 'moll', { name: '  ' })).toBe(true);
    expect(questErrors(content.quests)).toEqual([]);
  });
});

describe('talk lines', () => {
  it('replaces, appends and drops lines, keeping at least one', () => {
    const t = content.talk;
    const r = setLine(t, 'smallTalk', 0, { text: 'The tea is cold.' });
    expect('value' in r && r.value.smallTalk[0]).toBe('The tea is cold.');
    const a = setLine(t, 'notes', t.notes.length, { text: 'I saw {body}.', when: 'body' });
    expect('value' in a && a.value.notes.at(-1)).toEqual({ text: 'I saw {body}.', when: 'body' });
    expect('error' in setLine(t, 'notes', 99, null)).toBe(true);
    const one = { ...t, smallTalk: [t.smallTalk[0]!] };
    expect('error' in setLine(one, 'smallTalk', 0, null)).toBe(true);
    expect(linesOf(t, 'notes')).toHaveLength(t.notes.length);
  });

  it('flags a line that names a placeholder the list cannot fill or a role', () => {
    const bad = setLine(content.talk, 'smallTalk', 0, { text: 'Hello {name}.' });
    expect('value' in bad && talkErrors(bad.value).length).toBeGreaterThan(0);
    const role = setLine(content.talk, 'smallTalk', 0, { text: 'The detective is lying.' });
    expect('value' in role && talkErrors(role.value).length).toBeGreaterThan(0);
    expect(talkErrors(content.talk)).toEqual([]);
  });
});
