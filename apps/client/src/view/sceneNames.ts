/**
 * Scene names by `NotebookEntry.sceneId` index. `@wdi/content` (zod and every data file) stays out of the
 * main bundle, so the names load on first use; until then the id is shown with underscores spelled out.
 */
let loaded: Promise<(index: number) => string> | null = null;

export function loadSceneNames(): Promise<(index: number) => string> {
  loaded ??= import('@wdi/content').then(({ SCENE_IDS, scenes }) => (index: number) => {
    const id = SCENE_IDS[index];
    return id === undefined ? 'Somewhere' : (scenes[id]?.name ?? id.replaceAll('_', ' '));
  });
  return loaded;
}
