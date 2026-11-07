import mitt from 'mitt';
import { beforeEach, describe, expect, it } from 'vitest';
import { MockNetwork } from '../../net/mock';
import { StoryMock } from '../../net/mock/storyMock';
import type { NetEvents } from '../../net/NetworkService';
import { FakeNode, installFakeDom } from '../main/fakeDom';
import { mountStoryLayer } from './StoryLayer';
import type { StorySaveStore } from './save';

(FakeNode.prototype as unknown as { focus(): void }).focus = () => undefined;

describe('the story layer', () => {
  let root: () => FakeNode;
  beforeEach(() => {
    root = installFakeDom();
  });

  function rig() {
    const bus = mitt<NetEvents>();
    const sent: Array<[string, unknown]> = [];
    const mock = new StoryMock((type, payload) => bus.emit(type, payload as never));
    const parent = root();
    mountStoryLayer(parent as unknown as HTMLElement, {
      bus,
      send: ((type: string, payload: unknown) => {
        sent.push([type, payload]);
        if (type === 'story.continue') mock.continue();
      }) as never,
    });
    return { parent, mock, sent };
  }

  it('draws the title card from the message and closes it with story.continue', () => {
    const { parent, mock, sent } = rig();
    mock.start();
    expect(parent.byTestId('story-card')?.getAttribute('data-kind')).toBe('title');
    expect(parent.byTestId('story-title')?.content).toBe('First chapter');
    parent.byTestId('story-continue')?.click();
    expect(sent).toEqual([['story.continue', {}]]);
    // the next card is the beat, with its goal; the goals strip waits for the card to close
    expect(parent.byTestId('story-card')?.getAttribute('data-kind')).toBe('beat');
    expect(parent.byTestId('story-goal')?.content).toContain('Do the first thing');
    expect(parent.byTestId('story-goals')).toBeUndefined();
  });

  it('shows the goals strip between cards and the summary on the end card', () => {
    const { parent, mock } = rig();
    mock.start();
    parent.byTestId('story-continue')?.click(); // title -> beat
    parent.byTestId('story-continue')?.click(); // beat closes; goals 1 and 2 arrive, then the end card
    expect(parent.byTestId('story-card')?.getAttribute('data-kind')).toBe('end');
    expect(parent.byTestId('story-summary')?.content).toContain('Loaves baked');
    expect(parent.byTestId('story-next')?.content).toContain('Second chapter');
  });

  it('plays all three chapters and ends on a card with no next chapter', () => {
    const { parent, mock } = rig();
    mock.start();
    let guard = 0;
    while (parent.byTestId('story-card') && guard++ < 40) {
      if (
        parent.byTestId('story-card')?.getAttribute('data-chapter') === 'mock3' &&
        parent.byTestId('story-card')?.getAttribute('data-kind') === 'end'
      )
        break;
      parent.byTestId('story-continue')?.click();
    }
    expect(parent.byTestId('story-card')?.getAttribute('data-chapter')).toBe('mock3');
    expect(parent.byTestId('story-next')).toBeUndefined();
  });

  it('draws a section card and an NPC line card with the speaker, lines and section id', () => {
    const { parent, mock } = rig();
    mock.start('mock2');
    parent.byTestId('story-continue')?.click(); // title -> section
    const section = parent.byTestId('story-card');
    expect(section?.getAttribute('data-kind')).toBe('section');
    expect(section?.getAttribute('data-section')).toBe('mock2_b');
    expect(parent.byTestId('story-title')?.content).toBe('Second section');
    parent.byTestId('story-continue')?.click(); // section -> line
    const line = parent.byTestId('story-card');
    expect(line?.getAttribute('data-kind')).toBe('line');
    expect(parent.byTestId('story-speaker')?.content).toBe('Old Marta');
    expect(
      parent
        .all()
        .filter((n) => n.attrs.get('data-testid') === 'story-line')
        .map((l) => l.content),
    ).toEqual(['The bell tolled for no one last night.', 'Someone rang it all the same.']);
  });

  it('hands each story.saved to the save store, whole', () => {
    const bus = mitt<NetEvents>();
    const written: unknown[] = [];
    const saves: StorySaveStore = {
      read: () => null,
      write: (x) => void written.push(x),
      clear: () => undefined,
    };
    mountStoryLayer(root() as unknown as HTMLElement, { bus, send: (() => undefined) as never }, saves);
    const save = {
      v: 1,
      storyId: 's',
      nextChapterId: 'c2',
      finished: ['c1'],
      handOn: [],
      replayUsed: [],
      summaries: [],
      rev: 1,
      savedAt: 0,
    };
    bus.emit('story.saved', { save });
    expect(written).toEqual([save]);
  });

  it('the mock network answers story.start on its bus', () => {
    const net = new MockNetwork();
    const seen: string[] = [];
    net.bus.on('story.card', (c) => seen.push(c.kind));
    net.send('story.start', { storyId: 'mock_story' });
    net.send('story.continue', {});
    expect(seen).toEqual(['title', 'beat']);
  });
});
