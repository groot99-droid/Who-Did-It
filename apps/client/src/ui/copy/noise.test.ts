import { describe, expect, it } from 'vitest';
import { noiseLine } from './noise';
import { WORLD_COPY } from './world';

// Round 10, 10Y (UI.md 14.4, DECISIONS A254): every noise kind the server sends has its own line, and a kind the
// client does not know reads the generic one, never the door's.
describe('noiseLine', () => {
  it('gives each known kind its line', () => {
    expect(noiseLine('door')).toBe('log.door');
    expect(noiseLine('run')).toBe('log.steps');
    expect(noiseLine('walk')).toBe('log.steps');
    expect(noiseLine('scream')).toBe('log.scream');
    expect(noiseLine('killScream')).toBe('log.scream');
    expect(noiseLine('bell')).toBe('log.bell');
    expect(noiseLine('chop')).toBe('log.chop');
    expect(noiseLine('smash')).toBe('log.smash');
    expect(noiseLine('shot')).toBe('log.shot');
    expect(noiseLine('shout')).toBe('log.shout');
    expect(noiseLine('crowbar')).toBe('log.crowbar');
    expect(noiseLine('lockpick')).toBe('log.lockpick');
  });

  it('never reads the door line for a kind it does not know', () => {
    for (const kind of [
      'wispRattle',
      'goat',
      'burst',
      'oneWayDrop',
      'skeletonKey',
      'rag',
      'bolt',
      'hide',
      '',
      'x9',
    ]) {
      expect(noiseLine(kind), kind).toBe('log.noise');
    }
  });

  it('every line it names exists and takes the direction', () => {
    for (const kind of [
      'door',
      'chop',
      'smash',
      'shot',
      'shout',
      'crowbar',
      'lockpick',
      'scream',
      'run',
      'nope',
    ]) {
      expect(WORLD_COPY[noiseLine(kind)], kind).toContain('{dir}');
    }
    expect(WORLD_COPY[noiseLine('bell')]).toBe('The bell rings');
  });
});
