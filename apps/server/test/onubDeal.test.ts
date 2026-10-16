import type { ColyseusTestServer } from '@colyseus/testing';
import { onubBalance, onubRoles } from '@wdi/content';
import { LOFT_SCENE_INDEX, Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sceneIndex } from '../src/sim/World';
import { bootFlowServer } from './flowHelpers';
import {
  beginParty,
  botDealt,
  codes,
  doAct,
  events,
  joinParty,
  onub,
  openWindow,
  plate,
  standAtProp,
  startOnub,
  toNight,
  until,
} from './onubHelpers';
import { sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

describe('the quick-mode deal (GDD 3.11)', () => {
  it('deals a 6-seat party 9 loaves, three of them the dead, and a card to every seat', async () => {
    const m = await startOnub(colyseus, 6);
    const o = onub(m);
    expect(o.loaves.size).toBe(9);
    const dead = [...o.loaves].filter(([id]) => id.startsWith('bk.deadloaf_'));
    expect(dead.map(([id]) => id).sort()).toEqual(['bk.deadloaf_0', 'bk.deadloaf_1', 'bk.deadloaf_2']);
    expect(o.dealt.size).toBe(6);
    for (const b of m.bots) {
      const card = events(b, 'roleReveal').at(-1);
      expect(card).toMatchObject({
        roleId: o.dealt.get(b.id),
        beware: onubRoles.cardLine,
        goal: onubRoles.roles[o.dealt.get(b.id) as string]?.nightAct,
        cardText: onubRoles.roles[o.dealt.get(b.id) as string]?.cardText,
        abilities: [],
        inventory: [],
      });
      const priv = m.room.state.players.get(b.id)?.priv;
      expect(priv?.role.roleId).toBe(o.dealt.get(b.id));
    }
    expect(m.room.state.players.get(m.bots[0]!.id)?.ready).toBe(false);
  });

  it('shows only a Poisoner its partner on the card, and the Hireling learns them at its window', async () => {
    const m = await startOnub(colyseus, 6, {
      Bot0: 'poisoner',
      Bot1: 'poisoner',
      Bot2: 'hireling',
      Bot3: 'sinEater',
      Bot4: 'cutpurse',
      Bot5: 'busybody',
    });
    const mates = (i: number) => [...(m.room.state.players.get(m.bots[i]!.id)?.priv?.cabalMates ?? [])];
    expect(mates(0)).toEqual([m.bots[1]!.id]);
    expect(mates(1)).toEqual([m.bots[0]!.id]);
    for (const i of [2, 3, 4, 5]) expect(mates(i)).toEqual([]);
    expect((events(m.bots[0]!, 'roleReveal').at(-1)?.teammates as unknown[]).length).toBe(1);
    expect(events(m.bots[2]!, 'roleReveal').at(-1)?.teammates).toEqual([]);

    await toNight(m);
    const hireling = botDealt(m, 'hireling');
    // The Poisoners' window is skipped: the Conductor jumps straight to the Hireling's.
    await openWindow(m, 'hireling');
    standAtProp(m, hireling, 'bk.ledger');
    await doAct(hireling, 'onub.readLedger', 'bk.ledger');
    const reveal = events(hireling, 'nightReveal').at(-1);
    expect(reveal?.entries).toEqual([
      { slot: 'bk.ledger', of: m.bots[0]!.id, roleId: 'poisoner' },
      { slot: 'bk.ledger', of: m.bots[1]!.id, roleId: 'poisoner' },
    ]);
    const priv = m.room.state.players.get(hireling.id)?.priv;
    expect(priv?.nightReveal.map((e) => e.of)).toEqual([m.bots[0]!.id, m.bots[1]!.id]);
  });

  it('consumes debug.deal: fixed seats keep their card and the rest of the deck fills the others', async () => {
    const m = await startOnub(colyseus, 5, { Bot3: 'debtor', Bot4: 'sot' });
    const o = onub(m);
    expect(o.dealt.get(m.bots[3]!.id)).toBe('debtor');
    expect(o.dealt.get(m.bots[4]!.id)).toBe('sot'); // not in the 5-seat deck: takes a Mourner's place
    const all = [...o.loaves.values()].sort();
    expect(all).toHaveLength(8);
  });

  it('numbers the plates 0 to n-1 even when a seat left before the deal, each prop naming its owner', async () => {
    const m = await joinParty(colyseus, 5);
    m.room.state.settings.mode = 1;
    await m.bots[2]!.room.leave();
    await sleep(300);
    expect(m.room.state.players.size).toBe(4);
    m.bots.splice(2, 1);
    await beginParty(m);
    const props = m.room.state.scenes.get('bakery')!.props;
    const ids = [...m.room.state.players.keys()];
    ids.forEach((id, slot) => {
      expect(props.get(`bk.plate_${slot}`)?.of).toBe(id);
      expect(props.get(`bk.plate_${slot}`)?.kind).toBe('plate');
    });
    expect(props.get('bk.plate_4')).toBeUndefined();
    expect([...props.keys()].filter((k) => k.startsWith('bk.deadloaf_')).sort()).toEqual([
      'bk.deadloaf_0',
      'bk.deadloaf_1',
      'bk.deadloaf_2',
    ]);
    expect(props.get('bk.ledger')?.kind).toBe('ledger');
    expect(props.get('bk.deadloaf_0')?.of).toBe('');
  });
});

describe('dusk (GDD 3.11)', () => {
  it('places every seat in the bakery with one announced sceneEnter and never in the overworld', async () => {
    const m = await startOnub(colyseus, 5);
    expect(m.room.state.phase).toBe(Phase.dusk);
    for (const b of m.bots) {
      const enters = events(b, 'sceneEnter');
      expect(enters).toEqual([{ sceneId: 'bakery', spawn: 'door', facing: 'n' }]);
    }
    expect(m.room.state.scenes.get('overworld')!.clues.size).toBe(0);
    m.room.state.players.forEach((p) => expect(p.sceneId).toBe(sceneIndex('bakery')));
  });

  it('accepts the own plate within reach, refuses another plate 422, far away 427, and outside dusk 425', async () => {
    const m = await startOnub(colyseus, 5);
    const [a, b] = [m.bots[0]!, m.bots[1]!];
    standAtProp(m, a, plate(m, a));
    await doAct(a, 'onub.setPlate', plate(m, b));
    expect(codes(a)).toEqual([422]);
    standAtProp(m, a, 'bk.oven');
    await doAct(a, 'onub.setPlate', plate(m, a));
    expect(codes(a)).toEqual([422, 427]);
    expect(onub(m).plateSet.has(a.id)).toBe(false);
    standAtProp(m, a, plate(m, a));
    await doAct(a, 'onub.setPlate', plate(m, a));
    expect(codes(a)).toEqual([422, 427]);
    expect(onub(m).plateSet.has(a.id)).toBe(true);

    await toNight(m);
    await doAct(a, 'onub.setPlate', plate(m, a));
    expect(codes(a).at(-1)).toBe(425);
  });

  it('sets every unset plate itself when dusk ends', async () => {
    const m = await startOnub(colyseus, 4);
    m.room.state.phaseEndsTick = m.room.state.tick;
    expect(await until(() => m.room.state.phase === Phase.night)).toBe(true);
    expect(onub(m).plateSet.size).toBe(4);
  });

  it('refuses every portal all match', async () => {
    const m = await startOnub(colyseus, 4);
    const a = m.bots[0]!;
    standAtProp(m, a, 'bk.ledger');
    a.room.send('act.enterPortal', { portalId: 'bk.door' });
    await sleep(250);
    expect(codes(a)).toEqual([425]);
  });
});

describe('the night start (A39)', () => {
  it('sends every client nightSleep, sets every public sceneId to 255 and times the whole night', async () => {
    const m = await startOnub(colyseus, 6);
    await toNight(m);
    for (const b of m.bots) expect(events(b, 'nightSleep')).toHaveLength(1);
    m.room.state.players.forEach((p) => expect(p.sceneId).toBe(LOFT_SCENE_INDEX));
    const o = onub(m);
    const script = o.script;
    expect(script.map((w) => w.role)).toEqual(['poisoner', 'hireling', 'sinEater', 'cutpurse', 'busybody']);
    const total = script.reduce((sum, w) => sum + w.seconds + onubBalance.timers.fadeS, 0);
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeLessThanOrEqual(Math.round(total * 20));
    expect(m.room.state.phaseEndsTick - m.room.state.tick).toBeGreaterThan(Math.round(total * 20) - 40);
  });
});
