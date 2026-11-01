import { Linking, Platform } from 'react-native';

import { onWeb } from '@/services/platform';

/** The address "Contact us" writes to. Kept in one place so it's easy to change. */
export const SUPPORT_EMAIL = 'aldrichgavriels@gmail.com';

export const POLICY_URLS = {
  privacy: 'https://kindway.pages.dev/privacy.html',
  terms: 'https://kindway.pages.dev/terms.html',
} as const;

export type AppInfo = { version: string | null; updateId: string | null; web: boolean; platform: string; os: string };

/**
 * What this build is. expo-constants and expo-updates load on first use and any failure (missing
 * native module, Expo Go quirks) just leaves that field empty, so this never throws.
 */
export function appInfo(): AppInfo {
  const web = onWeb();
  let version: string | null = null;
  let updateId: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily, see above
    const Constants = (require('expo-constants') as typeof import('expo-constants')).default;
    version = Constants.expoConfig?.version ?? null;
  } catch {
    version = null;
  }
  if (!web) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily, see above
      updateId = (require('expo-updates') as typeof import('expo-updates')).updateId ?? null;
    } catch {
      updateId = null;
    }
  }
  return { version, updateId, web, platform: Platform.OS, os: String(Platform.Version) };
}

/** "Version 1.3.0 · update 1a2b3c4", "… · built in" when no update is running, and just the version on the web. */
export function versionLabel({ version, updateId, web }: Pick<AppInfo, 'version' | 'updateId' | 'web'>): string {
  const base = `Version ${version ?? 'unknown'}`;
  if (web) return base;
  return updateId ? `${base} · update ${updateId.slice(0, 7)}` : `${base} · built in`;
}

/**
 * The "Contact us" email: a few blank lines to write in, then the build details. No journal text,
 * email or user id. The web app has no updates, and react-native-web's OS version is a placeholder.
 */
export function feedbackMailto({ version, updateId, platform, os, web = false }: { version: string; updateId: string | null; platform: string; os: string; web?: boolean }): string {
  const details = web ? [`App: ${version}`, `Platform: ${platform}`] : [`App: ${version}`, `Update: ${updateId ?? 'built in'}`, `Platform: ${platform} ${os}`];
  const body = ['', '', '', '---', ...details].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Kindway feedback')}&body=${encodeURIComponent(body)}`;
}

/** Opens a policy page: the in-app browser on Android, a new tab on the web. */
export async function openPolicy(kind: keyof typeof POLICY_URLS): Promise<void> {
  const url = POLICY_URLS[kind];
  if (onWeb()) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded lazily, see above
    await (require('expo-web-browser') as typeof import('expo-web-browser')).openBrowserAsync(url);
  } catch {
    // No in-app browser: hand the link to the system.
    await Linking.openURL(url).catch(() => undefined);
  }
}
