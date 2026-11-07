import { JOIN_FAILED_MESSAGE } from '../../net/protocol';
import { MENU_COPY } from '../copy';
import { fill } from '../copy';
import { h } from '../dom';
import { messageLine, nameField, validateName } from '../menu/form';
import { openDialog, type MenuDialog } from '../menu/dialog';
import { STORY_COPY as C } from './copy';
import { chapterRows, readFinished, type StoryCatalogEntry } from './model';
import { deviceSaveStore, type StorySaveStore } from './save';
import type { StorySaveWire } from '@wdi/shared/protocol';

export interface StoryMenuOptions {
  root: HTMLElement;
  stories: readonly StoryCatalogEntry[];
  /** The remembered profile name. */
  name: string;
  /** Creates the story room and sends `story.start`; `chapterId` replays a finished chapter, `resume` continues a save. */
  onStart(name: string, storyId: string, chapterId?: string, resume?: StorySaveWire): Promise<void>;
  /** Where saves live: this device by default; an account replaces it (docs/accounts/plan.md 5). */
  saves?: StorySaveStore;
  explainFailure?(): Promise<string | null>;
  onClose?(): void;
}

/**
 * The title screen's Story (docs/story/README.md, Q-S4): the chapter list of the story, finished chapters marked and
 * open to replay, the next one marked; "Begin the story" starts from the first chapter. Titles and set-up lines come
 * from the content file through `stories`.
 */
export function openStoryMenu(opts: StoryMenuOptions): MenuDialog {
  const dialog = openDialog(opts.root, {
    id: 'story-menu-title',
    title: C['story.menu.title'],
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
  const name = nameField('story-name', C['story.menu.name'], opts.name);
  const msg = messageLine();
  const buttons: HTMLButtonElement[] = [];

  const saves = opts.saves ?? deviceSaveStore();
  const submit = async (storyId: string, chapterId?: string, resume?: StorySaveWire) => {
    const trimmed = name.input.value.trim();
    const problem = validateName(trimmed);
    if (problem !== null) {
      msg.say(problem);
      name.input.focus();
      return;
    }
    for (const b of [name.input, ...buttons]) b.toggleAttribute('disabled', true);
    msg.say(MENU_COPY['menu.connecting'], false);
    try {
      await opts.onStart(trimmed, storyId, chapterId, resume);
    } catch {
      msg.say(JOIN_FAILED_MESSAGE);
      for (const b of [name.input, ...buttons]) b.toggleAttribute('disabled', false);
      void opts.explainFailure?.().then((better) => {
        if (better !== null) msg.say(better);
      });
    }
  };

  const finished = readFinished();
  const sections = opts.stories.map((story) => {
    const begin = h(
      'button',
      {
        type: 'button',
        class: 'wdi-btn wdi-btn--primary',
        'data-testid': 'story-begin',
        'data-story': story.id,
      },
      C['story.menu.begin'],
    );
    begin.addEventListener('click', () => void submit(story.id));
    buttons.push(begin);
    // A Continue row only for a save whose next chapter this build knows; the server still decides on resume.
    const save = saves.read(story.id);
    const next = save?.nextChapterId ? story.chapters.find((c) => c.id === save.nextChapterId) : undefined;
    const resume =
      save && next
        ? h(
            'button',
            {
              type: 'button',
              class: 'wdi-btn wdi-btn--primary',
              'data-testid': 'story-resume',
              'data-story': story.id,
              'data-chapter': next.id,
            },
            fill(C['story.menu.continueAt'], {
              chapter: fill(C['story.menu.chapter'], { n: story.chapters.indexOf(next) + 1 }),
            }),
          )
        : null;
    if (resume && save) {
      resume.addEventListener('click', () => void submit(story.id, undefined, save));
      buttons.push(resume);
    }
    const rows = chapterRows(story, finished).map((row) => {
      const replay =
        row.state === 'done'
          ? h(
              'button',
              {
                type: 'button',
                class: 'wdi-btn wdi-btn--ghost',
                'data-testid': 'story-replay',
                'data-chapter': row.id,
              },
              C['story.menu.replay'],
            )
          : null;
      if (replay) {
        replay.addEventListener('click', () => void submit(story.id, row.id));
        buttons.push(replay);
      }
      return h(
        'li',
        { 'data-testid': 'story-chapter', 'data-chapter': row.id, 'data-state': row.state },
        h('span', {}, `${fill(C['story.menu.chapter'], { n: row.n })}: ${row.title}`),
        replay ??
          h(
            'span',
            { class: 'wdi-field__msg' },
            row.state === 'done'
              ? C['story.menu.done']
              : row.state === 'locked'
                ? C['story.menu.locked']
                : '',
          ),
        h('p', { class: 'wdi-story-chapters__setup' }, row.setup),
      );
    });
    return h(
      'section',
      { class: 'wdi-stack' },
      h('h3', {}, story.title),
      h('p', { class: 'wdi-field__msg' }, story.blurb),
      h('ul', { class: 'wdi-story-chapters' }, ...rows),
      resume,
      begin,
    );
  });

  dialog.body.append(name.el, ...sections, msg.el);
  name.input.focus();
  return dialog;
}
