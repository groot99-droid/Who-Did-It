import { afterEach, describe, expect, it } from 'vitest';
import { scenes, type Scene } from '@wdi/content';
import type { StudioSnapshot } from '../admin/StudioNet';
import { StudioStore, STUDIO_LISTS } from './model';
import { availableModes, modeOfScene, panelOf, registerMode, scenesFor } from './modes';

const ids = STUDIO_LISTS.scenes;
const kind = (id: string) => (scenes as unknown as Record<string, Scene>)[id]!.kind;
const snap = (sceneId: string) => ({ sceneId }) as unknown as StudioSnapshot;

describe('studio modes (docs/round9/admin-studio.md 8)', () => {
  const undo: Array<() => void> = [];
  afterEach(() => undo.splice(0).forEach((f) => f()));

  it('lists the exteriors in World and the interiors in Room, and every scene elsewhere', () => {
    const world = scenesFor('world', ids);
    const room = scenesFor('room', ids);
    expect(world.length).toBeGreaterThan(0);
    expect(room.length).toBeGreaterThan(0);
    expect(world.every((id) => kind(id) !== 'interior')).toBe(true);
    expect(room.every((id) => kind(id) === 'interior')).toBe(true);
    expect([...world, ...room].sort()).toEqual([...ids].sort());
    expect(scenesFor('overview', ids)).toEqual(ids);
    expect(scenesFor('npc', ids)).toEqual(ids);
  });

  it('puts a scene in the mode its kind says', () => {
    expect(modeOfScene('overworld')).toBe('world');
    expect(modeOfScene('tavern_bar')).toBe('room');
  });

  it('offers World and Room, and Overview and NPC only once they register a panel', () => {
    expect(availableModes()).toEqual(['world', 'room']);
    undo.push(registerMode('npc', () => ({ destroy() {} })));
    undo.push(registerMode('overview', () => ({ destroy() {} })));
    expect(availableModes()).toEqual(['overview', 'world', 'room', 'npc']);
    expect(panelOf('npc')).toBeDefined();
    undo.splice(0).forEach((f) => f());
    expect(availableModes()).toEqual(['world', 'room']);
  });

  it('a stale remover does not drop a newer panel', () => {
    const drop = registerMode('npc', () => ({ destroy() {} }));
    const newer = () => ({ destroy() {} });
    undo.push(registerMode('npc', newer));
    drop();
    expect(panelOf('npc')).toBe(newer);
  });

  it('starts in World, follows the scene in World and Room, and stays put in Overview and NPC', () => {
    const store = new StudioStore();
    expect(store.mode).toBe('world');
    store.applySnapshot(snap('overworld'));
    store.applySnapshot(snap('tavern_bar'));
    expect(store.mode).toBe('room');
    store.applySnapshot(snap('overworld'));
    expect(store.mode).toBe('world');
    store.setMode('npc');
    store.applySnapshot(snap('tavern_bar'));
    expect(store.mode).toBe('npc');
    store.reset();
    expect(store.mode).toBe('world');
  });

  it('announces a mode change once', () => {
    const store = new StudioStore();
    let n = 0;
    store.bus.on('change', () => n++);
    store.setMode('room');
    store.setMode('room');
    expect(n).toBe(1);
  });
});
