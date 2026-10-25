// Round 9 (9T, docs/round9/admin-studio.md 4): the Inbox. The owner's reports with their state and Claude's replies.
import type { StudioReportRow } from '@wdi/shared/protocol';
import { STUDIO_COPY as C, fill } from '../ui/copy';
import { h, type Screen } from '../ui/dom';
import { failureOf } from './ReportPanel';
import type { ReportApi } from './reportApi';

export function mountInbox(root: HTMLElement, api: ReportApi, onClose: () => void): Screen {
  const list = h('ul', { class: 'wdi-studio__reports', 'data-testid': 'studio-inbox-list' });
  const status = h('p', { class: 'wdi-admin__status', role: 'status' }, C['studio.inbox.loading']);
  const row = (r: StudioReportRow) =>
    h(
      'li',
      { 'data-testid': `studio-inbox-${r.number}` },
      h('a', { href: r.url, target: '_blank', rel: 'noopener' }, `#${r.number} ${r.title}`),
      h('span', { class: 'wdi-studio__state' }, C[`studio.inbox.${r.state}`]),
      ...r.comments.map((c) => h('blockquote', {}, h('b', {}, c.author), `: ${c.body}`)),
    );
  const close = h(
    'button',
    { type: 'button', class: 'wdi-admin__btn', 'data-testid': 'studio-inbox-close' },
    C['studio.report.close'],
  );
  close.addEventListener('click', onClose);
  const panel = h(
    'section',
    {
      class: 'wdi-studio__dialog',
      role: 'dialog',
      'aria-label': C['studio.inbox.title'],
      'data-testid': 'studio-inbox',
    },
    h('h2', {}, C['studio.inbox.title']),
    status,
    list,
    close,
  );
  root.append(panel);
  void api.list().then(
    ({ reports }) => {
      status.textContent =
        reports.length === 0 ? C['studio.inbox.empty'] : fill(C['studio.inbox.count'], { n: reports.length });
      list.replaceChildren(...reports.map(row));
    },
    (e: unknown) => {
      status.textContent = failureOf(e);
    },
  );
  return { destroy: () => panel.remove() };
}
