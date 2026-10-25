import { content, scenes } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import { SaveError } from '../saveApi';
import { PeopleModel } from './PeopleModel';
import { moveGiver, setLine, setNpc } from './people';

const ov = scenes.overworld;
const floor = (() => {
  for (let y = 0; y < ov.size.h; y++) {
    const x = ov.grid[y]!.indexOf('.', 5);
    if (x >= 0) return { x, y };
  }
  throw new Error('no floor');
})();
const move = () => moveGiver(ov, ov.givers![0]!.id, floor.x, floor.y);
const ok = { branch: 'b', number: 1, url: 'u' };

describe('PeopleModel', () => {
  it('applies edits, undoes them and refuses a bad one', () => {
    const m = new PeopleModel(() => 'overworld');
    expect(m.editScene(move())).toBe(true);
    expect(m.scene?.givers?.[0]).toMatchObject(floor);
    expect(m.editQuests(setNpc(m.quests, 'moll', { name: 'Mother Moll the Elder' }))).toBe(true);
    expect(m.changes().map((c) => c.file)).toEqual([`scenes/overworld.json`, 'quests.json']);
    m.undo();
    m.undo();
    expect(m.changes()).toEqual([]);
    expect(m.editQuests(setNpc(m.quests, 'moll', { look: 'detective' }))).toBe(false);
    expect(m.problems).toHaveLength(1);
  });

  it('refuses a talk line that names a role', () => {
    const m = new PeopleModel(() => null);
    expect(m.editTalk(setLine(content.talk, 'smallTalk', 0, { text: 'The detective did it.' }))).toBe(false);
    expect(m.scene).toBeNull();
  });

  it('saves one file per change and stops at a refusal', async () => {
    const m = new PeopleModel(() => 'overworld');
    m.editScene(move());
    m.editQuests(setNpc(m.quests, 'moll', { name: 'Mother Moll II' }));
    const sent: unknown[] = [];
    const got = await m.save({ save: (r) => (sent.push(r), Promise.resolve(ok)) }, 'n');
    expect(got).toHaveLength(2);
    expect(sent[0]).toMatchObject({ file: 'scenes/overworld.json', note: 'n' });
    const bad = await m.save({ save: () => Promise.reject(new SaveError(422, 'no', ['x'])) }, '');
    expect(bad).toEqual([]);
    expect(m.problems).toEqual(['x']);
  });
});
