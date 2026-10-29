/**
 * Which address email links return to, per environment, using the real expo-linking. Kept apart
 * from screen tests: the router's test helpers replace expo-linking for the whole file.
 */
type Env = { expoGo: boolean; executionEnvironment: string; expoGoConfig: object | null; hostUri?: string; origin: string | null };
const ENVS: Record<string, Env & { expected: string }> = {
  // What Expo Go on SDK 58 really reports (seen on an emulator): "bare", not "storeClient".
  'Expo Go on the LAN': { expoGo: true, executionEnvironment: 'bare', expoGoConfig: { developer: {} }, hostUri: '192.168.1.20:8081', origin: 'http://192.168.1.20:8081', expected: 'exp://192.168.1.20:8081/--/auth/confirm' },
  'Expo Go through a tunnel': {
    expoGo: true,
    executionEnvironment: 'storeClient',
    expoGoConfig: { developer: {} },
    hostUri: 'abc-anonymous-8081.exp.direct',
    origin: 'https://abc-anonymous-8081.exp.direct',
    expected: 'exps://abc-anonymous-8081.exp.direct/--/auth/confirm',
  },
  // createURL alone would give kindway://192.168.1.20:8081/auth/confirm here.
  'a development build': { expoGo: false, executionEnvironment: 'bare', expoGoConfig: null, hostUri: '192.168.1.20:8081', origin: 'http://192.168.1.20:8081', expected: 'kindway:///auth/confirm' },
  'a release build': { expoGo: false, executionEnvironment: 'standalone', expoGoConfig: null, origin: null, expected: 'kindway:///auth/confirm' },
};

/** Loads the real auth module and expo-linking as they would run in `env`. */
function inEnv<T>(env: Env, run: (auth: typeof import('@/services/auth')) => T): T {
  let out!: T;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { executionEnvironment: env.executionEnvironment, expoGoConfig: env.expoGoConfig, expoConfig: { scheme: 'kindway', hostUri: env.hostUri, android: { package: 'app.kindway' } } },
      ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
    }));
    jest.doMock('expo', () => ({ isRunningInExpoGo: () => env.expoGo }));
    jest.doMock('expo/internal/bundle-origin', () => ({ getBundleOrigin: () => env.origin }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    out = run(require('@/services/auth'));
  });
  return out;
}

describe('email link redirects by environment', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(Object.entries(ENVS))('%s', (_name, env) => {
    expect(inEnv(env, (auth) => auth.redirectTo('auth/confirm'))).toBe(env.expected);
    expect(inEnv(env, (auth) => auth.redirectTo('reset-password'))).toBe(env.expected.replace('auth/confirm', 'reset-password'));
  });

  it.each(Object.entries(ENVS))('sign-up in %s asks Supabase for that redirect, and logs only it', async (_name, env) => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const signUp = jest.fn(async (_args: unknown) => ({ data: { user: { identities: [{}] }, session: null }, error: null }));
    const service = inEnv(env, (auth) => auth.supabaseAuth({ auth: { signUp } } as never));
    await expect(service.signUp('a@example.test', 'correct-horse-1')).resolves.toEqual({ ok: true, needsConfirmation: true });
    expect(signUp).toHaveBeenCalledWith({ email: 'a@example.test', password: 'correct-horse-1', options: { emailRedirectTo: env.expected } });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toBe(`[auth] confirmation links return to ${env.expected}`);
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/correct-horse|example\.test/);
  });
});

describe('with the email-link landing page configured', () => {
  const PAGE = 'https://example.github.io/kindway-links/';
  beforeEach(() => {
    process.env.EXPO_PUBLIC_AUTH_LINK_URL = PAGE;
  });
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_AUTH_LINK_URL;
  });

  it.each(Object.entries(ENVS))('%s goes to the page, carrying the app address', (_name, env) => {
    const url = inEnv(env, (auth) => auth.redirectTo('auth/confirm'));
    expect(url).toBe(`${PAGE}?to=${encodeURIComponent(env.expected)}`);
    expect(new URL(url).searchParams.get('to')).toBe(env.expected);
    expect(inEnv(env, (auth) => auth.appTarget('reset-password'))).toBe(env.expected.replace('auth/confirm', 'reset-password'));
  });
});

describe('in the web app', () => {
  const SITE = 'https://kindway.pages.dev';
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  beforeEach(() => {
    Object.defineProperty(globalThis, 'location', { value: { origin: SITE }, configurable: true });
    // The landing page is for opening the Android app; the web app never uses it.
    process.env.EXPO_PUBLIC_AUTH_LINK_URL = 'https://example.github.io/kindway-links/';
  });
  afterEach(() => {
    if (location) Object.defineProperty(globalThis, 'location', location);
    else delete (globalThis as { location?: unknown }).location;
    delete process.env.EXPO_PUBLIC_AUTH_LINK_URL;
  });

  const onTheWeb = <T,>(run: (auth: typeof import('@/services/auth')) => T): T => {
    let out!: T;
    jest.isolateModules(() => {
      jest.doMock('@/services/platform', () => ({ onWeb: () => true }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      out = run(require('@/services/auth'));
    });
    return out;
  };

  it('sends email links back to the site itself', () => {
    expect(onTheWeb((auth) => auth.redirectTo('auth/confirm'))).toBe(`${SITE}/auth/confirm`);
    expect(onTheWeb((auth) => auth.redirectTo('reset-password'))).toBe(`${SITE}/reset-password`);
  });
});

describe('a link opened where it was not requested', () => {
  it('is reported with a reference the screens can recognise', async () => {
    const exchangeCodeForSession = jest.fn(async () => ({ error: { name: 'AuthPKCECodeVerifierMissingError', message: 'missing' } }));
    const { supabaseAuth } = jest.requireActual<typeof import('@/services/auth')>('@/services/auth');
    const result = await supabaseAuth({ auth: { exchangeCodeForSession } } as never).exchangeCode('abcdefgh-1234');
    expect(result).toEqual({ ok: false, message: 'Open this link on the device where you asked for it, or request a new one here.', reference: 'pkce_verifier_missing' });
  });
});

describe('a link from another browser whose flow state is gone', () => {
  afterEach(() => jest.restoreAllMocks());
  const exchange = (onTheWeb: boolean) => {
    let auth!: typeof import('@/services/auth');
    jest.isolateModules(() => {
      // Set on whatever platform module auth will get: an earlier test's mock of it can be reused here.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      jest.spyOn(require('@/services/platform') as { onWeb: () => boolean }, 'onWeb').mockReturnValue(onTheWeb);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      auth = require('@/services/auth');
    });
    const exchangeCodeForSession = jest.fn(async () => ({ error: { name: 'AuthApiError', code: 'flow_state_not_found', status: 404, message: 'invalid flow state' } }));
    return auth.supabaseAuth({ auth: { exchangeCodeForSession } } as never).exchangeCode('abcdefgh-1234');
  };

  it('is treated on the web like a missing verifier: opened outside where it was asked for', async () => {
    await expect(exchange(true)).resolves.toEqual({ ok: false, message: 'Open this link on the device where you asked for it, or request a new one here.', reference: 'pkce_verifier_missing' });
  });

  it('keeps its usual message in the Android app', async () => {
    await expect(exchange(false)).resolves.toEqual({ ok: false, message: 'This link has expired or was already used. Request a new one.' });
  });
});
