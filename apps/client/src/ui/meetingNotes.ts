import balance from '@wdi/content/data/balance.json';
import type { MeetingFeed } from '../net/meeting';
import { NOTES_COPY as C } from './copy/notes';
import { h, icon } from './dom';
import type { MeetingTab } from './Meeting';

/**
 * The meeting notes tab (GDD 3.8, UI.md 14.40): the `notes` lines of the feed, with no speaker, and a field that
 * sends `chat.note`. The server keeps the limits; a refused note comes back as the usual refusal toast.
 */
export function mountMeetingNotes(panel: HTMLElement, feed: MeetingFeed): MeetingTab {
  const list = h('ul', { class: 'wdi-chat__log wdi-notes__list', role: 'log', 'data-testid': 'notes-log' });
  const input = h('input', {
    class: 'wdi-input',
    type: 'text',
    maxlength: balance.chat.maxChars,
    autocomplete: 'off',
    placeholder: C['notes.placeholder'],
    'aria-label': C['notes.placeholder'],
    'data-testid': 'notes-input',
  });
  const send = h(
    'button',
    { type: 'submit', class: 'wdi-btn wdi-btn--icon', 'aria-label': C['notes.send'] },
    icon('glyphs/glyph_chat'),
  );
  const form = h('form', { class: 'wdi-chat__form' }, input, send);
  const root = h(
    'section',
    { class: 'wdi-chat wdi-notes', 'aria-label': C['notes.title'], 'data-testid': 'notes' },
    h('p', { class: 'wdi-hint' }, C['notes.hint']),
    list,
    form,
  );
  panel.append(root);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text === '') return;
    feed.note(text);
    input.value = '';
  });

  let shown = -1;
  const update = () => {
    const notes = feed.lines().filter((line) => line.channel === 'notes');
    const me = feed.roster().find((p) => p.id === feed.selfId);
    const ghost = me !== undefined && !me.alive;
    input.disabled = ghost;
    send.disabled = ghost;
    input.placeholder = ghost ? C['notes.ghost'] : C['notes.placeholder'];
    if (notes.length === shown) return;
    shown = notes.length;
    list.replaceChildren(
      ...(notes.length === 0
        ? [h('li', { class: 'wdi-hint' }, C['notes.empty'])]
        : notes.map((line) => h('li', { class: 'wdi-chat__line wdi-notes__line' }, line.text))),
    );
    list.scrollTop = list.scrollHeight;
  };
  update();
  return { update, destroy: () => root.remove() };
}
