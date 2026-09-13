import AsyncStorage from '@react-native-async-storage/async-storage';

import { parsePolicy, type ReleasePolicy, type ReleaseTarget } from './release-policy';

const endpoint = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export function releaseCacheKey(target: ReleaseTarget) {
  return `wordfold.release-policy.v1:${endpoint}:${target.applicationId}:${target.platform}:${target.channel}`;
}

export async function readStoredValue(key: string): Promise<unknown> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function writeStoredValue(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage failure must not prevent checking or displaying an update.
  }
}

export async function fetchReleasePolicy(target: ReleaseTarget): Promise<ReleasePolicy | null> {
  if (!endpoint || !publicKey) throw new Error('Release service is not configured.');
  const url = new URL(`${endpoint.replace(/\/$/, '')}/rest/v1/app_release_policies`);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('Invalid release service URL.');
  }
  url.searchParams.set('select', 'latest_build,minimum_supported_build,message,store_url');
  url.searchParams.set('platform', `eq.${target.platform}`);
  url.searchParams.set('channel', `eq.${target.channel}`);
  url.searchParams.set('application_id', `eq.${target.applicationId}`);
  url.searchParams.set('limit', '1');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    // Public policy must work for guests and expired sessions without waiting for auth.
    const response = await fetch(url.toString(), {
      headers: { apikey: publicKey }, signal: controller.signal,
    });
    if (!response.ok) throw new Error('Release check failed.');
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid release response.');
    if (rows.length === 0) return null;
    const policy = parsePolicy(rows[0], target);
    if (!policy) throw new Error('Invalid release policy.');
    return policy;
  } finally {
    clearTimeout(timeout);
  }
}
