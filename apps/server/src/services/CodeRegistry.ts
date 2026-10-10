import { randomInt } from 'node:crypto';
import type { Presence } from '@colyseus/core';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@wdi/shared';

const CODES_KEY = 'wdi:codes';
/** Released codes stay reserved this long before reuse (ARCHITECTURE 5.3). */
export const CODE_RELEASE_TTL_MS = 30 * 60 * 1000;

export function randomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

/** Draws unique 5-character join codes; uniqueness lives in `presence` (a Redis set later, in memory now). */
export class CodeRegistry {
  /** Claimed synchronously so two concurrent creates cannot draw the same code before presence answers. */
  private readonly claimed = new Set<string>();

  constructor(
    private readonly presence: Presence,
    private readonly ttlMs = CODE_RELEASE_TTL_MS,
  ) {}

  async claim(draw: () => string = randomCode): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = draw();
      if (this.claimed.has(code)) continue;
      this.claimed.add(code);
      if (await this.presence.sismember(CODES_KEY, code)) {
        this.claimed.delete(code);
        continue;
      }
      await this.presence.sadd(CODES_KEY, code);
      return code;
    }
    throw new Error('could not draw a unique room code');
  }

  /** Called on dispose; the code becomes drawable again after the TTL. */
  release(code: string): void {
    setTimeout(() => {
      this.claimed.delete(code);
      void this.presence.srem(CODES_KEY, code);
    }, this.ttlMs).unref();
  }
}
