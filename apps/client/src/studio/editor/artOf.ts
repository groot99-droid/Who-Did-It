// Round 9 (9U, docs/round9/admin-studio.md 3): the world art of an edited scene. The editor draws outlines from
// `session.scene`; this turns the same scene into the tilemap and static sprites the World draws, so a moved or deleted
// prop, a painted wall or a new floor shows in the real art. Pure: the caller says which atlas frames exist.
import { mapOf, type Scene, type SceneId } from '@wdi/content';
import { tilemapFor } from '@wdi/content/tilemap';
import { mapStatics, propAtlases, propStems, type DefContext } from '../../view/mapDefs';
import { readSceneMap, type SceneMap, type TiledMap } from '../../view/sceneMap';
import { sliceFrame, turnedStem, type StaticDef } from '../../view/statics';
import type { Pick as Choice } from './sceneEdit';

/** The tilemap document of a scene, built in the browser the way the exporter builds `tilemap.json`. */
export const tilemapOf = (scene: Scene): TiledMap => tilemapFor(scene) as TiledMap;

export const mapOfScene = (scene: Scene): SceneMap => readSceneMap(tilemapOf(scene));

/** Every static sprite of the scene as it stands now. */
export function staticsOfScene(scene: Scene, ctx: Pick<DefContext, 'hasFrame'>): StaticDef[] {
  const map = mapOfScene(scene);
  return mapStatics(map, { mapId: map.mapId ?? '', theme: map.theme ?? '', hasFrame: ctx.hasFrame });
}

/** True when a turned prop or building has no art of its own for its angle yet, so the World draws a mirrored stand-in. */
export function lacksTurnArt(scene: Scene, pick: Choice, hasFrame: DefContext['hasFrame']): boolean {
  const mapId = mapOf(scene.id as SceneId);
  if (pick.kind === 'buildings') {
    const b = (scene.buildings ?? []).find((e) => e.id === pick.id);
    if (b?.rot === undefined) return false;
    return !hasFrame(`bld_${mapId}`, sliceFrame(turnedStem(b.art, b.rot), 0, 0));
  }
  const p = pick.kind === 'props' ? scene.props.find((e) => e.id === pick.id) : undefined;
  if (p?.rot === undefined) return false;
  const frames = propStems(p.kind, p.id).map((s) => {
    const name = `prop_${turnedStem(s, p.rot!)}`;
    return p.footprint === undefined ? name : `${name}#0_0`;
  });
  return !propAtlases({ mapId, theme: '', hasFrame }).some((a) => frames.some((f) => hasFrame(a, f)));
}
