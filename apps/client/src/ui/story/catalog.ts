import { MOCK_STORY_CATALOG } from '../../net/mock/storyMock';
import type { StoryCatalogEntry } from './model';

/**
 * The stories the title screen lists: every story of `story.json` through `@wdi/content`, as the arc's chapters (the
 * server's cards and saves name the arc chapter, P2's #479), each with its set-up line and its one-line end-screen
 * summary. The mock path lists the fixture story instead.
 */
export async function storyCatalog(mock: boolean): Promise<StoryCatalogEntry[]> {
  if (mock) return MOCK_STORY_CATALOG;
  try {
    const { content } = await import('@wdi/content');
    return Object.values(content.storyArc.stories).map((s) => ({
      id: s.id,
      title: s.title,
      blurb: s.blurb,
      chapters: s.chapters.map((c) => ({ id: c.id, title: c.title, setup: c.setup, summary: c.summary })),
    }));
  } catch {
    return []; // no catalog, no Story entry; the rest of the menu still works
  }
}
