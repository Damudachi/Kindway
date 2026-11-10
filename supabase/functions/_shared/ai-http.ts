// The request pipeline both AI functions share: method, sign-in, body checks and configuration,
// in that order, before any handler runs. Responses carry only a coarse `error` code. Logs carry
// only operational metadata from LogFields; never request bodies, entry text, prompts, model
// output, headers or keys.
import { type AiConfig, type ConfigProblem, loadAiConfig } from './ai-config.ts';
import type { AiProvider, Usage } from './ai-provider.ts';
import type { AiStore } from './ai-store.ts';

export type LogFields = {
  fn: string;
  outcome: string;
  http_status: number;
  ms: number;
  request_id?: string;
  input_tokens?: number;
  output_tokens?: number;
  attempts?: number;
  dropped_refs?: number;
  /** How many council advisors' notes the answer was written with. */
  council_notes?: number;
  /** Advisors left out after failing. */
  council_failed?: number;
  config_problem?: ConfigProblem;
};
export type Log = (fields: LogFields) => void;

export type HandlerResult = {
  status: number;
  body: Record<string, unknown>;
  /** Extra metadata for the log line. */
  meta?: { outcome?: string; requestId?: string; usage?: Usage; attempts?: number; droppedRefs?: number; councilNotes?: number; councilFailed?: number };
};

export type AiContext = { store: AiStore; provider: AiProvider; config: AiConfig };
export type Handler = (body: unknown, ctx: AiContext) => Promise<HandlerResult>;

export type Deps = {
  env: (name: string) => string | undefined;
  /** Verifies the access token with Supabase Auth and returns a store scoped to that user. */
  authenticate(token: string): Promise<AiStore | null>;
  provider(config: AiConfig): AiProvider;
  log: Log;
  now?: () => number;
};

/** Requests are small: an id or a list of ids plus a few options. */
export const MAX_BODY_BYTES = 8192;

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

export async function serveAi(fn: string, req: Request, deps: Deps, handle: Handler): Promise<Response> {
  const now = deps.now ?? Date.now;
  const started = now();
  const done = (result: HandlerResult, extra: Partial<LogFields> = {}) => {
    const m = result.meta ?? {};
    deps.log({
      fn,
      outcome: m.outcome ?? String(result.body.status ?? result.body.error ?? 'ok'),
      http_status: result.status,
      ms: now() - started,
      ...(m.requestId && { request_id: m.requestId }),
      ...(m.usage?.inputTokens !== undefined && { input_tokens: m.usage.inputTokens }),
      ...(m.usage?.outputTokens !== undefined && { output_tokens: m.usage.outputTokens }),
      ...(m.attempts !== undefined && { attempts: m.attempts }),
      ...(m.droppedRefs !== undefined && { dropped_refs: m.droppedRefs }),
      ...(m.councilNotes !== undefined && { council_notes: m.councilNotes }),
      ...(m.councilFailed !== undefined && { council_failed: m.councilFailed }),
      ...extra,
    });
    const retry = typeof result.body.retry_after === 'number' ? { 'Retry-After': String(result.body.retry_after) } : undefined;
    return json(result.status, result.body, retry);
  };
  const fail = (status: number, error: string, extra?: Partial<LogFields>) => done({ status, body: { error } }, extra);

  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const store = token ? await deps.authenticate(token).catch(() => null) : null;
  if (!store) return fail(401, 'not_signed_in');

  if (!(req.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) return fail(415, 'unsupported_media_type');
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BODY_BYTES) return fail(413, 'request_too_large');
  const raw = await req.text().catch(() => null);
  if (raw === null || new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return fail(413, 'request_too_large');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, 'invalid_request');
  }

  const loaded = loadAiConfig(deps.env);
  if (!loaded.ok) return fail(503, 'not_configured', { config_problem: loaded.problem });

  try {
    return done(await handle(body, { store, provider: deps.provider(loaded.config), config: loaded.config }));
  } catch {
    return fail(500, 'server_error');
  }
}

// Validation helpers ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
/** Entry ids are the app's own local ids: short, printable, no surprises. */
export const isEntryId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(v);
export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));

export const invalid = (): HandlerResult => ({ status: 400, body: { error: 'invalid_request' } });

/** Maps how a ledger refused a request to a response. */
export function refused(begin: { outcome: 'busy' } | { outcome: 'rate'; retryAfter: number }): HandlerResult {
  return begin.outcome === 'busy'
    ? { status: 409, body: { error: 'busy' } }
    : { status: 429, body: { error: 'rate_limited', retry_after: begin.retryAfter } };
}

/** Provider failures as responses. A provider 429 is reported separately from Kindway's own limit. */
export function providerFailed(error: 'rate' | 'timeout' | 'unavailable' | 'invalid' | 'config', retryAfter?: number): HandlerResult {
  switch (error) {
    case 'rate':
      return { status: 503, body: { error: 'provider_busy', ...(retryAfter && { retry_after: retryAfter }) } };
    case 'timeout':
      return { status: 504, body: { error: 'timeout' } };
    case 'invalid':
      return { status: 502, body: { error: 'invalid_response' } };
    case 'config':
      return { status: 503, body: { error: 'not_configured' } };
    default:
      return { status: 503, body: { error: 'provider_unavailable' } };
  }
}

/** Untrusted text goes inside tags; stop it from closing or opening them. */
export const fence = (s: string) => s.replace(/<\s*\/?\s*(entry|entries|earlier_entries|earlier|context|reflection|conversation|turn|message|council|note)\b/gi, '‹$1');
