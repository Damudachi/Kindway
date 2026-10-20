import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * The Supabase client, or null when the app isn't configured for a project. Local-only mode
 * never needs it. Only client-safe values are read here: the project URL and the publishable
 * key. Access to data is enforced by Row Level Security on the server, never by this key.
 *
 * Sessions are kept in AsyncStorage (the app's existing device storage). It is not encrypted
 * by Kindway; see docs/supabase-setup.md.
 */
export type SupabaseConfig = { url: string; key: string };

export function readConfig(env: Record<string, string | undefined>): SupabaseConfig | null {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  if (!/^https:\/\/[^\s/]+$|^http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2|192\.168\.\d+\.\d+):\d+$/.test(url)) return null;
  // A secret key must never ship in the app; refuse to start with one.
  if (key.startsWith('sb_secret_') || /service_role/.test(decodeJwtRole(key))) return null;
  return { url, key };
}

function decodeJwtRole(key: string) {
  const part = key.split('.')[1];
  if (!part) return '';
  try {
    return atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return '';
  }
}

// Expo inlines EXPO_PUBLIC_* variables only when they're referenced literally.
const config = readConfig({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export const supabase: SupabaseClient | null = config
  ? createClient(config.url, config.key, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Email links come back as kindway://…?code=… and are exchanged on this device.
        flowType: 'pkce',
      },
    })
  : null;

// Refresh tokens only while the app is in the foreground.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
