import economy from '@wdi/content/data/economy.json';
import type { FxKind } from '../vfx/fxSpecs';

/** The tier frames every role station shares (`props` atlas, motion.md 2): the staked site, then each bought tier. */
export const HQ_TIERS = 4;
export const hqFrame = (tier: number): string =>
  `prop_hq_${Math.max(0, Math.min(HQ_TIERS - 1, Math.floor(tier)))}`;

/** Each station's prop ids on every map (`economy.json` `hq.stations[].props`), by station id. */
export function stationProps(
  stations: Readonly<Record<string, { props: Readonly<Record<string, string | undefined>> }>>,
): Array<[stationId: string, propId: string]> {
  return Object.entries(stations).flatMap(([id, s]) =>
    Object.values(s.props).flatMap((p) => (p ? [[id, p] as [string, string]] : [])),
  );
}

/** What the view needs of the statics and the effects: `StaticView.setFrame` and `VfxView.play`. */
export interface HqStatics {
  setFrame(id: string, frame: string): { x: number; y: number } | null;
}
export interface HqFx {
  play(kind: FxKind, wx: number, wy: number): void;
}

/**
 * The HQ stations of the scene (GDD 3.23): each station prop wears the frame of its bought tier, and a tier that rises
 * while you look on throws `buildDust` over it. A tier you first see (on joining, or a rise made while you were in
 * another scene) is drawn without dust, as 8D's panel plays none.
 */
export class HqView {
  /** The tier each station had at the last update, by station id; absent until the first. */
  private known: Map<string, number> | null = null;
  private readonly props: Array<[string, string]>;

  constructor(
    private readonly statics: HqStatics,
    private readonly fx: HqFx,
    stations: Parameters<typeof stationProps>[0] = economy.hq.stations,
  ) {
    this.props = stationProps(stations);
  }

  /** `tiers` is `feed.hqTiers()`: the bought tier by station id, a station absent is unbuilt. */
  update(tiers: Readonly<Record<string, number>>): void {
    const before = this.known;
    for (const [station, prop] of this.props) {
      const tier = tiers[station] ?? 0;
      const at = this.statics.setFrame(prop, hqFrame(tier));
      if (at && before !== null && tier > (before.get(station) ?? 0)) this.fx.play('buildDust', at.x, at.y);
    }
    this.known = new Map(this.props.map(([station]) => [station, tiers[station] ?? 0]));
  }

  destroy(): void {
    this.known = null;
  }
}
