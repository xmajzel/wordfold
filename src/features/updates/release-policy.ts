export type ReleaseTarget = {
  platform: 'android' | 'ios';
  channel: string;
  applicationId: string;
  build: number;
};

export type ReleasePolicy = {
  latest_build: number;
  minimum_supported_build: number;
  message: string;
  store_url: string;
};

export function parseBuild(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const build = Number(value);
  return Number.isSafeInteger(build) ? build : null;
}

export function parsePolicy(value: unknown, target: ReleaseTarget): ReleasePolicy | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.latest_build) || !Number.isSafeInteger(row.minimum_supported_build)
    || (row.minimum_supported_build as number) < 1
    || (row.latest_build as number) < (row.minimum_supported_build as number)
    || typeof row.message !== 'string' || row.message.length > 500
    || typeof row.store_url !== 'string') return null;
  try {
    const url = new URL(row.store_url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (target.platform === 'android') {
      if (url.hostname !== 'play.google.com' || url.pathname !== '/store/apps/details'
        || url.searchParams.get('id') !== target.applicationId) return null;
    } else if (url.hostname !== 'apps.apple.com' || !/\/id\d+\/?$/.test(url.pathname)) return null;
  } catch {
    return null;
  }
  return {
    latest_build: row.latest_build as number,
    minimum_supported_build: row.minimum_supported_build as number,
    message: row.message,
    store_url: row.store_url,
  };
}

export function updateRequirement(policy: ReleasePolicy | null, build: number) {
  if (!policy) return 'none';
  if (build < policy.minimum_supported_build) return 'required';
  return build < policy.latest_build ? 'optional' : 'none';
}

export const REMIND_AFTER_MS = 24 * 60 * 60 * 1000;

export function isSnoozed(value: unknown, latestBuild: number, now: number): boolean {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.build === latestBuild && typeof item.at === 'number'
    && Number.isFinite(item.at) && item.at <= now && now - item.at < REMIND_AFTER_MS;
}
