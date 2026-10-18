import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import { COMMIT_ANSWER_MS, handOf, PrepModel } from './PrepView';

function makeFeed(role: string) {
  let mine: { station: string; card: string } | null = null;
  const sent: [string, string][] = [];
  return {
    sent,
    set: (v: { station: string; card: string } | null) => (mine = v),
    feed: {
      dealtRole: () => role,
      myPrep: () => mine,
      prep: (s: string, c: string) => void sent.push([s, c]),
    },
  };
}

describe('handOf', () => {
  it('gives a Baker only the good cards of the station', () => {
    expect(handOf('fridge', 'chef')).toEqual(['pureDairy', 'activeYeast']);
  });

  it('adds the sabotage cards for a seat dealt Team Mold', () => {
    expect(handOf('oven', 'champignon')).toEqual(['oakFirewood', 'steamInjection', 'charcoalAsh', 'wetWood']);
  });

  it('has no sabotage card at the proofing drawer for a Baker, and the two for Team Mold', () => {
    expect(handOf('proofing', 'chef')).toEqual(['warmSteam', 'time']);
    expect(handOf('proofing', 'croissant')).toEqual(['warmSteam', 'time']);
    expect(handOf('proofing', 'levain')).toContain('coldDraft');
  });

  it('knows no hand for an unknown station', () => {
    expect(handOf('nowhere', 'chef')).toEqual([]);
  });
});

describe('PrepModel', () => {
  it('keeps the hand closed until the mini-game is done', () => {
    const { feed } = makeFeed('chef');
    const m = new PrepModel(feed);
    expect(m.enter('mixer')).toBe(true);
    expect(m.hand()).toEqual([]);
    m.finishMini();
    expect(m.hand()).toEqual(handOf('mixer', 'chef'));
  });

  it('refuses an unknown room and picks only from the hand', () => {
    const { feed } = makeFeed('chef');
    const m = new PrepModel(feed);
    expect(m.enter('cellar')).toBe(false);
    m.enter('oven');
    m.finishMini();
    expect(m.pick('wetWood')).toBe(false);
    expect(m.pick('oakFirewood')).toBe(true);
    expect(m.picked()).toBe('oakFirewood');
  });

  it('restarts the mini-game and drops the pick when the seat backs out', () => {
    const { feed } = makeFeed('chef');
    const m = new PrepModel(feed);
    m.enter('fridge');
    m.finishMini();
    m.pick('pureDairy');
    expect(m.back()).toBe(true);
    m.enter('fridge');
    expect(m.done()).toBe(false);
    expect(m.picked()).toBeNull();
  });

  it('sends exactly one onub.prep for the picked card', () => {
    const { feed, sent, set } = makeFeed('chef');
    const m = new PrepModel(feed);
    expect(m.commit()).toBe(false);
    m.enter('mixer');
    m.finishMini();
    m.pick('seaSalt');
    expect(m.commit()).toBe(true);
    expect(m.commit()).toBe(false);
    set({ station: 'mixer', card: 'seaSalt' });
    m.sync();
    expect(sent).toEqual([['mixer', 'seaSalt']]);
    expect(m.committed()).toBe(true);
    expect(m.autoCommitted()).toBe(false);
    expect(m.room()).toBeNull();
    expect(m.enter('fridge')).toBe(false);
    expect(m.back()).toBe(false);
  });

  it('notices the commit the server made at the timeout', () => {
    const { feed, set } = makeFeed('chef');
    const m = new PrepModel(feed);
    m.enter('fridge');
    set({ station: 'oven', card: 'oakFirewood' });
    m.sync();
    expect(m.committed()).toBe(true);
    expect(m.autoCommitted()).toBe(true);
    expect(m.room()).toBeNull();
  });

  it('treats an unanswered commit as refused and lets the seat try again', () => {
    const { feed, sent } = makeFeed('chef');
    let t = 0;
    const m = new PrepModel(feed, () => t);
    m.enter('fridge');
    m.finishMini();
    m.pick('pureDairy');
    m.commit();
    t = COMMIT_ANSWER_MS - 1;
    m.sync();
    expect(m.wasRefused()).toBe(false);
    t = COMMIT_ANSWER_MS;
    m.sync();
    expect(m.wasRefused()).toBe(true);
    expect(m.commit()).toBe(true);
    expect(sent).toHaveLength(2);
    expect(m.wasRefused()).toBe(false);
  });

  it('reads every station and card from content', () => {
    for (const s of onubBalance.stations) {
      for (const c of [...s.good, ...s.sabotage]) expect(onubBalance.cards).toHaveProperty(c);
    }
  });
});
