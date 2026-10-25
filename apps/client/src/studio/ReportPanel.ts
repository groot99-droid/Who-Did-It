// Round 9 (9T, docs/round9/admin-studio.md 4): the Report dialog. A screenshot of the game canvas to draw an arrow or
// circle on, a note of any length, and a send that carries the context the caller builds.
import type { StudioReportRequest } from '@wdi/shared/protocol';
import { STUDIO_COPY as C, fill } from '../ui/copy';
import { h, type Screen } from '../ui/dom';
import { type Mark, type Pt, type Tool, paint } from './annotate';
import { ReportError } from './reportApi';

export interface ReportDeps {
  image: CanvasImageSource & { width: number; height: number };
  /** Builds the request from the marked PNG data URL and the note. */
  build: (png: string, note: string) => StudioReportRequest;
  send: (req: StudioReportRequest) => Promise<{ number: number; url: string }>;
  onClose: () => void;
}

/** The line shown for a failed send: the route's own text, which names the NFY token line for a 503. */
export const failureOf = (e: unknown): string =>
  e instanceof ReportError ? fill(C['studio.report.failed'], { why: e.message }) : C['studio.report.offline'];

export function mountReportPanel(root: HTMLElement, d: ReportDeps): Screen {
  const tid = (id: string) => ({ 'data-testid': id });
  const canvas = h('canvas', {
    class: 'wdi-studio__shot',
    width: d.image.width,
    height: d.image.height,
    ...tid('studio-report-shot'),
  });
  const ctx = canvas.getContext('2d')!;
  const marks: Mark[] = [];
  let tool: Tool = 'arrow';
  let drag: { from: Pt; to: Pt } | null = null;

  const redraw = () => {
    ctx.drawImage(d.image, 0, 0);
    paint(ctx, drag === null ? marks : [...marks, { tool, ...drag }]);
  };
  const at = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * canvas.width) / r.width,
      y: ((e.clientY - r.top) * canvas.height) / r.height,
    };
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { from: at(e), to: at(e) };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag === null) return;
    drag.to = at(e);
    redraw();
  });
  canvas.addEventListener('pointerup', () => {
    if (drag !== null && (drag.from.x !== drag.to.x || drag.from.y !== drag.to.y))
      marks.push({ tool, ...drag });
    drag = null;
    redraw();
  });

  const btn = (id: string, text: string, on: () => void, cls = '') => {
    const b = h('button', { type: 'button', class: `wdi-admin__btn ${cls}`.trim(), ...tid(id) }, text);
    b.addEventListener('click', on);
    return b;
  };
  const toolButtons = (['arrow', 'circle'] as const).map((t) =>
    btn(`studio-report-${t}`, C[`studio.report.${t}`], () => {
      tool = t;
      toolButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === (t === 'arrow' ? 0 : 1))));
    }),
  );
  toolButtons[0]!.setAttribute('aria-pressed', 'true');
  const undo = btn('studio-report-undo', C['studio.report.undo'], () => {
    marks.pop();
    redraw();
  });
  const note = h('textarea', {
    class: 'wdi-admin__field wdi-studio__note',
    rows: 5,
    placeholder: C['studio.report.note'],
    'aria-label': C['studio.report.note'],
    ...tid('studio-report-note'),
  });
  const status = h('p', { class: 'wdi-admin__status', role: 'status', ...tid('studio-report-status') });
  const sendBtn = btn(
    'studio-report-send',
    C['studio.report.send'],
    () => {
      sendBtn.disabled = true;
      status.textContent = C['studio.report.sending'];
      redraw();
      d.send(d.build(canvas.toDataURL('image/png'), note.value)).then(
        (r) => {
          status.textContent = fill(C['studio.report.sent'], { number: r.number });
          sendBtn.hidden = true;
        },
        (e: unknown) => {
          status.textContent = failureOf(e);
          sendBtn.disabled = false;
        },
      );
    },
    'wdi-admin__btn--go',
  );

  const dialog = h(
    'section',
    {
      class: 'wdi-studio__dialog',
      role: 'dialog',
      'aria-label': C['studio.report.title'],
      ...tid('studio-report'),
    },
    h('h2', {}, C['studio.report.title']),
    canvas,
    h('div', { class: 'wdi-admin__group' }, ...toolButtons, undo),
    note,
    status,
    h(
      'div',
      { class: 'wdi-admin__group' },
      sendBtn,
      btn('studio-report-close', C['studio.report.close'], d.onClose),
    ),
  );
  root.append(dialog);
  redraw();
  return { destroy: () => dialog.remove() };
}
