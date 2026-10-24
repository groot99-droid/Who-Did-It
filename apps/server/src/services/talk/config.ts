/**
 * Where an NPC's meeting notes come from (GDD 3.25 "Talk"). The model id is configuration: `WDI_TALK_MODEL` in the
 * server environment, else the fast small model below. The key is read from `ANTHROPIC_API_KEY` at call time only
 * (`claude.ts`) and is never stored, logged or sent anywhere but the Messages API header.
 */
export const TALK_MODEL_DEFAULT = 'claude-haiku-5-5';

export const talkModel = (): string => process.env.WDI_TALK_MODEL?.trim() || TALK_MODEL_DEFAULT;

/** True when the server holds a key and is not under test; auto runs and replays are excluded by the caller. */
export const keyPresent = (): boolean =>
  (process.env.ANTHROPIC_API_KEY ?? '') !== '' && process.env.VITEST === undefined;
