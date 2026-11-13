import type { Content } from './validate.js';

/**
 * Achievements (GDD 3.28): keys match ids, `after` names real achievements and never loops, every tree exists, step ids
 * are unique inside an achievement, and the story ids a step names are in `story.json`.
 */
export function checkAchievements(
  c: Pick<Content, 'achievements' | 'story'>,
  err: (msg: string) => void,
): void {
  const { achievements, trees } = c.achievements;
  const chapters = new Set<string>();
  const goals = new Set<string>();
  for (const story of Object.values(c.story.stories))
    for (const ch of story.chapters) {
      chapters.add(ch.id);
      for (const g of ch.goals) goals.add(g.id);
    }
  for (const [key, a] of Object.entries(achievements)) {
    const at = `achievements.json ${key}`;
    if (key !== a.id) err(`${at}: key holds achievement ${a.id}`);
    if (!(a.tree in trees)) err(`${at}: unknown tree ${a.tree}`);
    for (const p of a.after) {
      if (!(p in achievements)) err(`${at}: after names unknown achievement ${p}`);
      if (p === key) err(`${at}: grows from itself`);
    }
    const seen = new Set<string>();
    for (const s of a.steps) {
      const sat = `${at} step ${s.id}`;
      if (seen.has(s.id)) err(`${sat}: repeated step id`);
      seen.add(s.id);
      if (s.on.startsWith('story.') && s.who === 'seat')
        err(`${sat}: story events name no seat, use who "humans"`);
      const chapterId = s.where.chapterId;
      if (chapterId !== undefined && s.on.startsWith('story.') && !chapters.has(String(chapterId)))
        err(`${sat}: unknown chapter ${String(chapterId)}`);
      const goal = s.where.goal;
      if (goal !== undefined && s.on === 'story.goal' && !goals.has(String(goal)))
        err(`${sat}: unknown goal ${String(goal)}`);
    }
  }
  // A tree of achievements has no cycle: walk each one's parents.
  for (const key of Object.keys(achievements)) {
    const stack = [...(achievements[key]?.after ?? [])];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (next === key) {
        err(`achievements.json ${key}: after loops back to itself`);
        break;
      }
      if (visited.has(next)) continue;
      visited.add(next);
      stack.push(...(achievements[next]?.after ?? []));
    }
  }
  for (const t of Object.keys(trees))
    if (!Object.values(achievements).some((a) => a.tree === t))
      err(`achievements.json: tree ${t} has no achievement`);
}
