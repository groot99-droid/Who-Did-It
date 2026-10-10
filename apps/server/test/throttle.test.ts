import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BUILD_VERSION, JOIN_ERROR_MESSAGE } from '@wdi/shared';
import { THROTTLED_CODE } from '../src/services/matchmakeGuard';
import { KeyedBuckets, TokenBucket } from '../src/services/TokenBucket';
import { createServer } from '../src/server';

const PORT = 2568;
const o = (name: string) => ({ name, build: BUILD_VERSION, deviceId: `dev-${name}` });

describe('TokenBucket', () => {
  it('allows the burst, then refills over time', () => {
    const b = new TokenBucket(3, 1, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.take(1000)).toBe(true);
    expect(b.take(1000)).toBe(false);
  });

  it('keeps one bucket per key', () => {
    const k = new KeyedBuckets(1, 0);
    expect([k.take('a', 0), k.take('a', 0), k.take('b', 0)]).toEqual([true, false, true]);
  });
});

describe('matchmake route guard', () => {
  let colyseus: ColyseusTestServer;
  beforeAll(async () => {
    colyseus = await boot(createServer({ ipBurst: 5, ipPerMin: 1, globalPerMin: 100_000 }));
  });
  afterAll(async () => colyseus.shutdown());

  it('throttles 1,000 joinById calls from one IP and answers the rest generically', async () => {
    const results = { generic: 0, throttled: 0, other: 0 };
    for (let i = 0; i < 1000; i++) {
      const res = await fetch(`http://localhost:${PORT}/matchmake/joinById/party`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://groot99-droid.github.io' },
        body: JSON.stringify({ roomId: 'ZZZZZ', ...o('Eve') }),
      });
      const body = (await res.json()) as { error?: string };
      if (res.status === 404 && body.error === JOIN_ERROR_MESSAGE) results.generic++;
      else if (res.status === THROTTLED_CODE) results.throttled++;
      else results.other++;
    }
    expect(results.other).toBe(0);
    expect(results.generic).toBeLessThanOrEqual(6);
    expect(results.throttled).toBeGreaterThanOrEqual(994);
  });

  it('answers a disallowed origin without an allow-origin header', async () => {
    const res = await fetch(`http://localhost:${PORT}/matchmake/joinById/party`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: '{}',
    });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
