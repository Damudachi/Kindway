// The server ("secret") key, from the Edge Functions' default secrets. It never leaves the server:
// delete-account uses it to delete the caller, and the AI functions to write AI rows and the request
// ledger for the verified caller. Prefers the new-style default secret key, then the legacy ones.
export function serverKey(env: (name: string) => string | undefined): string | undefined {
  const keys = env('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const key = JSON.parse(keys)['default'];
      if (typeof key === 'string' && key) return key;
    } catch {
      // Fall through to the legacy keys.
    }
  }
  return env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') || undefined;
}
