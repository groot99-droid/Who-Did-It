import { MOCK_STORY_CATALOG } from '../../net/mock/storyMock';
import type { StoryCatalogEntry } from './model';

/**
 * The stories the title screen lists: every story of `story.json` through `@wdi/content`, with its chapters' titles and
 * set-up lines (docs/story/README.md 1). The mock path lists the fixture story instead.
 */
export async function storyCatalog(mock: boolean): Promise<StoryCatalogEntry[]> {
  if (mock) return MOCK_STORY_CATALOG;
  try {
    const { content } = await import('@wdi/content');
    // The engine still plays one part-1 chapter per section (P2 retires `storyPlays`); the end screen's one-line summary
    // is the arc chapter's that holds the section.
    const arc = content.storyArc.stories;
    const summaryOf = (storyId: string, sectionId: string): string | undefined =>
      arc[storyId]?.chapters.find((ch) => ch.sections.some((sec) => sec.id === sectionId))?.summary;
    return Object.values(content.story.stories).map((s) => ({
      id: s.id,
      title: s.title,
      blurb: s.blurb,
      chapters: s.chapters.map((c) => {
        const summary = summaryOf(s.id, c.id);
        return { id: c.id, title: c.title, setup: c.setup, ...(summary ? { summary } : {}) };
      }),
    }));
  } catch {
    return []; // no catalog, no Story entry; the rest of the menu still works
  }
}
