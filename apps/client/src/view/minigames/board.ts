import type { CratesPublic, PourPublic, SlidePublic, StokePublic, TapPublic } from '@wdi/shared/rules';
import type { MinigameKind } from '@wdi/shared/protocol';

// Round 6 (6I, docs/round6/m5b-data.md 2.3): the main-mode mini-game wraps the widgets of `view/minigames/`, which
// build their own board from a `host.rng`. The server's board is the `public` of `S2C.minigameStart`, so
// `bandRng` feeds each widget the draws that rebuild that board; the widget's `answer()` is what the player did.

const clamp01 = (x: number): number => Math.min(0.999999, Math.max(0, x));

/**
 * The `rng` that makes a widget draw the server's board. Crates and stoke take one draw for the band, the pour one per
 * step, the tap one per band, the slide a Fisher-Yates shuffle (inverted so the shuffle lands on `order`). A widget that draws more than the
 * list holds gets the list again from its start.
 */
export function bandRng(kind: MinigameKind, pub: unknown): () => number {
  const draws = drawsOf(kind, pub);
  let i = 0;
  return () => draws[i++ % draws.length]!;
}

export function drawsOf(kind: MinigameKind, pub: unknown): number[] {
  switch (kind) {
    case 'crates': {
      const p = pub as CratesPublic;
      return [clamp01(p.bandStart / (1 - p.bandFrac))];
    }
    case 'pour': {
      const p = pub as PourPublic;
      const span = 0.95 - p.bandFrac - 0.25;
      return p.bands.map((b) => clamp01((b - 0.25) / span));
    }
    case 'stoke': {
      const p = pub as StokePublic;
      return [clamp01((p.bandStart - 0.3) / (0.6 - p.bandFrac))];
    }
    case 'tap': {
      const p = pub as TapPublic;
      return p.bands.map((b) => clamp01(b / (1 - p.bandFrac)));
    }
    case 'lockpick':
      return [0]; // drawn by its own board (round 10, D5b); no widget takes bands from the rng
    case 'slide': {
      const order = (pub as SlidePublic).order;
      const work = order.map((_, i) => i);
      const draws: number[] = [];
      for (let i = work.length - 1; i > 0; i--) {
        const j = work.indexOf(order[i]!);
        draws.push((j + 0.5) / (i + 1));
        [work[i], work[j]] = [work[j]!, work[i]!];
      }
      return draws.length > 0 ? draws : [0];
    }
  }
}
