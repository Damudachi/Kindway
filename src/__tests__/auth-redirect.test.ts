/**
 * Which address email links return to, per environment, using the real expo-linking. Kept apart
 * from screen tests: the router's test helpers replace expo-linking for the whole file.
 */
type Env = { executionEnvironment: string; expoGoConfig: object | null; hostUri?: string; origin: string | null };
const ENVS: Record<string, Env & { expected: string }> = {
  'Expo Go on the LAN': { executionEnvironment: 'storeClient', expoGoConfig: { developer: {} }, hostUri: '192.168.1.20:8081', origin: 'http://192.168.1.20:8081', expected: 'exp://192.168.1.20:8081/--/auth/confirm' },
  'Expo Go through a tunnel': {
    executionEnvironment: 'storeClient',
    expoGoConfig: { developer: {} },
    hostUri: 'abc-anonymous-8081.exp.direct',
    origin: 'https://abc-anonymous-8081.exp.direct',
    expected: 'exps://abc-anonymous-8081.exp.direct/--/auth/confirm',
  },
  // createURL alone would give kindway://192.168.1.20:8081/auth/confirm here.
  'a development build': { executionEnvironment: 'bare', expoGoConfig: null, hostUri: '192.168.1.20:8081', origin: 'http://192.168.1.20:8081', expected: 'kindway:///auth/confirm' },
  'a release build': { executionEnvironment: 'standalone', expoGoConfig: null, origin: null, expected: 'kindway:///auth/confirm' },
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

