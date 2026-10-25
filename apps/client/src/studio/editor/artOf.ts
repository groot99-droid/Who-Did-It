// Round 9 (9U, docs/round9/admin-studio.md 3): the world art of an edited scene. The editor draws outlines from
// `session.scene`; this turns the same scene into the tilemap and static sprites the World draws, so a moved or deleted
// prop, a painted wall or a new floor shows in the real art. Pure: the caller says which atlas frames exist.
import { type Scene } from '@wdi/content';
import { tilemapFor } from '@wdi/content/tilemap';
import { mapStatics, type DefContext } from '../../view/mapDefs';
import { readSceneMap, type SceneMap, type TiledMap } from '../../view/sceneMap';
import type { StaticDef } from '../../view/statics';

/** The tilemap document of a scene, built in the browser the way the exporter builds `tilemap.json`. */
export const tilemapOf = (scene: Scene): TiledMap => tilemapFor(scene) as TiledMap;

export const mapOfScene = (scene: Scene): SceneMap => readSceneMap(tilemapOf(scene));

/** Every static sprite of the scene as it stands now. */
export function staticsOfScene(scene: Scene, ctx: Pick<DefContext, 'hasFrame'>): StaticDef[] {
  const map = mapOfScene(scene);
  return mapStatics(map, { mapId: map.mapId ?? '', theme: map.theme ?? '', hasFrame: ctx.hasFrame });
}
