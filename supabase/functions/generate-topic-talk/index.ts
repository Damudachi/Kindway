// A real AI reply in a conversation about one of the caller's saved topics. Takes a topic id, the
// user's message, a support style, an idempotency key and the ids of earlier exchanges to include;
// reads the topic and its linked entries itself as the caller. See _shared/topic-talk.ts.
import { serveAi } from '../_shared/ai-http.ts';
import { withCors } from '../_shared/cors.ts';
import { runtimeDeps } from '../_shared/ai-runtime.ts';
import { handleTopicTalk } from '../_shared/topic-talk.ts';

Deno.serve(withCors((req) => serveAi('generate-topic-talk', req, runtimeDeps, handleTopicTalk), runtimeDeps.env));
