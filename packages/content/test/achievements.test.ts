import { describe, expect, it } from 'vitest';
import { AchievementsFile, content, validateContent, type Content } from '../src/index.js';

// Round 10, E1 (GDD 3.28): the schema and the cross-file checks of achievements.json.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy).filter((e) => e.startsWith('achievements.json'));
}

describe('achievements.json', () => {
  it('ships valid and has story and match trees that branch', () => {
    expect(broken(() => undefined)).toEqual([]);
    const { achievements, trees } = content.achievements;
    expect(Object.keys(trees)).toContain('story');
    const children = new Map<string, number>();
    for (const a of Object.values(achievements))
      for (const p of a.after) children.set(p, (children.get(p) ?? 0) + 1);
    expect([...children.values()].some((n) => n >= 2)).toBe(true); // a branch
    expect(Object.values(achievements).some((a) => a.steps.length >= 3)).toBe(true); // a long chain of steps
  });

  it('names no trial step (they wait on B6)', () => {
    const kinds = Object.values(content.achievements.achievements).flatMap((a) => a.steps.map((s) => s.on));
    expect(kinds.filter((k) => k.startsWith('tribunal'))).toEqual([]);
  });

  it('rejects an unknown kind, parent, tree and chapter', () => {
    const bad = structuredClone(content.achievements) as unknown as {
      achievements: Record<string, { steps: Array<{ on: string }> }>;
    };
    bad.achievements['oddJobs']!.steps[0]!.on = 'nope';
    expect(AchievementsFile.safeParse(bad).success).toBe(false);
    expect(broken((c) => (c.achievements.achievements['oddJobs']!.after = ['ghost']))).toEqual([
      expect.stringContaining('unknown achievement ghost'),
    ]);
    expect(broken((c) => (c.achievements.achievements['oddJobs']!.tree = 'ghost'))).toEqual([
      expect.stringContaining('unknown tree ghost'),
    ]);
    expect(
      broken((c) => (c.achievements.achievements['bakerDone']!.steps[0]!.where.chapterId = 'ghost')),
    ).toEqual([expect.stringContaining('unknown chapter ghost')]);
  });

  it('rejects a loop and a story step with no humans', () => {
    expect(broken((c) => (c.achievements.achievements['oddJobs']!.after = ['hauler']))[0]).toContain('loops');
    expect(broken((c) => (c.achievements.achievements['firstGoal']!.steps[0]!.who = 'seat'))).toEqual([
      expect.stringContaining('name no seat'),
    ]);
  });
});
