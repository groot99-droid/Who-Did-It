// Round 6 (M5c, GDD 3.18): which cutscene plays for a death or a map's opening. Pure: reads the cutscene index
// the caller passes in, never content directly (docs/round6/cutscene-music.md 1.2).
import type { DeathCause } from '../protocol/index';

/** The `cutscenes.json` index: a cutscene id per death cause and per map, as `@wdi/content` parses it. */
export interface CutsceneIndex {
  deaths: Partial<Record<DeathCause, string>>;
  openings: Partial<Record<string, string>>;
}

/** The cutscene a `killed` of `cause` carries, or null for none (`vanished` never has one). */
export function deathCutsceneFor(index: CutsceneIndex, cause: DeathCause): string | null {
  if (cause === 'vanished') return null;
  return Object.hasOwn(index.deaths, cause) ? (index.deaths[cause] ?? null) : null;
}

/** The opening cutscene of a map, or null for none. */
export function openingFor(index: CutsceneIndex, mapId: string): string | null {
  return Object.hasOwn(index.openings, mapId) ? (index.openings[mapId] ?? null) : null;
}
