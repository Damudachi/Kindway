// Deletes the calling user's Kindway account and, through ON DELETE CASCADE, every row they own.
//
// Who to delete comes only from the verified access token on the request, never from the body,
// so a caller can delete their own account and nothing else. The admin key it needs is a
// default Edge Function secret on the server; it is never shipped in the app.
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function adminKey() {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const key = JSON.parse(keys)['default'];
      if (key) return key as string;
    } catch {
      // Fall through to the legacy key.
    }
  }
  return Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const url = Deno.env.get('SUPABASE_URL');
  const key = adminKey();
  if (!url || !key) return json(500, { error: 'not_configured' });
  if (!token) return json(401, { error: 'not_signed_in' });

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Ask Auth who this token belongs to; a forged or expired token fails here.
  const { data, error } = await admin.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) return json(401, { error: 'not_signed_in' });

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('delete-account failed', { status: deleteError.status });
    return json(500, { error: 'delete_failed' });
  }
  return json(200, { deleted: true });
});
