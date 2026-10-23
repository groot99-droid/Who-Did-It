import { describe, expect, it } from 'vitest';
import { type Stage, Staging, stagedScenes } from './staging';

const cam = (sceneId: string) => ({ t: 'camera', sceneId });

function fakeStage(loaded: string[] = ['tavern_bar', 'cellar']) {
  const log: string[] = [];
  const stage: Stage = {
    prepare: (ids) => void log.push(`prepare ${ids.join(',')}`),
    show: (id) => {
      if (!loaded.includes(id)) return false;
      log.push(`show ${id}`);
      return true;
    },
    hide: () => void log.push('hide'),
    dispose: () => void log.push('dispose'),
  };
  return { stage, log };
}

describe('stagedScenes', () => {
  it('lists the other scenes of the camera steps once, in order', () => {
    const steps = [cam('overworld'), { t: 'caption' }, cam('cellar'), cam('tavern_bar'), cam('cellar')];
    expect(stagedScenes(steps, 'overworld')).toEqual(['cellar', 'tavern_bar']);
    expect(stagedScenes([cam('overworld')], 'overworld')).toEqual([]);
  });
});

describe('Staging', () => {
  it('opens no stage when every shot is in the home scene', () => {
    let opened = 0;
    const s = new Staging(
      'overworld',
      () => {
        opened++;
        return fakeStage().stage;
      },
      [cam('overworld')],
    );
    expect(s.shot('overworld')).toBe('home');
    s.end();
    expect(opened).toBe(0);
  });

  it('films other scenes on the stage, hides it back home, and disposes it once at the end', () => {
    const { stage, log } = fakeStage();
    const steps = [cam('overworld'), cam('tavern_bar'), cam('cellar'), cam('overworld')];
    const s = new Staging('overworld', () => stage, steps);
    expect(log).toEqual(['prepare tavern_bar,cellar']);
    expect(s.shot('overworld')).toBe('home');
    expect(s.shot('tavern_bar')).toBe('staged');
    expect(s.showing).toBe('tavern_bar');
    expect(s.shot('cellar')).toBe('staged');
    expect(s.shot('overworld')).toBe('home');
    s.end();
    s.end();
    expect(log).toEqual(['prepare tavern_bar,cellar', 'show tavern_bar', 'show cellar', 'hide', 'dispose']);
    expect(s.shot('cellar')).toBe('skip');
  });

  it('skips a shot whose scene has not loaded, keeping the shot before', () => {
    const { stage } = fakeStage([]);
    const s = new Staging('overworld', () => stage, [cam('overworld'), cam('chapel')]);
    s.shot('overworld');
    expect(s.shot('chapel')).toBe('skip');
    expect(s.showing).toBe('overworld');
  });

  it('films everything at home when the player does not know its scene', () => {
    let opened = 0;
    const s = new Staging(undefined, () => {
      opened++;
      return null;
    }, [cam('cellar')]);
    expect(s.shot('cellar')).toBe('home');
    expect(opened).toBe(0);
  });
});
