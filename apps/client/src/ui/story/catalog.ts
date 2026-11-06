import { MOCK_STORY_CATALOG } from '../../net/mock/storyMock';
import type { StoryCatalogEntry } from './model';

/**
 * The stories the title screen lists. The mock path lists the fixture story. The real list will read `stories` from
 * `@wdi/content` once S1's `story.json` and schema merge (docs/story/README.md 1); until then the real title screen
 * has no Story entry, because there is no story to start.
 */
export const storyCatalog = (mock: boolean): StoryCatalogEntry[] => (mock ? MOCK_STORY_CATALOG : []);
