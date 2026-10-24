import minigames from '@wdi/content/data/minigames.json';
import type { MinigameKind } from '@wdi/shared/protocol';

/** The station a widget draws (`minigames.json` `skin`, A151 (3)): its object and the pieces, one per step. */
export interface MiniSkin {
  station: string;
  pieces: readonly string[];
}

/** Each kind's own station, for a board no `minigames.json` row names (a test's, or a task before its row). */
export const DEFAULT_SKINS: Record<MinigameKind, MiniSkin> = {
  crates: { station: 'cart', pieces: ['crate'] },
  pour: { station: 'bowl', pieces: ['flour', 'water'] },
  slide: { station: 'cabinet', pieces: ['banneton'] },
  stoke: { station: 'oven', pieces: ['oak'] },
  tap: { station: 'door', pieces: ['knock'] },
};

/** The skin of the row that plays `taskId`, or the kind's own. */
export function skinOf(taskId: string, kind: MinigameKind): MiniSkin {
  const row = Object.values(minigames.minigames).find((m) => m.task === taskId && m.kind === kind);
  return row?.skin ?? DEFAULT_SKINS[kind];
}

/** The piece of step `i`: the skin's list, the last one repeating. */
export const pieceAt = (skin: MiniSkin, i: number): string =>
  skin.pieces[Math.min(i, skin.pieces.length - 1)]!;
