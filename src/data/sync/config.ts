export interface PowerSyncConfiguration {
  endpoint: string;
}

export function readPowerSyncConfiguration(value = process.env.EXPO_PUBLIC_POWERSYNC_URL): {
  configuration: PowerSyncConfiguration | null;
  error: string | null;
} {
  const candidate = value?.trim();
  if (!candidate) {
    return { configuration: null, error: 'Synchronization is not configured for this build.' };
  }

  try {
    const url = new URL(candidate);
    const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (url.protocol !== 'https:' && !localHttp) {
      return { configuration: null, error: 'The synchronization endpoint must use HTTPS.' };
    }
    return { configuration: { endpoint: candidate.replace(/\/+$/, '') }, error: null };
  } catch {
    return { configuration: null, error: 'The synchronization endpoint is invalid.' };
  }
}

export const {
  configuration: powerSyncConfiguration,
  error: powerSyncConfigurationError,
} = readPowerSyncConfiguration();
