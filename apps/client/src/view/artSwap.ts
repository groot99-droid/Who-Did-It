import Phaser from 'phaser';
import { ART_STYLE_CHANGED, onArtStyleChanged, registerSwitcher } from './artStyle';
import {
  type LoadedEntry,
  applyFilters,
  changedEntries,
  entryUrl,
  loadedSource,
  markLoaded,
  queueEntries,
  resolveManifest,
} from './assets';

// The mid-match art-style swap (A79): queue the new style's entries under temporary keys, and once they are all in,
// replace each texture by key in one synchronous step, re-apply the filters and rebuild the animations. Views then
// refresh from `art-style-changed`. A failed load leaves the old textures untouched.

const STAGE = '__art__';
const staged = (key: string) => `${STAGE}${key}`;

interface AnimFile {
  anims?: Array<{ key: string }>;
}

function stageLoad(scene: Phaser.Scene, run: (load: Phaser.Loader.LoaderPlugin) => void): Promise<void> {
  const load = scene.load;
  return new Promise((resolve, reject) => {
    if (!load.isReady()) {
      reject(new Error('loader busy'));
      return;
    }
    const failed: string[] = [];
    run(load);
    if (load.list.size === 0) {
      resolve();
      return;
    }
    load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => failed.push(file.key));
    load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (failed.length > 0) reject(new Error(`art files failed to load: ${failed.join(', ')}`));
      else resolve();
    });
    load.start();
  });
}

export async function swapArtStyle(
  game: Phaser.Game,
  art: 'default' | 'placeholder',
  base: string,
  id: string,
): Promise<void> {
  // The placeholder set overrides every style: nothing to swap.
  if (art === 'placeholder') return;
  const next = await resolveManifest(art, base, id);
  const textures = game.textures;
  const changed = changedEntries(
    next.entries,
    (e) => (e.type === 'animation' ? game.cache.json.exists(e.key) : textures.exists(e.key)),
    (e) => entryUrl(next, e),
    loadedSource,
  );
  const scene = game.scene.getScenes(true)[0];
  if (changed.length > 0 && scene === undefined) throw new Error('no active scene to load with');
  const texEntries = changed.filter((e) => e.type !== 'animation');
  const animEntries = changed.filter((e) => e.type === 'animation');

  if (scene !== undefined && changed.length > 0) {
    try {
      await stageLoad(scene, (load) => {
        queueEntries(load, next, texEntries, staged);
        for (const e of animEntries) load.json(staged(e.key), entryUrl(next, e));
      });
    } catch (err) {
      for (const e of texEntries) if (textures.exists(staged(e.key))) textures.remove(staged(e.key));
      for (const e of animEntries) game.cache.json.remove(staged(e.key));
      throw err;
    }
  }

  // Commit, all in one synchronous step: no frame renders between the removal and the rename.
  for (const e of texEntries) {
    textures.remove(e.key);
    textures.renameTexture(staged(e.key), e.key);
    markLoaded(next, e);
  }
  for (const e of animEntries) {
    game.cache.json.remove(e.key);
    game.cache.json.add(e.key, game.cache.json.get(staged(e.key)));
    game.cache.json.remove(staged(e.key));
    markLoaded(next, e);
  }
  applyFilters(textures, next);
  rebuildAnimations(
    game,
    next.entries.filter((e) => e.type === 'animation'),
  );
}

/** Animation frames hold the old Frame objects: re-create every animation the manager already knows. */
function rebuildAnimations(game: Phaser.Game, entries: readonly LoadedEntry[]): void {
  for (const e of entries) {
    const data = game.cache.json.get(e.key) as AnimFile | undefined;
    const known = (data?.anims ?? []).filter((a) => game.anims.exists(a.key));
    if (data === undefined || known.length === 0) continue;
    for (const a of known) game.anims.remove(a.key);
    game.anims.fromJSON(data as never);
  }
}

/** Wires the switch to this game: `requestArtStyle` swaps the textures, then `art-style-changed` fires on `game.events`. */
export function installArtSwitch(game: Phaser.Game, art: 'default' | 'placeholder', base: string): void {
  registerSwitcher((id) => swapArtStyle(game, art, base, id));
  onArtStyleChanged((id) => game.events.emit(ART_STYLE_CHANGED, id));
}
