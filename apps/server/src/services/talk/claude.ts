import { balance } from '@wdi/content';
import { keyPresent, talkModel } from './config';

/** One finished model call: the text, or null for anything but a plain finished answer, and the tokens it cost. */
export interface ModelReply {
  text: string | null;
  tokens: number;
}

export interface TalkTransport {
  /** Whether model calls may be made at all (a key on the server, not under test). */
  enabled(): boolean;
  /** Never rejects: a failure, a refusal or a timeout resolves with `text: null`. */
  request(system: string, user: string): Promise<ModelReply>;
}

const API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * The Messages API over `fetch` (no SDK is a dependency, ARCHITECTURE 5.1). Low effort and a short answer; any
 * `stop_reason` but `end_turn` (a refusal, `max_tokens`) gives no line. An error says only its status, never a
 * header or a body, so the key cannot reach a log.
 */
async function request(system: string, user: string): Promise<ModelReply> {
  const m = balance.talk.model;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(m.timeoutS * 1000),
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2026-10-21',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
      },
      body: JSON.stringify({
        model: talkModel(),
        max_tokens: m.maxTokens,
        output_config: { effort: 'low' },
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) {
      console.warn(`talk: model call failed (${res.status})`);
      return { text: null, tokens: 0 };
    }
    const body = (await res.json()) as {
      stop_reason?: string;
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const tokens = (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0);
    if (body.stop_reason !== 'end_turn') return { text: null, tokens };
    const text = (body.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    return { text, tokens };
  } catch {
    console.warn('talk: model call failed (no answer)');
    return { text: null, tokens: 0 };
  }
}

/** Tests replace `enabled` and `request` (as `matchLog.write`), so no test ever reaches the network. */
export const talkTransport: TalkTransport = { enabled: keyPresent, request };
