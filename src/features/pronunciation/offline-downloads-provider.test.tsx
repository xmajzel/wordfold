import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import {
  OfflinePronunciationDownloadsProvider,
  useOfflinePronunciationDownloads,
} from './offline-downloads-provider';

const mockInspections = new Map<string, Record<string, unknown>>();
const mockDownloadPack = jest.fn();
let mockDiskSpace = 1024 * 1024 * 1024;

jest.mock('@/features/pronunciation/offline-manifest', () => ({
  fetchOfflineManifestIndex: jest.fn(async () => ({
    shards: {
      'en-US': { sha256: 'a'.repeat(64) },
      'en-GB': { sha256: 'b'.repeat(64) },
    },
  })),
  fetchOfflineManifestShard: jest.fn(async (_index, locale) => ({ locale })),
}));

jest.mock('@/features/pronunciation/offline-store', () => ({
  OFFLINE_DOWNLOAD_DISK_RESERVE_BYTES: 25 * 1024 * 1024,
  buildOfflinePackPlan: (shard: { locale: string }, level: string, shardSha256: string) => ({
    schemaVersion: 1,
    catalogSha256: 'catalog',
    synthesisVersion: 'version',
    shardSha256,
    locale: shard.locale,
    level,
    assetCount: 1,
    totalAudioBytes: 128,
    assets: [],
  }),
  inspectOfflinePack: async (locale: string, level: string) => mockInspections.get(`${locale}:${level}`) ?? ({
    locale,
    level,
    state: 'not_downloaded',
    assetCount: 1,
    totalAudioBytes: null,
    downloadedCount: 0,
    downloadedBytes: 0,
    availableCatalogSenseIds: [],
    plan: null,
  }),
  downloadOfflinePack: (...args: unknown[]) => mockDownloadPack(...args),
  offlineAvailableDiskSpace: () => mockDiskSpace,
  removeOfflinePack: (locale: string, level: string) => mockInspections.delete(`${locale}:${level}`),
  removeOfflineLocale: (locale: string) => {
    for (const key of [...mockInspections.keys()]) if (key.startsWith(`${locale}:`)) mockInspections.delete(key);
  },
}));

function Probe() {
  const downloads = useOfflinePronunciationDownloads();
  const a1 = downloads.packs['en-US:A1'];
  const [error, setError] = useState('');
  const run = (operation: Promise<void>) => void operation.catch((reason) => setError(reason.message));
  return <>
    <Text>{a1.state}:{a1.totalAudioBytes ?? 'unknown'}</Text>
    <Text>{downloads.job ? `${downloads.job.stage}:${downloads.job.completedCount}` : 'idle'}</Text>
    <Text>{error}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="prepare" onPress={() => run(downloads.prepareManifests())}/>
    <Pressable accessibilityRole="button" accessibilityLabel="download" onPress={() => run(downloads.downloadLevel('en-US', 'A1'))}/>
    <Pressable accessibilityRole="button" accessibilityLabel="cancel" onPress={downloads.cancelDownload}/>
  </>;
}

describe('OfflinePronunciationDownloadsProvider', () => {
  beforeEach(() => {
    mockInspections.clear();
    mockDownloadPack.mockReset();
    mockDiskSpace = 1024 * 1024 * 1024;
  });

  it('loads manifest sizes and publishes verified download progress and completion', async () => {
    mockDownloadPack.mockImplementation(async (plan, options) => {
      options.onProgress({
        stage: 'downloading', assetCount: 1, totalBytes: 128,
        completedCount: 1, completedBytes: 128,
      });
      const inspection = {
        locale: plan.locale,
        level: plan.level,
        state: 'downloaded',
        assetCount: 1,
        totalAudioBytes: 128,
        downloadedCount: 1,
        downloadedBytes: 128,
        availableCatalogSenseIds: ['sense-a'],
        plan,
      };
      mockInspections.set(`${plan.locale}:${plan.level}`, inspection);
      return inspection;
    });
    const screen = await render(<OfflinePronunciationDownloadsProvider><Probe/></OfflinePronunciationDownloadsProvider>);

    await fireEvent.press(screen.getByRole('button', { name: 'prepare' }));
    await waitFor(() => expect(screen.getByText('not_downloaded:128')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'download' }));

    await waitFor(() => expect(screen.getByText('downloaded:128')).toBeTruthy());
    expect(mockDownloadPack).toHaveBeenCalledTimes(1);
    expect(screen.getByText('idle')).toBeTruthy();
  });

  it('blocks a pack when the reserve plus remaining bytes exceed free storage', async () => {
    mockDiskSpace = 0;
    const screen = await render(<OfflinePronunciationDownloadsProvider><Probe/></OfflinePronunciationDownloadsProvider>);

    await fireEvent.press(screen.getByRole('button', { name: 'prepare' }));
    await waitFor(() => expect(screen.getByText('not_downloaded:128')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'download' }));

    await waitFor(() => expect(screen.getByText('Not enough free device storage for this pronunciation download.')).toBeTruthy());
    expect(mockDownloadPack).not.toHaveBeenCalled();
  });

  it('aborts an active operation without surfacing cancellation as an error', async () => {
    mockDownloadPack.mockImplementation((_plan, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    const screen = await render(<OfflinePronunciationDownloadsProvider><Probe/></OfflinePronunciationDownloadsProvider>);

    await fireEvent.press(screen.getByRole('button', { name: 'prepare' }));
    await waitFor(() => expect(screen.getByText('not_downloaded:128')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'download' }));
    await waitFor(() => expect(screen.queryByText('idle')).toBeNull());
    await fireEvent.press(screen.getByRole('button', { name: 'cancel' }));

    await waitFor(() => expect(screen.getByText('idle')).toBeTruthy());
    expect(screen.queryByText('cancelled')).toBeNull();
  });
});
