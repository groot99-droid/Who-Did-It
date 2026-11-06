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
