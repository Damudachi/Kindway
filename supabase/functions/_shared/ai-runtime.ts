// Deno-only wiring for the AI functions: environment, the caller-scoped Supabase client, the
// provider adapter and the log line. Kept apart from the logic so Jest can test that without Deno.
import { createClient } from 'npm:@supabase/supabase-js@2';

import type { Deps } from './ai-http.ts';
import { groqProvider } from './ai-provider.ts';
import { supabaseAiStore } from './ai-store.ts';

function publishableKey() {
  const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (keys) {
    try {
      const key = JSON.parse(keys)['default'];
      if (key) return key as string;
    } catch {
      // Fall through to the legacy key.
    }
  }
  return Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');
}

export const runtimeDeps: Deps = {
  env: (name) => Deno.env.get(name),

  async authenticate(token) {
    const url = Deno.env.get('SUPABASE_URL');
    const key = publishableKey();
    if (!url || !key) return null;
    // Every query runs as the caller, so Row Level Security applies; no service-role key here.
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    // Ask Auth who this token belongs to; a forged, expired or revoked token fails here.
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return supabaseAiStore(client);
  },

  provider: (config) => groqProvider({ apiKey: config.apiKey, model: config.model, timeoutMs: config.timeoutMs }),

  // One JSON line of operational metadata. See LogFields: no content ever goes in here.
  log: (fields) => console.log(JSON.stringify(fields)),
};
