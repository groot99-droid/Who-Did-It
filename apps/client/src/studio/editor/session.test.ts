import { describe, expect, it } from 'vitest';
import { EditorSession } from './session';
import { find } from './sceneEdit';
import { templatesFor } from './templates';

describe('templates', () => {
  it('offers the content’s prop kinds with their footprint size, light kinds, and a portal that goes nowhere yet', () => {
    const props = templatesFor('props', 'bakery');
    expect(props.find((t) => t.label === 'wakeTable')?.fields).toMatchObject({ footprint: { w: 5, h: 2 } });
    expect(templatesFor('lights', 'bakery').map((t) => t.label)).toContain('lantern');
    expect(templatesFor('portals', 'bakery')[0]!.fields).toMatchObject({
      from: 'bakery',
      to: null,
      toSpawn: null,
    });
    expect(templatesFor('spots', 'bakery').length).toBeGreaterThan(0);
  });
});

describe('session', () => {
  it('selects on click, drags to move, and undoes and redoes the move', () => {
    const s = new EditorSession('bakery');
    s.click(5, 5);
    expect(s.selection).toEqual({ kind: 'lights', id: 'bk.lt_lamp_table' });
    s.moveSelected(6, 6);
    expect(find(s.scene, s.selection!)).toMatchObject({ x: 6, y: 6 });
    expect(s.diff).toHaveLength(1);
    s.undo();
    expect(find(s.scene, s.selection!)).toMatchObject({ x: 5, y: 5 });
    expect(s.diff).toEqual([]);
    s.redo();
    expect(s.diff).toHaveLength(1);
  });

  it('places the palette’s choice under the typed name, selects it, and refuses without a name', () => {
    const s = new EditorSession('bakery');
    s.choose({ kind: 'lights', label: 'lantern' });
    s.click(2, 2);
    expect(s.error).toMatch(/lowercase/);
    expect(s.diff).toEqual([]);
    s.setName('corner');
    s.click(2, 2);
    expect(s.error).toBe('');
    expect(s.selection).toEqual({ kind: 'lights', id: 'bk.corner' });
    expect(s.diff).toEqual(['+ lights bk.corner at 2,2']);
    expect(s.name).toBe('');
  });

  it('duplicates the selection under a new name', () => {
    const s = new EditorSession('bakery');
    s.select({ kind: 'lights', id: 'bk.lt_lamp_table' });
    s.setName('lamp_two');
    s.duplicateSelected();
    expect(s.selection).toEqual({ kind: 'lights', id: 'bk.lamp_two' });
    expect(s.scene.lights!.some((l) => l.id === 'bk.lamp_two')).toBe(true);
  });

  it('refuses to delete a frozen spawn that portals elsewhere land on, naming them, but deletes a new one', () => {
    const s = new EditorSession('bakery');
    s.select({ kind: 'spawns', id: 'door' });
    s.removeSelected();
    expect(s.error).toMatch(/overworld\./);
    expect(s.selection).not.toBeNull();
    s.choose({ kind: 'spawns', label: 'spawn' });
    s.setName('temp');
    s.click(3, 3);
    expect(s.selection).toEqual({ kind: 'spawns', id: 'temp' });
    s.removeSelected();
    expect(s.selection).toBeNull();
    expect(s.diff).toEqual([]);
  });

  it('refuses an id or tile through patch and clears the error after a good edit', () => {
    const s = new EditorSession('bakery');
    s.select({ kind: 'lights', id: 'bk.lt_lamp_table' });
    s.patchSelected({ id: 'bk.x' });
    expect(s.error).not.toBe('');
    s.patchSelected({ radiusTiles: 3 });
    expect(s.error).toBe('');
  });
});
