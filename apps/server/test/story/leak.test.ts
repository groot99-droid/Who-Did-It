import { expect, it } from 'vitest';
import type { StoryCard, StoryGoals } from './fixture';
import { humanSeat, play, startStoryRoom, storyDef } from './fixture';
import { STORY_MAX_TICKS, describeStory, storyServer } from './suite';

// DoD 5 (README): the per-message leak check of DECISIONS A168 over the two private story messages, and the proof
// that no public field names a chapter, a role or a goal.

/** Payload keys that would carry a seat's secret (leak.test.ts `SECRET_KEYS`, the same list). */
const SECRET_KEYS = new Set(['roleId', 'role', 'team', 'cover', 'coverId', 'cooldowns', 'priv', 'notebook']);
const SEAT_KEYS = new Set(['id', 'seat', 'seatId', 'playerId', 'targetId']);
/** Keys no public field may be called, whatever it holds. */
const STORY_KEYS = new Set(['story', 'storyId', 'chapter', 'chapterId', 'chapters', 'goal', 'goals', 'beat']);

/** An object that names another seat beside a secret key (A168). */
function messageLeaks(viewerSeat: string, type: string, payload: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v === null || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    const other = [...SEAT_KEYS].some((k) => typeof o[k] === 'string' && o[k] !== '' && o[k] !== viewerSeat);
    if (other) for (const k of Object.keys(o)) if (SECRET_KEYS.has(k)) out.push(`${type}.${k}`);
    Object.values(o).forEach(walk);
  };
  walk(payload);
  return out;
}

/** Every key in the public part of the state (no `priv`, no `presence`: the player's own, view-tagged). */
function publicKeys(state: unknown): string[] {
  const keys: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (v === null || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === 'priv' || k === 'presence') continue;
      keys.push(`${path}.${k}`);
      walk(x, `${path}.${k}`);
    }
  };
  walk(state, 'state');
  return keys;
}

describeStory('the private story messages leak nothing (README DoD 5)', () => {
  const server = storyServer();

  it('every story.card and story.goals is for the player alone and names no other seat’s secret', async () => {
    const sr = await startStoryRoom(server.colyseus());
    // Anything the room broadcast to everyone is public: the story messages must never be among it.
    const broadcast: string[] = [];
    const room = sr.room as unknown as { broadcast: (t: unknown, ...a: unknown[]) => void };
    const original = room.broadcast.bind(room);
    room.broadcast = (t, ...a) => {
      broadcast.push(String(t));
      original(t, ...a);
    };
    const def = storyDef()!;
    const goalWords = def.chapters.flatMap((c) => c.goals.map((g) => g.id).filter((g): g is string => !!g));
    const storyIds = [def.id, ...def.chapters.map((c) => c.id), ...goalWords];
    let publicChecks = 0;
    try {
      const { finished } = play(sr, {
        maxTicks: STORY_MAX_TICKS,
        policy: (r, t) => {
          if (t % 50 !== 0) return;
          publicChecks++;
          const text = JSON.stringify(r.room.state.toJSON(), (k, v) =>
            k === 'priv' || k === 'presence' ? undefined : (v as unknown),
          );
          for (const id of storyIds) expect(text, `public state names ${id}`).not.toContain(`"${id}"`);
          const keys = publicKeys(r.room.state.toJSON()).filter((k) =>
            STORY_KEYS.has(k.slice(k.lastIndexOf('.') + 1)),
          );
          expect(keys, 'a public field is named for the story').toEqual([]);
        },
      });
      expect(finished).toBe(true);
      expect(publicChecks).toBeGreaterThan(10);

      const cards = sr.sent.filter((m) => m.type === 'story.card');
      const goals = sr.sent.filter((m) => m.type === 'story.goals');
      expect(cards.length).toBeGreaterThan(0);
      expect(goals.length).toBeGreaterThan(0);
      expect(broadcast.filter((t) => t.startsWith('story.'))).toEqual([]);

      for (const m of sr.sent) {
        expect(messageLeaks(humanSeat(sr), m.type, m.payload), `${m.type} at tick ${m.tick}`).toEqual([]);
      }
      // A card carries copy and counters only: no seat id anywhere in it.
      const seatIds = [...sr.room.state.players.keys()];
      for (const m of [...cards, ...goals]) {
        const text = JSON.stringify(m.payload as StoryCard | StoryGoals);
        for (const id of seatIds) expect(text, `${m.type} names seat ${id}`).not.toContain(id);
      }
    } finally {
      await sr.room.disconnect();
    }
  });
});
