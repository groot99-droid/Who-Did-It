import { registerInvariant } from '../auto/invariants';
import { isNpcSeat } from '../Npc';
import { storyOf } from './Story';

// Story mode (docs/story/README.md 2): exactly one human seat at all times, and it is the story's own seat id.
registerInvariant('storyOneHuman', (room) => {
  const story = storyOf(room);
  if (story === null) return null;
  const humans = [...room.state.players.keys()].filter((id) => !isNpcSeat(room, id));
  if (humans.length === 1 && humans[0] === story.humanId) return null;
  return {
    name: '',
    tick: room.state.tick,
    detail: `story seats: humans [${humans.join(',')}], expected ${story.humanId}`,
  };
});

// Story mode: a chapter's beats fire once each, and only the running chapter's own beats.
registerInvariant('storyBeatsOnce', (room) => {
  const state = storyOf(room);
  if (state === null || state.chapterIdx < 0) return null;
  const own = new Set(state.story.chapters[state.chapterIdx]?.beats.map((b) => b.id));
  const seen = new Set<string>();
  for (const id of state.fired) {
    if (seen.has(id) || !own.has(id))
      return { name: '', tick: room.state.tick, detail: `beat ${id} fired twice or outside its chapter` };
    seen.add(id);
  }
  return null;
});
