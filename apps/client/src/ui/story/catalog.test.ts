import { describe, expect, it } from 'vitest';
import { storyCatalog } from './catalog';

describe('the story catalog', () => {
  it('lists the stories of story.json with their chapters', async () => {
    const stories = await storyCatalog(false);
    const story = stories.find((s) => s.id === 'hollowmere_winter');
    expect(story?.chapters.length).toBeGreaterThanOrEqual(1);
    for (const c of story?.chapters ?? []) expect(c.title.length).toBeGreaterThan(0);
  });

  it('lists the arc chapters, the ids the server puts on its cards, each with its summary line', async () => {
    const { content } = await import('@wdi/content');
    const arc = content.storyArc.stories['hollowmere_winter']!;
    const story = (await storyCatalog(false)).find((s) => s.id === 'hollowmere_winter')!;
    expect(story.chapters.map((c) => c.id)).toEqual(arc.chapters.map((c) => c.id));
    for (const c of story.chapters) expect(c.summary?.length).toBeGreaterThan(0);
  });

  it('lists the fixture story on the mock path', async () => {
    expect((await storyCatalog(true)).map((s) => s.id)).toEqual(['mock_story']);
  });
});
