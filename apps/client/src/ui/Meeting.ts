import balance from '@wdi/content/data/balance.json';
import { TRAIT_IDS } from '@wdi/shared/protocol';
import { type MeetingFeed, type MeetingFeedEvents, type MeetingPlayer, SKIP } from '../net/meeting';
import type { OnubFeed } from '../net/onub';
import { fill } from './copy';
import { MEETING_COPY as C } from './copy/meeting';
import { h, icon, type Screen } from './dom';
import {
  chatTag,
  clockText,
  ejectionLines,
  MEETING_PHASE,
  outsOf,
  PHASE_LABEL,
  reasonLine,
} from './meetingText';
import { renderLookPortrait, revealLookLine } from './main/lookPortraits';
import { showShotToast } from './main/shotToast';
import { mountRush, type RushPanel } from './onub/rush';
import type { PortraitLook } from './portrait';
import { roleTitle } from './RoleCard';

/** An extra tab (the Notebook, wired at integration): `update` runs with every refresh. */
export interface MeetingTab {
  update(): void;
  destroy(): void;
}

export interface MeetingOptions {
  feed: MeetingFeed;
  /** Quick mode: the ONUB feed the Rush panel reads (board, claims); absent in the main mode. */
  onub?: OnubFeed;
  /** Paints a portrait into the canvas (the scene owns the texture manager). */
  drawPortrait(canvas: HTMLCanvasElement, look: PortraitLook, name: string): void;
}

export interface MeetingScreen extends Screen {
  /** Re-reads the feed; cheap enough to call every frame. */
  update(): void;
  /** Draws every seat's portrait again from the current textures (after an art-style switch, A79). */
  repaintPortraits(): void;
  /** Adds a tab beside Report and Chat; `mount` fills its panel. */
  addTab(id: string, label: string, mount: (panel: HTMLElement) => MeetingTab): void;
}

interface Seat {
  player: MeetingPlayer;
  button: HTMLButtonElement;
  voted: HTMLElement;
  count: HTMLElement;
  stamp: HTMLElement;
  ghost: HTMLElement;
  /** Quick mode: the role this seat claimed (`claimed-<id>`), hidden until it has claimed. */
  claimed: HTMLElement;
}

const traitIcons = (look: PortraitLook): HTMLImageElement[] => {
  const out: HTMLImageElement[] = [];
  const height = TRAIT_IDS.height[look.height];
  const scarf = TRAIT_IDS.scarf[look.scarf];
  const hat = TRAIT_IDS.hat[look.hat];
  // Medium height has no icon: the absence is the trait (docs/UI.md 6).
  if (height !== undefined && height !== 'mid') out.push(icon(`icons/icon_height_${height}`, height));
  if (scarf !== undefined) out.push(icon(`icons/icon_scarf_${scarf}`, `${scarf} scarf`));
  if (hat !== undefined) out.push(icon(`icons/icon_hat_${hat}`, hat === 'bare' ? 'bare head' : hat));
  return out;
};

export function mountMeeting(root: HTMLElement, opts: MeetingOptions): MeetingScreen {
  const { feed } = opts;
  const nameOf = (id: string) => feed.roster().find((p) => p.id === id)?.name ?? 'Someone';

  // --- the board -------------------------------------------------------------------------------
  const reason = h('p', { class: 'wdi-eyebrow', 'data-testid': 'meeting-reason' });
  const clockPhase = h('span', { class: 'wdi-hud-clock__phase' });
  const clockTime = h('span', { 'data-testid': 'meeting-clock' });
  const clock = h('div', { class: 'wdi-hud-clock' }, clockPhase, clockTime);
  const grid = h('ul', { class: 'wdi-portraits' });
  const hint = h('span', { class: 'wdi-hint', 'aria-live': 'polite' });
  // Quick mode's reveal lines are the Rush panel's (`reveal-role` there), so only one element carries the hook.
  const revealRole = h('p', {
    class: 'wdi-subtitle',
    hidden: true,
    ...(feed.mode() === 'main' ? { 'data-testid': 'reveal-role' } : {}),
  });
  // Quick mode: the Rush panel (claims, the board, the Pantry vote, the reveal lines) mounts here.
  const rushRoot = h('div', { class: 'wdi-stack', hidden: true });
  const skipCount = h('span', {
    class: 'wdi-chip wdi-chip--vote',
    hidden: true,
    'data-testid': 'vote-count-skip',
  });
  const skip = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--ghost', 'data-testid': 'vote-skip' },
    icon('glyphs/glyph_skip'),
    C['meeting.vote.skip'],
    skipCount,
  );

  skip.addEventListener('click', () => feed.vote(SKIP));

  const board = h(
    'section',
    { class: 'wdi-panel wdi-panel--wide wdi-stack wdi-meet__board', 'aria-labelledby': 'meeting-title' },
    h(
      'div',
      { class: 'wdi-row wdi-row--between wdi-row--wrap' },
      h(
        'div',
        {},
        reason,
        h('h1', { id: 'meeting-title', class: 'wdi-display wdi-display--md' }, C['meeting.title']),
      ),
      clock,
    ),
    grid,
    revealRole,
    rushRoot,
    h('div', { class: 'wdi-row wdi-row--between wdi-row--wrap' }, hint, h('div', { class: 'wdi-row' }, skip)),
  );

  // --- the side: tabs --------------------------------------------------------------------------
  const tabBar = h('div', { class: 'wdi-tabs', role: 'tablist' });
  const panels = new Map<string, { tab: HTMLButtonElement; panel: HTMLElement }>();
  const extras: MeetingTab[] = [];
  let selected = 'chat';

  const select = (id: string) => {
    selected = id;
    for (const [key, entry] of panels) {
      const on = key === id;
      entry.tab.setAttribute('aria-selected', String(on));
      entry.panel.hidden = !on;
    }
  };
  const addPanel = (id: string, label: string, panel: HTMLElement) => {
    const tab = h(
      'button',
      { type: 'button', class: 'wdi-tab', role: 'tab', 'aria-selected': 'false', 'data-testid': `tab-${id}` },
      label,
    );
    tab.addEventListener('click', () => select(id));
    panel.hidden = true;
    tabBar.append(tab);
    side.append(panel);
    panels.set(id, { tab, panel });
  };

  const reportBody = h('dl', { class: 'wdi-stack wdi-stack--tight', 'data-testid': 'report' });
  const log = h('div', { class: 'wdi-chat__log', role: 'log', 'data-testid': 'chat-log' });
  const input = h('input', {
    class: 'wdi-input',
    type: 'text',
    maxlength: balance.chat.maxChars,
    autocomplete: 'off',
    'aria-label': C['chat.placeholder'],
    'data-testid': 'chat-input',
  });
  const send = h(
    'button',
    { type: 'submit', class: 'wdi-btn wdi-btn--icon', 'aria-label': C['chat.send'] },
    icon('glyphs/glyph_chat'),
  );
  const counter = h('span', { class: 'wdi-hint wdi-chat__count', hidden: true, 'data-testid': 'chat-count' });
  const form = h('form', { class: 'wdi-chat__form' }, input, send);
  const chat = h('div', { class: 'wdi-chat' }, log, form, counter);
  input.addEventListener('input', () => {
    const near = input.value.length >= Math.floor(balance.chat.maxChars * 0.8);
    counter.hidden = !near;
    if (near)
      counter.textContent = fill(C['chat.limit'], { n: input.value.length, maxChars: balance.chat.maxChars });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text === '') return;
    feed.say(text);
    input.value = '';
    counter.hidden = true;
  });

  const side = h('aside', { class: 'wdi-panel wdi-stack wdi-meet__side' }, tabBar);
  addPanel('report', C['meeting.tab.report'], h('div', { class: 'wdi-stack' }, reportBody));
  addPanel('chat', C['meeting.tab.chat'], chat);
  select(selected);

  // --- quick mode: the Rush panel (GDD 3.11, Session 5D) ------------------------------------------
  let rush: RushPanel | null = null;

  const el = h('div', { class: 'wdi-meet wdi-screen', 'data-testid': 'meeting' }, board, side);
  root.append(el);

  // --- state -----------------------------------------------------------------------------------
  let seats = new Map<string, Seat>();
  let builtFor = '';
  let rendered = 0;
  let lastPlaceholder = '';

  const build = (roster: MeetingPlayer[]) => {
    seats = new Map();
    const main = feed.mode() === 'main';
    const items = roster.map((p) => {
      const look: PortraitLook = p.traits;
      const canvas = h('canvas', { width: 128, height: 192, 'aria-hidden': 'true' });
      opts.drawPortrait(canvas, look, p.name);
      const pic = h('span', { class: 'wdi-portrait__pic' }, canvas);
      // Main mode: the portrait by public look (GDD 3.17, Session 5G's `ui/main/lookPortraits.ts`).
      if (main) renderLookPortrait(pic, p);
      const voted = h(
        'span',
        {
          class: 'wdi-chip wdi-chip--ready wdi-portrait__votes',
          hidden: true,
          'data-testid': `voted-${p.id}`,
        },
        icon('glyphs/glyph_check'),
        C['meeting.chip.voted'],
      );
      const count = h('span', {
        class: 'wdi-chip wdi-chip--vote wdi-portrait__votes',
        hidden: true,
        'data-testid': `vote-count-${p.id}`,
      });
      const stamp = h('img', {
        class: 'wdi-stamp',
        src: `${import.meta.env.BASE_URL}assets/ui/marks/mark_vote_stamp.svg`,
        alt: fill(C['reveal.ejected'], { name: p.name }),
        'data-testid': 'stamp',
      });
      const claimed = h('span', {
        class: 'wdi-portrait__claim',
        hidden: true,
        'data-testid': `claimed-${p.id}`,
      });
      const ghost = icon('glyphs/glyph_ghost', C['meeting.chip.dead'], 'wdi-portrait__ghost');
      ghost.hidden = true;
      const button = h(
        'button',
        { type: 'button', class: 'wdi-portrait', 'data-testid': `portrait-${p.id}` },
        pic,
        h('span', { class: 'wdi-portrait__name' }, p.name),
        h('span', { class: 'wdi-portrait__traits' }, ...traitIcons(look)),
        voted,
        count,
        ghost,
        claimed,
      );
      button.addEventListener('click', () => feed.vote(p.id));
      seats.set(p.id, { player: p, button, voted, count, stamp, ghost, claimed });
      return h('li', {}, button);
    });
    grid.replaceChildren(...items);
  };

  const setText = (node: HTMLElement, text: string) => {
    if (node.textContent !== text) node.textContent = text;
  };

  const renderReport = (roster: MeetingPlayer[]) => {
    const info = feed.meeting();
    const voted = roster.filter((p) => p.alive && p.hasVoted).length;
    const living = roster.filter((p) => p.alive).length;
    const victim = roster.find((p) => p.id === info.bodyOf);
    const row = (term: string, ...lines: string[]) =>
      h(
        'div',
        {},
        h('dt', { class: 'wdi-eyebrow' }, term),
        ...lines.map((text) => h('dd', { class: 'wdi-muted', style: 'margin:0' }, text)),
      );
    const rows = [
      row(C['meeting.report.called'], reasonLine(feed.started(), nameOf)),
      victim !== undefined
        ? row(C['meeting.report.found'], fill(C['meeting.report.found.line'], { name: victim.name }))
        : null,
      row(C['meeting.report.here'], fill(C['meeting.report.here.line'], { living, voted })),
    ].filter((r): r is HTMLDivElement => r !== null);
    const key = rows.map((r) => r.textContent).join('|');
    if (reportBody.dataset.key !== key) {
      reportBody.dataset.key = key;
      reportBody.replaceChildren(...rows);
    }
  };

  const renderChat = (me: MeetingPlayer | undefined) => {
    const lines = feed.lines();
    if (lines.length < rendered) {
      log.replaceChildren();
      rendered = 0;
    }
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
    for (const line of lines.slice(rendered)) {
      const tag = chatTag(line);
      log.append(
        h(
          'p',
          { class: `wdi-chat__line${line.channel === 'system' ? ' wdi-chat__line--system' : ''}` },
          line.channel === 'system' ? null : h('span', { class: 'wdi-chat__who' }, nameOf(line.from)),
          tag !== '' &&
            h(
              'span',
              { class: 'wdi-hint' },
              `(${tag === 'ghost' ? C['chat.channel.ghost'] : C['chat.channel.cabal']}) `,
            ),
          line.text,
        ),
      );
    }
    rendered = lines.length;
    if (stick) log.scrollTop = log.scrollHeight;
    const placeholder = me !== undefined && !me.alive ? C['ghost.chat'] : C['chat.placeholder'];
    if (placeholder !== lastPlaceholder) {
      lastPlaceholder = placeholder;
      input.placeholder = placeholder;
    }
  };

  const update = () => {
    const roster = feed.roster();
    const key = roster.map((p) => p.id).join(',');
    if (key !== builtFor) {
      builtFor = key;
      build(roster);
    }
    const me = roster.find((p) => p.id === feed.selfId);
    const mine = feed.myVote();
    const info = feed.meeting();
    const clockNow = feed.clock();
    const phase = info.phase !== 0 ? info.phase : clockNow.phase;
    const result = feed.result();
    const revealing = result !== null;
    const quick = feed.mode() === 'onub';
    const inTalk = phase === MEETING_PHASE.discussion || phase === MEETING_PHASE.vote;
    const canVote = me?.alive === true && !revealing && inTalk;

    setText(reason, reasonLine(feed.started(), nameOf));
    setText(clockPhase, revealing ? (PHASE_LABEL[MEETING_PHASE.reveal] ?? '') : (PHASE_LABEL[phase] ?? ''));
    const endsTick = clockNow.phaseEndsTick > 0 ? clockNow.phaseEndsTick : info.endsTick;
    setText(clockTime, clockText(endsTick > 0 ? endsTick - clockNow.tick : null));

    const outs = result === null ? [] : outsOf(result);
    // Quick mode: each portrait shows the role its seat claimed (GDD 3.11).
    const claims = quick ? (opts.onub?.claims() ?? []) : [];
    for (const [id, seat] of seats) {
      const claim = claims.find((c) => c.from === id);
      seat.claimed.hidden = claim === undefined;
      if (claim !== undefined) setText(seat.claimed, roleTitle(claim.roleId, 'onub'));
      const p = roster.find((q) => q.id === id) ?? seat.player;
      seat.player = p;
      const b = seat.button;
      b.classList.toggle('is-self', id === feed.selfId);
      b.classList.toggle('is-dead', !p.alive);
      b.classList.toggle('is-selected', mine === id);
      b.setAttribute('aria-pressed', String(mine === id));
      // Quick mode refuses a vote for yourself (GDD 3.11).
      b.disabled = !canVote || !p.alive || (quick && id === feed.selfId);
      seat.ghost.hidden = p.alive;
      const votes = result?.tally[id] ?? 0;
      seat.voted.hidden = revealing || !p.hasVoted || !p.alive;
      seat.count.hidden = !revealing || votes === 0;
      if (!seat.count.hidden) setText(seat.count, `${votes}`);
      // A stamp lands on every seat the vote turned out.
      if (outs.includes(id)) {
        if (!seat.stamp.isConnected) b.append(seat.stamp);
      } else seat.stamp.remove();
    }
    skip.hidden = quick;
    skip.disabled = !canVote;
    skip.classList.toggle('is-selected', mine === SKIP);
    skip.setAttribute('aria-pressed', String(mine === SKIP));
    const skips = result?.tally[SKIP] ?? 0;
    skipCount.hidden = !revealing || skips === 0;
    if (!skipCount.hidden) setText(skipCount, `${skips}`);

    // Quick mode's reveal lines are the Rush panel's.
    revealRole.hidden = result === null || quick;
    if (result !== null && !quick) {
      // Main mode: "walking as the Baker" after the ejection line (GDD 3.17, Session 5G).
      const ejectedLook = roster.find((p) => p.id === result.ejectedId)?.look ?? '';
      const lookLine = result.ejectedId === undefined ? '' : revealLookLine(ejectedLook);
      const lines = [...ejectionLines(result, nameOf), lookLine].filter((line) => line !== '');
      setText(revealRole, lines.join(' '));
    }
    const voteLine = (() => {
      if (mine === '')
        return `${C['meeting.vote.open']}. ${quick ? C['meeting.vote.hintNoSkip'] : C['meeting.vote.hint']}`;
      const who =
        mine === SKIP ? C['meeting.vote.mineSkip'] : fill(C['meeting.vote.mine'], { name: nameOf(mine) });
      return `${who}. ${C['meeting.vote.change']}`;
    })();
    setText(hint, revealing ? '' : me?.alive === false ? C['ghost.noVote'] : voteLine);

    // Quick mode: the Rush panel, once the ONUB feed is there (it is published before the dawn meeting).
    if (quick && rush === null && opts.onub !== undefined) rush = mountRush(rushRoot, feed, opts.onub);
    rushRoot.hidden = rush === null;
    rush?.update();

    renderReport(roster);
    renderChat(me);
    for (const tab of extras) tab.update();
  };

  // Main mode, during a reveal: the ejected Gamekeeper's Last Shot (GDD 3.2, Session 5G's `ui/main/shotToast.ts`).
  const onShot = (shot: MeetingFeedEvents['shot']) => {
    if (feed.mode() === 'main') showShotToast(board, shot, nameOf);
  };
  feed.bus.on('shot', onShot);

  update();
  return {
    update,
    repaintPortraits: () => {
      for (const seat of seats.values()) {
        const canvas = seat.button.querySelector('canvas');
        if (canvas) opts.drawPortrait(canvas, seat.player.traits, seat.player.name);
      }
    },
    addTab: (id, label, mount) => {
      const panel = h('div', { class: 'wdi-stack' });
      addPanel(id, label, panel);
      extras.push(mount(panel));
      select(selected);
    },
    destroy: () => {
      feed.bus.off('shot', onShot);
      for (const tab of extras) tab.destroy();
      extras.length = 0;
      rush?.destroy();
      rush = null;
      el.remove();
    },
  };
}
