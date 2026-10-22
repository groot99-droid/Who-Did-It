// Round 6 (M5c, GDD 3.18): which cutscene plays for a death or a map's opening. Pure: reads the cutscene index
// Session 6J passes in, never content directly. Pre-seeded by 6Z with null bodies; 6J fills them
// (docs/round6/cutscene-music.md 1.2).
import type { DeathCause } from '../protocol/index';

/** The `cutscenes.json` index: a cutscene id per death cause and per map, as `@wdi/content` parses it. */
export interface CutsceneIndex {
  deaths: Partial<Record<DeathCause, string>>;
  openings: Partial<Record<string, string>>;
}

/** The cutscene a `killed` of `cause` carries, or null for none (`vanished` never has one). */
export function deathCutsceneFor(_index: CutsceneIndex, _cause: DeathCause): string | null {
  return null; // 6J
}

/** The opening cutscene of a map, or null for none. */
export function openingFor(_index: CutsceneIndex, _mapId: string): string | null {
  return null; // 6J
}
