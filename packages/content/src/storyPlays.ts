import type { RolesFile } from './schemas/roles.js';
import type {
  ArcAction,
  ArcChapter,
  ArcStory,
  Chapter,
  Section,
  Story,
  StoryAction,
  StoryArcFile,
  StoryFile,
} from './schemas/story.js';

/**
 * The part-1 view of the arc (docs/story/arc.md 5, P1): every section of every chapter becomes one *play* in the
 * part-1 `Chapter` shape, in order, so the engine, the client and the tests that read `story` keep working until the
 * engine reads sections (P2), which then retires this view. What the view cannot carry is left out: a chapter's own
 * title card, `cast`, `npcVendetta`, `startWhen` and `hitman` (each an engine need of arc 4.2). A spoken line (`say`) becomes
 * a beat card under the speaking card's name and look.
 */
export function storyPlays(arc: StoryArcFile, roles: RolesFile): StoryFile {
  const stories: Record<string, Story> = {};
  for (const [key, story] of Object.entries(arc.stories)) stories[key] = playsOf(story, roles);
  return { gddRef: arc.gddRef, stories };
}

function playsOf(story: ArcStory, roles: RolesFile): Story {
  const { chapters, full: _full, ...rest } = story;
  return { ...rest, chapters: chapters.flatMap((ch) => ch.sections.map((s, i) => play(ch, s, i, roles))) };
}

function play(ch: ArcChapter, s: Section, i: number, roles: RolesFile): Chapter {
  const last = i === ch.sections.length - 1;
  const card = last ? ch.end : (s.endCard ?? ch.end);
  return {
    id: s.id,
    title: s.title,
    setup: s.setup,
    roleId: s.roleId,
    ...(s.look !== undefined && { look: s.look }),
    ...(s.vendetta !== undefined && { vendetta: s.vendetta }),
    startPhase: s.startPhase ?? ch.startPhase,
    goals: s.goals,
    beats: s.beats.map((b) => ({ ...b, action: flatAction(b.action, roles) })),
    end: { trigger: s.end, ...card },
    ...(s.handOn !== undefined && { handOn: s.handOn }),
  };
}

/** A `say` becomes a beat card; everything else is already a part-1 action. */
export function flatAction(a: ArcAction, roles: RolesFile): StoryAction {
  if ('seq' in a) return { seq: a.seq.map((x) => flatAction(x, roles)) };
  if (!('say' in a)) return a;
  const { text, by, speaker, portrait, goal } = a.say;
  const card = by !== undefined ? roles.roles[by] : undefined;
  const name = speaker ?? card?.name;
  const look = portrait ?? card?.look ?? undefined;
  return {
    card: 'beat',
    line: text,
    ...(name !== undefined && { speaker: name }),
    ...(look !== undefined && { portrait: look }),
    ...(goal !== undefined && { goal }),
  };
}

/** The cards of roles.json that no section plays and no line's `by` names (part2.md Q-P2), in roles.json order. */
export function storyCoverage(story: ArcStory, roles: RolesFile): string[] {
  const seen = new Set<string>();
  const walk = (a: ArcAction): void => {
    if ('seq' in a) a.seq.forEach(walk);
    else if ('say' in a && a.say.by !== undefined) seen.add(a.say.by);
  };
  for (const ch of story.chapters)
    for (const s of ch.sections) {
      seen.add(s.roleId);
      s.beats.forEach((b) => walk(b.action));
    }
  return Object.keys(roles.roles).filter((r) => !seen.has(r));
}
