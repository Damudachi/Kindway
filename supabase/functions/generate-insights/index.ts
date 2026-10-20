// A real AI review across entries the caller picked. Takes a period, the entry ids shown to the
// user and an idempotency key; re-reads and re-checks them as the caller. See _shared/insights.ts.
import { serveAi } from '../_shared/ai-http.ts';
import { runtimeDeps } from '../_shared/ai-runtime.ts';
import { handleInsights } from '../_shared/insights.ts';

Deno.serve((req) => serveAi('generate-insights', req, runtimeDeps, (body, ctx) => handleInsights(body, ctx)));
