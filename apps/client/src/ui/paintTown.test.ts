import { describe, expect, it } from 'vitest';
import balance from '@wdi/content/data/balance.json';
import { paintTarget } from '@wdi/shared/rules';
import { LOOKS_COPY, fill } from './copy';
import { paintLines, won } from './GameOver';
import { winnerLine } from './meetingText';

// Round 10, C5b (GDD 3.8; phases.md 7 rows 243 and 271; UI.md 14.47): Paint The Town Red's screens.

const over = {
  winner: 4,
  roles: { a: 'killer', b: 'killer', c: 'baker' },
  summary: '',
  paintTown: {
    target: 3,
    killers: [
      { seatId: 'a', unique: 2, total: 2 },
      { seatId: 'b', unique: 1, total: 4 },
    ],
  },
};
const names: Record<string, string> = { a: 'Ada', b: 'Bo' };

describe('the Paint The Town Red end screen', () => {
  it('names the win, and the Killers alone won it', () => {
    expect(winnerLine(4)).toBe('The Killers paint the town red');
    expect(won(over, 'killer')).toBe(true);
    expect(won(over, 'baker')).toBe(false);
    expect(won({ ...over, winner: 1 }, 'baker')).toBe(true);
  });

  it('shows the target and ranks the Killers by total; nothing outside the mode', () => {
    const lines = paintLines(over, (id) => names[id] ?? '?');
    expect(lines?.target).toBe('The town needed 3 different kills');
    expect(lines?.rows.map((r) => r.seatId)).toEqual(['b', 'a']);
    expect(lines?.rows[0]?.text).toBe('Bo: 1 different, 4 in all');
    const { paintTown: _drop, ...plain } = over;
    expect(paintLines({ ...plain, winner: 2 }, () => '?')).toBeNull();
  });
});

describe('the Paint The Town Red card', () => {
  it('fills its goal with the shared target', () => {
    const n = paintTarget(balance.paintTown.winUnique, 4);
    expect(fill(LOOKS_COPY['card.paint.goal'], { n })).toContain(`kill ${n} different townsfolk`);
  });
});
