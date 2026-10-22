import {
  stokeSucceeds,
  type CratesAnswer,
  type CratesPublic,
  type PourAnswer,
  type PourPublic,
  type SlideAnswer,
  type SlidePublic,
  type StokeAnswer,
  type StokePublic,
} from '@wdi/shared/rules';
import type { MinigameKind } from '@wdi/shared/protocol';

// Round 6 (6I, docs/round6/m5b-data.md 2.3): the main-mode mini-game wraps the ONUB widgets of `view/onub/minigames/`,
// which are 5C's files and build their own board from a `host.rng` and report only "done". The server's board is the
// `public` of `S2C.minigameStart`, so (1) `bandRng` feeds each widget the draws that rebuild that board where the
// widget's own step count allows it, and (2) `answerOf` writes the answer record `checkMinigame` replays from the
// same `public` once the widget reports done. Contract request: the widgets expose what the player did (`answer()`),
// and this file shrinks to (1).

const clamp01 = (x: number): number => Math.min(0.999999, Math.max(0, x));

/**
 * The `rng` that makes a widget draw the server's board. Crates and stoke take one draw for the band, the pour one per
 * step, the slide a Fisher-Yates shuffle (inverted so the shuffle lands on `order`). A widget that draws more than the
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

/** Taps (ascending seconds) that keep the fire in its band for `holdS`; empty when the board cannot be won. */
export function solveStoke(p: StokePublic): number[] {
  const target = p.bandStart + p.bandFrac / 2;
  const dt = 0.05;
  const taps: number[] = [];
  let heat = 0;
  for (let t = 0; t < 120; t += dt) {
    if (heat + p.stokePerTap <= Math.min(1, p.bandStart + p.bandFrac) && heat < target - p.stokePerTap / 2) {
      taps.push(Math.round(t * 100) / 100);
      heat = Math.min(1, heat + p.stokePerTap);
    }
    heat = Math.max(0, heat - p.ratePerS * dt);
    if (stokeSucceeds(p, taps)) return taps;
  }
  return [];
}

export type MinigameAnswer = CratesAnswer | PourAnswer | SlideAnswer | StokeAnswer;

/** The answer record for a board the widget has just reported done. */
export function answerOf(kind: MinigameKind, pub: unknown): MinigameAnswer {
  switch (kind) {
    case 'crates': {
      const p = pub as CratesPublic;
      return { placed: p.steps, stop: p.bandStart + p.bandFrac / 2 };
    }
    case 'pour': {
      const p = pub as PourPublic;
      return { holdsS: p.bands.map((b) => (b + p.bandFrac / 2) / p.ratePerS) };
    }
    case 'slide':
      return { slots: [...(pub as SlidePublic).order] };
    case 'stoke':
      return { taps: solveStoke(pub as StokePublic) };
  }
}
