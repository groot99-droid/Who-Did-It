import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import balanceJson from '@wdi/content/data/balance.json';
import { LOBBY_COPY } from './copy';
import { LEVEL_LABELS, difficultyLockedText } from './Lobby';

describe('NPC skill lines (UI.md 14.13)', () => {
  it('labels every skill level of balance.json with its npc.level id', () => {
    expect(Object.keys(LEVEL_LABELS).sort()).toEqual(Object.keys(balanceJson.npc.difficulty).sort());
    expect(LEVEL_LABELS).toEqual({
      easy: LOBBY_COPY['npc.level.easy'],
      normal: LOBBY_COPY['npc.level.normal'],
      hard: LOBBY_COPY['npc.level.hard'],
    });
  });

  it('names the NPC seats the skill needs and the default level played until then', () => {
    const { difficultyMinNpcs, defaultDifficulty } = balanceJson.npc;
    const level = LEVEL_LABELS[defaultDifficulty as keyof typeof LEVEL_LABELS];
    expect(difficultyLockedText()).toBe(
      `Skill opens with ${difficultyMinNpcs} NPC seats. Until then they play ${level}.`,
    );
  });

  it('reads the final ids and none of the provisional ones', () => {
    const src = readFileSync(new URL('./Lobby.ts', import.meta.url), 'utf8');
    expect(src).toContain("C['lobby.npc.difficulty.locked']");
    for (const id of ['lobby.npc.level.', 'lobby.npc.difficultyHint', 'lobby.mode.']) {
      expect(src).not.toContain(id);
      expect(Object.keys(LOBBY_COPY).filter((key) => key.startsWith(id))).toEqual([]);
    }
  });
});
