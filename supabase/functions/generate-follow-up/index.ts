// A real AI reply in the follow-up conversation about one of the caller's entries. Takes an
// entry id, the user's message, a support style, an idempotency key and the ids of earlier
// exchanges to include; reads everything else itself as the caller. See _shared/follow-up.ts.
import { serveAi } from '../_shared/ai-http.ts';
import { runtimeDeps } from '../_shared/ai-runtime.ts';
import { handleFollowUp } from '../_shared/follow-up.ts';

Deno.serve((req) => serveAi('generate-follow-up', req, runtimeDeps, handleFollowUp));
