/**
 * Scene names by `NotebookEntry.sceneId` index. `@wdi/content` (zod and every data file) stays out of the
 * main bundle, so the names load on first use; until then the id is shown with underscores spelled out.
 */
let loaded: Promise<(index: number) => string> | null = null;

export function loadSceneNames(): Promise<(index: number) => string> {
  loaded ??= import('@wdi/content').then(({ SCENE_IDS, scenes }) => (index: number) => {
    const id = SCENE_IDS[index];
    return id === undefined
      ? 'Somewhere'
      : ((scenes as Record<string, { name?: string }>)[id]?.name ?? id.replaceAll('_', ' '));
  });
  return loaded;
}

/** The display name of a map by its id ("HollowMere"); the id itself until it loads. */
export function loadMapName(id: string): Promise<string> {
  return import('@wdi/content').then(
    ({ maps }) => (maps as Record<string, { name?: string }>)[id]?.name ?? id,
  );
}

/** The display name of a scene by its id ("The Drowned Lantern"); the id with underscores spelled out until it loads. */
export function loadSceneName(id: string): Promise<string> {
  return import('@wdi/content').then(
    ({ scenes }) => (scenes as Record<string, { name?: string }>)[id]?.name ?? id.replaceAll('_', ' '),
  );
}
