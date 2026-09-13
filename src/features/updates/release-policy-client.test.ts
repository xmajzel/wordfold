import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReleaseTarget } from './release-policy';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
const target: ReleaseTarget = { platform: 'android', channel: 'production', applicationId: 'com.jozefmajzel.wordfold', build: 5 };
const policy = { latest_build: 7, minimum_supported_build: 5, message: '', store_url: 'https://play.google.com/store/apps/details?id=com.jozefmajzel.wordfold' };
const originalFetch = globalThis.fetch;
const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const originalKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function client() {
  // Environment values are captured at module load, like an Expo bundle.
  return jest.requireActual<typeof import('./release-policy-client')>('./release-policy-client');
}

beforeEach(() => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://release.example.com';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-key';
  globalThis.fetch = jest.fn(async () => ({ ok: true, json: async () => [policy] })) as jest.Mock;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  jest.useRealTimers();
});

it('fetches a guest-readable policy scoped to platform, app, and channel', async () => {
  expect(await client().fetchReleasePolicy(target)).toEqual(policy);
  const [url, options] = (globalThis.fetch as jest.Mock).mock.calls[0];
  const params = new URL(url).searchParams;
  expect(params.get('platform')).toBe('eq.android');
  expect(params.get('channel')).toBe('eq.production');
  expect(params.get('application_id')).toBe(`eq.${target.applicationId}`);
  expect(options.headers).toEqual({ apikey: 'public-key' });
});

it('distinguishes a removed policy from a failed or invalid response', async () => {
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => [] });
  expect(await client().fetchReleasePolicy(target)).toBeNull();
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
  await expect(client().fetchReleasePolicy(target)).rejects.toThrow();
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => [{ latest_build: 7 }] });
  await expect(client().fetchReleasePolicy(target)).rejects.toThrow('Invalid release policy');
});

it('aborts a stalled network check after five seconds', async () => {
  jest.useFakeTimers();
  (globalThis.fetch as jest.Mock).mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const request = expect(client().fetchReleasePolicy(target)).rejects.toThrow('aborted');
  await jest.advanceTimersByTimeAsync(5000);
  await request;
});

it('isolates preview caches and tolerates corrupted storage', async () => {
  const api = client();
  expect(api.releaseCacheKey(target)).not.toBe(api.releaseCacheKey({ ...target, channel: 'preview' }));
  const storage = jest.requireMock<typeof AsyncStorage>('@react-native-async-storage/async-storage');
  (storage.getItem as jest.Mock).mockResolvedValue('{bad');
  expect(await api.readStoredValue('key')).toBeNull();
  (storage.setItem as jest.Mock).mockRejectedValue(new Error('full'));
  await expect(api.writeStoredValue('key', policy)).resolves.toBeUndefined();
});
