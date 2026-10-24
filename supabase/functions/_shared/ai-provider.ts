// The provider boundary. Reflection and review logic only see `AiProvider`; switching provider
// means adding an adapter here, a disclosure version, and a config value.
//
// The Groq adapter uses only the ordinary chat-completions inference endpoint: no tools, web
// search, Batch, Files or fine-tuning. Errors are reduced to a coarse code; provider messages
// can echo request content, so they are never passed on or logged.

export type ProviderError = 'rate' | 'timeout' | 'unavailable' | 'invalid' | 'config';

export type CompletionRequest = {
  system: string;
  user: string;
  /** A JSON schema the reply must follow (strict mode where the provider supports it). */
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
};

export type Usage = { inputTokens?: number; outputTokens?: number };

export type CompletionResult =
  | { ok: true; text: string; usage: Usage }
  | { ok: false; error: ProviderError; retryAfter?: number; status?: number };

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function groqProvider({ apiKey, model, timeoutMs, fetch: doFetch = fetch }: { apiKey: string; model: string; timeoutMs: number; fetch?: Fetch }): AiProvider {
  return {
    name: 'groq',
    model,
    async complete(req) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(GROQ_URL, {
          method: 'POST',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.user },
            ],
            response_format: { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.schema } },
            max_completion_tokens: req.maxTokens,
            temperature: 0.6,
            reasoning_effort: 'low',
            include_reasoning: false,
            stream: false,
          }),
        });
        if (!res.ok) {
          // Drain without reading the message into anything that could be logged. Groq's 400 is
          // often json_validate_failed (the model's output broke the schema), so it maps to
          // `invalid`. A body without cancel() (node-fetch, in the live eval) must not hide it.
          await Promise.resolve()
            .then(() => res.body?.cancel())
            .catch(() => {});
          return { ok: false, error: errorFor(res.status), status: res.status, retryAfter: retryAfter(res.headers.get('retry-after')) };
        }
        const data = (await res.json().catch(() => null)) as GroqResponse | null;
        const choice = data?.choices?.[0];
        const text = choice?.message?.content;
        // A reply cut off by the token limit is not valid JSON we can trust.
        if (typeof text !== 'string' || !text || choice?.finish_reason === 'length') return { ok: false, error: 'invalid', status: res.status };
        return { ok: true, text, usage: { inputTokens: data?.usage?.prompt_tokens, outputTokens: data?.usage?.completion_tokens } };
      } catch (e) {
        return { ok: false, error: controller.signal.aborted || (e instanceof Error && e.name === 'AbortError') ? 'timeout' : 'unavailable' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

type GroqResponse = {
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function errorFor(status: number): ProviderError {
  if (status === 429 || status === 498) return 'rate';
  if (status === 401 || status === 403 || status === 404) return 'config';
  if (status === 400 || status === 413 || status === 422) return 'invalid';
  return 'unavailable';
}

function retryAfter(header: string | null) {
  const n = header ? Number(header) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : undefined;
}
