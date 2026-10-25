// Round 9 (9U, docs/round9/admin-studio.md 8): the Studio's four modes and the switch other modes register a panel
// with. World and Room are the scene editor scoped by a scene's `kind`; Overview and NPC are built by their own
// sessions and plug in through `registerMode`, so the header toggle never needs to know them. Pure, so it is tested.
import { scenes, type Scene } from '@wdi/content';
import type { StudioC2SPayloads, StudioC2SType } from '@wdi/shared/protocol';
import type { Screen } from '../ui/dom';

export const STUDIO_MODES = ['overview', 'world', 'room', 'npc'] as const;
export type StudioMode = (typeof STUDIO_MODES)[number];

/** What a mode's panel is handed when it is mounted: the DOM root to append to, and the Studio's command channel. */
export interface ModeContext {
  root: HTMLElement;
  send: <K extends StudioC2SType>(type: K, payload: StudioC2SPayloads[K]) => void;
  /** The scene the Studio room is in. */
  sceneId: () => string | null;
}

/** A mode's side panel: mounted when the mode is picked, destroyed when another is. */
export type ModePanel = (ctx: ModeContext) => Screen;

/** World and Room need no panel of their own: the editor and the scene list are theirs. */
const panels = new Map<StudioMode, ModePanel>();

/** Adds a mode to the header toggle. Returns the call that removes it again. */
export function registerMode(mode: StudioMode, panel: ModePanel): () => void {
  panels.set(mode, panel);
  return () => {
    if (panels.get(mode) === panel) panels.delete(mode);
  };
}
export const panelOf = (mode: StudioMode): ModePanel | undefined => panels.get(mode);

/** The modes the toggle offers, in the owner's order: World and Room always, the others once they are registered. */
export const availableModes = (): StudioMode[] =>
  STUDIO_MODES.filter((m) => m === 'world' || m === 'room' || panels.has(m));

const kindOf = (id: string): Scene['kind'] | undefined =>
  (scenes as unknown as Record<string, Scene>)[id]?.kind;

/** The map mode a scene belongs to: an interior is the Room editor's, anything else the World editor's. */
export const modeOfScene = (id: string): 'world' | 'room' => (kindOf(id) === 'interior' ? 'room' : 'world');

/** The scenes a mode lists: World the exteriors, Room the interiors, Overview and NPC every scene. */
export function scenesFor(mode: StudioMode, ids: readonly string[]): string[] {
  if (mode !== 'world' && mode !== 'room') return [...ids];
  return ids.filter((id) => modeOfScene(id) === mode);
}
