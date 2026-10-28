// A real AI reflection on one of the caller's entries. Takes an entry id, a support style and an
// idempotency key; reads the entry itself as the caller. See _shared/reflection.ts.
import { serveAi } from '../_shared/ai-http.ts';
import { withCors } from '../_shared/cors.ts';
import { runtimeDeps } from '../_shared/ai-runtime.ts';
import { handleReflection } from '../_shared/reflection.ts';

Deno.serve(withCors((req) => serveAi('generate-reflection', req, runtimeDeps, handleReflection), runtimeDeps.env));
