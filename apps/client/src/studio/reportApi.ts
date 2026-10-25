// Round 9 (9T, docs/round9/admin-studio.md 4 and 5): the Studio's two HTTP routes, with an injectable `fetch`.
import type { StudioReportRequest, StudioReportResponse, StudioReportsResponse } from '@wdi/shared/protocol';
import { SERVER_URL } from '../health';

export interface ReportApi {
  send(req: StudioReportRequest): Promise<StudioReportResponse>;
  list(): Promise<StudioReportsResponse>;
}

/** A refused request: `status` is the route's code (403, 413, 422, 429, 502, 503) and `message` its `error` line. */
export class ReportError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(f: typeof fetch, url: string, token: string, body?: unknown): Promise<T> {
  const res = await f(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ReportError(res.status, json.error ?? `HTTP ${res.status}`);
  return json;
}

export function createReportApi(
  token: string,
  deps: { serverUrl?: string; fetch?: typeof fetch } = {},
): ReportApi {
  const base = deps.serverUrl ?? SERVER_URL;
  const f = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return {
    send: (req) => call<StudioReportResponse>(f, `${base}/studio/report`, token, req),
    list: () => call<StudioReportsResponse>(f, `${base}/studio/reports`, token),
  };
}
