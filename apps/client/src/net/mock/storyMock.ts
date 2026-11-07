import type { ServerMessages } from '../protocol';
import type { StoryCatalogEntry } from '../../ui/story/model';

// Story mode's mock server path (docs/story/README.md 3, `?mock=1`): plays a short fixed story so the chapter cards and
// the goals strip render and can be screenshot-tested without the engine (S2). The copy below is test fixture text, not
// game copy: in the real game every word arrives from `story.json` through the server.

type Card = ServerMessages['story.card'];
type Goals = ServerMessages['story.goals'];
type Step = { card: Card } | { goals: Goals };

export const MOCK_STORY_ID = 'mock_story';

export const MOCK_STORY_CATALOG: StoryCatalogEntry[] = [
  {
    id: MOCK_STORY_ID,
    title: 'Mock story',
    blurb: 'Three short chapters that exist to test the cards.',
    chapters: [
      {
        id: 'mock1',
        title: 'First chapter',
        setup: 'A short set-up line for the first chapter.',
        summary: 'One line on what happened in the first chapter.',
      },
      {
        id: 'mock2',
        title: 'Second chapter',
        setup: 'A short set-up line for the second chapter.',
        summary: 'One line on what happened in the second chapter.',
      },
      {
        id: 'mock3',
        title: 'Third chapter',
        setup: 'A short set-up line for the third chapter.',
        summary: 'One line on what happened in the third chapter.',
      },
    ],
  },
];

const goals = (chapterId: string, done: number): Goals => ({
  chapterId,
  goals: [
    { id: 'g1', text: 'Do the first thing', done: done > 0 },
    {
      id: 'g2',
      text: 'Then the second thing, which has a rather long name to wrap on a phone',
      done: done > 1,
    },
  ],
});

/** The script of one chapter: a title card, a beat that names the first goal, the goals as they are done, the end. */
export function mockChapterSteps(n: 1 | 2 | 3): Step[] {
  const id = `mock${n}`;
  const title = MOCK_STORY_CATALOG[0]!.chapters[n - 1]!.title;
  return [
    { card: { kind: 'title', chapterId: id, title, lines: ['Mock role, mock town.', `Set-up line ${n}.`] } },
    { goals: goals(id, 0) },
    // Part 2, chapter 2 only (chapters 1 and 3 stay as part 1's): a section card, then a scripted NPC's lines.
    ...(n === 2
      ? ([
          {
            card: {
              kind: 'section',
              chapterId: id,
              sectionId: 'mock2_b',
              title: 'Second section',
              lines: ['The card passes to another hand.'],
            },
          },
          {
            card: {
              kind: 'line',
              chapterId: id,
              sectionId: 'mock2_b',
              speaker: 'Old Marta',
              portrait: 'marta',
              lines: ['The bell tolled for no one last night.', 'Someone rang it all the same.'],
            },
          },
        ] satisfies Step[])
      : []),
    {
      card: {
        kind: 'beat',
        chapterId: id,
        lines: ['A line of narration the story speaks.'],
        portrait: 'baker',
        goal: 'Do the first thing',
      },
    },
    { goals: goals(id, 1) },
    { goals: goals(id, 2) },
    {
      card: {
        kind: 'end',
        chapterId: id,
        title,
        lines: ['The chapter closes here.'],
        summary: { loaves_baked: 4 * n, doors_opened: n },
        ...(n < 3 ? { next: MOCK_STORY_CATALOG[0]!.chapters[n]!.title } : {}),
      },
    },
  ];
}

/**
 * A story as the mock server plays it: `start` sends the first chapter's title card, and each `continue` sends the
 * messages up to the next card (goals updates ride along), so the player's taps drive it as the engine's will.
 */
export class StoryMock {
  private steps: Step[] = [];
  private at = 0;
  private chapter: 1 | 2 | 3 = 1;
  private cardUp = false;

  constructor(
    private readonly emit: <K extends 'story.card' | 'story.goals' | 'story.saved'>(
      type: K,
      payload: ServerMessages[K],
    ) => void,
  ) {}

  start(chapterId?: string, resume?: ServerMessages['story.saved']['save']): void {
    // A resume starts the chapter the save names; the real server re-validates it (docs/accounts/plan.md 5).
    const n = Number((resume?.nextChapterId ?? chapterId)?.replace('mock', '')) as 1 | 2 | 3;
    this.chapter = n === 2 || n === 3 ? n : 1;
    this.load();
    this.run();
  }

  /** `story.continue`: ignored with no card up, like the server's 422. */
  continue(): void {
    if (!this.cardUp) return;
    this.cardUp = false;
    if (this.at >= this.steps.length) {
      if (this.chapter === 3) return;
      this.chapter = (this.chapter + 1) as 2 | 3;
      this.load();
    }
    this.run();
  }

  /** The save at the end of the current chapter: break state only, as the device store keeps it. */
  private save(): ServerMessages['story.saved']['save'] {
    const finished = [1, 2, 3].filter((n) => n <= this.chapter).map((n) => `mock${n}`);
    return {
      v: 1,
      storyId: MOCK_STORY_ID,
      nextChapterId: this.chapter < 3 ? `mock${this.chapter + 1}` : null,
      finished,
      handOn: [],
      replayUsed: [],
      summaries: [],
      rev: this.chapter,
      savedAt: 0,
    };
  }

  private load(): void {
    this.steps = mockChapterSteps(this.chapter);
    this.at = 0;
  }

  /** Sends steps until a card goes out; the goals after a beat are sent with the next continue. */
  private run(): void {
    while (this.at < this.steps.length) {
      const step = this.steps[this.at++]!;
      if ('goals' in step) this.emit('story.goals', step.goals);
      else {
        if (step.card.kind === 'end') this.emit('story.saved', { save: this.save() });
        this.emit('story.card', step.card);
        this.cardUp = true;
        return;
      }
    }
  }
}
