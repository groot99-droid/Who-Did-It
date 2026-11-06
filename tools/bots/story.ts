// The story bot (docs/story/test-plan.md): a headless client that plays a story on a live server. It creates a
// party, asks for the story (`story.start`), answers every `story.card` with `story.continue`, and reports whether
// it saw every chapter's title card and end card in order. The server runs the story at 1x, so a full story is
// about 25 minutes of wall time; `--timeout` bounds it. Exit status 0 is a finished story.
//
//   pnpm bots:story -- [--url http://localhost:2567] [--story hollowmere_winter] [--chapters 3] [--timeout 2400]
//
// The wire names are README 3's; S3's protocol constants replace the literals once they are merged.
import { Client } from '@colyseus/sdk';
import { BUILD_VERSION, type CreateOptions } from '@wdi/shared';
import { fileURLToPath } from 'node:url';

export const DEFAULT_URL = 'http://localhost:2567';

interface CardLike {
  kind: 'title' | 'beat' | 'end';
  chapterId: string;
}

/** What the bot has seen: the chapters whose title and end cards arrived, in order, and whether they arrived whole. */
export class StoryTracker {
  readonly started: string[] = [];
  readonly ended: string[] = [];
  readonly problems: string[] = [];
  cards = 0;

  constructor(private readonly chapters: number) {}

  card(c: CardLike): void {
    this.cards++;
    if (c.kind === 'title') {
      if (this.started.length !== this.ended.length)
        this.problems.push(`title of ${c.chapterId} before the end of ${this.started.at(-1)}`);
      this.started.push(c.chapterId);
    } else if (c.kind === 'beat') {
      if (this.started.at(-1) !== c.chapterId || this.ended.length === this.started.length)
        this.problems.push(`beat card of ${c.chapterId} outside its chapter`);
    } else {
      if (this.started.at(-1) !== c.chapterId) this.problems.push(`end of ${c.chapterId} without a title`);
      this.ended.push(c.chapterId);
    }
  }

  get done(): boolean {
    return this.ended.length >= this.chapters;
  }

  get ok(): boolean {
    return this.done && this.problems.length === 0 && new Set(this.started).size === this.started.length;
  }
}

export interface StoryBotOptions {
  url?: string;
  storyId?: string;
  chapters: number;
  timeoutS?: number;
}

export interface StoryBotResult {
  ok: boolean;
  started: string[];
  ended: string[];
  problems: string[];
  cards: number;
  reason: 'finished' | 'timeout' | 'left';
}

export async function runStoryBot(opts: StoryBotOptions): Promise<StoryBotResult> {
  const client = new Client(opts.url ?? DEFAULT_URL);
  const options: CreateOptions & { name: string } = {
    name: 'StoryBot',
    build: BUILD_VERSION,
    deviceId: 'dev-story-bot',
  } as CreateOptions & { name: string };
  const room = await client.create('party', options);
  const tracker = new StoryTracker(opts.chapters);
  const reason = await new Promise<StoryBotResult['reason']>((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), (opts.timeoutS ?? 2400) * 1000);
    const finish = (r: StoryBotResult['reason']) => {
      clearTimeout(timer);
      resolve(r);
    };
    room.onMessage('story.card', (c: CardLike) => {
      tracker.card(c);
      room.send('story.continue', {});
      if (tracker.done) finish('finished');
    });
    room.onMessage('story.goals', () => undefined);
    room.onMessage('*', () => undefined); // the world's other messages are not the bot's business
    room.onLeave(() => finish('left'));
    room.send('story.start', { storyId: opts.storyId ?? 'hollowmere_winter' });
  });
  await room.leave().catch(() => undefined);
  return {
    ok: tracker.ok,
    started: tracker.started,
    ended: tracker.ended,
    problems: tracker.problems,
    cards: tracker.cards,
    reason,
  };
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = arg('url');
  const storyId = arg('story');
  const result = await runStoryBot({
    ...(url !== undefined && { url }),
    ...(storyId !== undefined && { storyId }),
    chapters: Number(arg('chapters') ?? 3),
    timeoutS: Number(arg('timeout') ?? 2400),
  });
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
