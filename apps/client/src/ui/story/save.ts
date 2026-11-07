import type { StorySaveWire } from '@wdi/shared/protocol';

/**
 * The story save on this device (docs/accounts/plan.md 5, A1). The server decides when to save and what; it sends the
 * save in the private `story.saved`, this keeps it, and `story.start { resume }` hands it back. The client never
 * composes or edits a save: it stores what it was given, and the server re-validates it on resume. A damaged,
 * missing or blocked store is "no save", never a crash.
 *
 * `StorySaveStore` is the seam an account replaces: a signed-in player's slot lives on the server, so its `read`
 * gives the menu the summary it needs and `resume` sends nothing to forge.
 */
export interface StorySaveStore {
  read(storyId: string): StorySaveWire | null;
  write(save: StorySaveWire): void;
  clear(storyId: string): void;
}

const KEY = 'wdi:story:save';
type Slots = Record<string, StorySaveWire>;

/** The shape the menu relies on; everything else passes through to the server untouched. */
function looksLikeSave(x: unknown): x is StorySaveWire {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.storyId === 'string' &&
    (s.nextChapterId === null || typeof s.nextChapterId === 'string') &&
    Array.isArray(s.finished) &&
    s.finished.every((c) => typeof c === 'string') &&
    typeof s.rev === 'number' &&
    typeof s.savedAt === 'number'
  );
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function readSlots(storage: Pick<Storage, 'getItem'> | undefined): Slots {
  try {
    const raw = storage?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([id, save]) => looksLikeSave(save) && save.storyId === id),
    ) as Slots;
  } catch {
    return {};
  }
}

/** One slot per story (part2.md Q-P3). */
export function deviceSaveStore(storage: Storage | undefined = safeStorage()): StorySaveStore {
  const put = (slots: Slots) => {
    try {
      storage?.setItem(KEY, JSON.stringify(slots));
    } catch {
      /* a blocked or full store forgets; the story still plays */
    }
  };
  return {
    read: (storyId) => readSlots(storage)[storyId] ?? null,
    write(save) {
      if (!looksLikeSave(save)) return;
      const slots = readSlots(storage);
      const old = slots[save.storyId];
      if (old && old.rev > save.rev) return; // a late or replayed message never rolls a slot back
      put({ ...slots, [save.storyId]: save });
    },
    clear(storyId) {
      const { [storyId]: _gone, ...rest } = readSlots(storage);
      put(rest);
    },
  };
}
