// Round 9 (9W, N3): the NPC editor's pure edits on `routines.json`: each returns a new file. Rows keep the file's key
// order (maps, look, named, fixed, stations) so a save diffs only what changed. Role secrecy: nothing here reads or
// writes a card; `look` and the seat roles are not touched.
import { content, MAP_IDS, RoutinesFile, validateContent, type MapId, type RoutineHold } from '@wdi/content';

export type Edit = { routines: RoutinesFile } | { error: string };

const ordered = (row: RoutinesFile['townsfolk'][string], over: Partial<typeof row>) => {
  const r = { ...row, ...over };
  return {
    ...(r.maps === undefined ? {} : { maps: r.maps }),
    look: r.look,
    named: r.named,
    fixed: r.fixed,
    stations: r.stations,
  };
};

function withRow(r: RoutinesFile, id: string, over: Partial<RoutinesFile['townsfolk'][string]>): Edit {
  const row = r.townsfolk[id];
  if (row === undefined) return { error: `${id} is not a townsfolk kind` };
  return { routines: { ...r, townsfolk: { ...r.townsfolk, [id]: ordered(row, over) } } };
}

/** Sets a kind's stations (prop kinds in route order). */
export const setStations = (r: RoutinesFile, id: string, stations: string[]): Edit =>
  withRow(r, id, { stations });
export const setFixed = (r: RoutinesFile, id: string, fixed: boolean): Edit => withRow(r, id, { fixed });

/** Sets the maps a kind walks; none means every map (the key goes). */
export function setMaps(r: RoutinesFile, id: string, maps: MapId[]): Edit {
  const known = maps.filter((m) => (MAP_IDS as readonly string[]).includes(m));
  return withRow(r, id, { maps: known.length === 0 ? undefined : known });
}

/** Sets the hold a human starts at a prop kind (and an NPC works with only there); null removes it. */
export function setHold(r: RoutinesFile, propKind: string, hold: RoutineHold | null): Edit {
  const holds = { ...r.holds };
  if (hold === null) delete holds[propKind];
  else holds[propKind] = hold;
  return { routines: { ...r, holds } };
}

/** The errors an edit adds: the file's schema and `validateContent` with the edit in place, less what the committed file already says. */
export function newErrors(edited: RoutinesFile): string[] {
  const check = (r: RoutinesFile): string[] => {
    const parsed = RoutinesFile.safeParse(r);
    if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return validateContent({ ...content, routines: r });
  };
  const before = new Set(check(content.routines));
  return check(edited).filter((e) => !before.has(e));
}
