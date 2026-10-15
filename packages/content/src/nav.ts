// The nav bitmaps written by tools/grid/export.ts (docs/ASSETS.md 6.3): one `<scene>.nav.json` beside
// each scene file. Server and client load them through `@wdi/shared` `createNavGrid`; the Tiled
// exporter of M6 writes the same shape.
import { z } from 'zod';
import overworld from '../data/scenes/overworld.nav.json' with { type: 'json' };
import tavernBar from '../data/scenes/tavern_bar.nav.json' with { type: 'json' };
import tavernBack from '../data/scenes/tavern_back.nav.json' with { type: 'json' };
import apothShop from '../data/scenes/apoth_shop.nav.json' with { type: 'json' };
import apothLoft from '../data/scenes/apoth_loft.nav.json' with { type: 'json' };
import widowParlour from '../data/scenes/widow_parlour.nav.json' with { type: 'json' };
import widowBedroom from '../data/scenes/widow_bedroom.nav.json' with { type: 'json' };
import forest from '../data/scenes/forest.nav.json' with { type: 'json' };
import bakery from '../data/scenes/bakery.nav.json' with { type: 'json' };
import caveEntry from '../data/scenes/cave_entry.nav.json' with { type: 'json' };
import manorHall from '../data/scenes/manor_hall.nav.json' with { type: 'json' };
import manorUpper from '../data/scenes/manor_upper.nav.json' with { type: 'json' };
import barn from '../data/scenes/barn.nav.json' with { type: 'json' };
import chapel from '../data/scenes/chapel.nav.json' with { type: 'json' };
import cellar from '../data/scenes/cellar.nav.json' with { type: 'json' };
import { Profile } from './schemas/balance.js';
import { SCENE_IDS, type SceneId } from './schemas/scene.js';

export const NavFile = z
  .strictObject({
    version: z.literal(1),
    sceneId: z.string(),
    tile: z.number().int().positive(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    /** `h` rows of `w` characters, '1' solid and '0' walkable. */
    solid: z.array(z.string().regex(/^[01]+$/)),
    gates: z.array(
      z.strictObject({
        id: z.string(),
        minProfile: Profile,
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
        w: z.number().int().positive(),
        h: z.number().int().positive(),
      }),
    ),
  })
  .refine((n) => n.solid.length === n.h && n.solid.every((r) => r.length === n.w), {
    message: 'solid must be h rows of w characters',
  });
export type NavFile = z.infer<typeof NavFile>;

const navJson: Record<SceneId, unknown> = {
  overworld,
  tavern_bar: tavernBar,
  tavern_back: tavernBack,
  apoth_shop: apothShop,
  apoth_loft: apothLoft,
  widow_parlour: widowParlour,
  widow_bedroom: widowBedroom,
  forest,
  bakery,
  cave_entry: caveEntry,
  manor_hall: manorHall,
  manor_upper: manorUpper,
  barn,
  chapel,
  cellar,
};

function parseNavs(): Record<SceneId, NavFile> {
  const out = {} as Record<SceneId, NavFile>;
  for (const id of SCENE_IDS) {
    const nav = NavFile.parse(navJson[id]);
    if (nav.sceneId !== id) throw new Error(`${id}.nav.json names scene ${nav.sceneId}`);
    out[id] = nav;
  }
  return out;
}

/** Every scene's nav bitmap, validated at import. */
export const navs: Record<SceneId, NavFile> = parseNavs();
