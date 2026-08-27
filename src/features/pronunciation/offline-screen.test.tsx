import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, Platform } from 'react-native';

import OfflinePronunciationScreen from '@/app/offline-pronunciation';

const mockDownloadLevel = jest.fn(async () => undefined);
const mockDownloadLocale = jest.fn(async () => undefined);
const mockCancelDownload = jest.fn();
const mockRemoveLevel = jest.fn(async () => undefined);
const mockRemoveLocale = jest.fn(async () => undefined);
const mockPrepareManifests = jest.fn(async () => undefined);
const mockReconcileLibrary = jest.fn(async () => undefined);
const mockSaveVoice = jest.fn(async () => undefined);
const mockActiveCourse = {
  displayName: 'English with Slovak hints',
  sourceLanguageCode: 'en',
  defaultSourcePronunciationLocale: 'en-US',
  capabilities: { offlinePronunciation: true },
};
const mockPacks: Record<string, Record<string, unknown>> = {};
const mockDownloads: Record<string, unknown> = {
  packs: mockPacks,
  preparing: false,
  preparationError: null,
  availableDiskBytes: 512 * 1024 * 1024,
  job: null,
  libraryJob: null,
  libraryError: null,
  library: {
    'en-US': { locale: 'en-US', requiredCount: 0, requiredBytes: 0, downloadedCount: 0, downloadedBytes: 0 },
    'en-GB': { locale: 'en-GB', requiredCount: 0, requiredBytes: 0, downloadedCount: 0, downloadedBytes: 0 },
  },
  prepareManifests: mockPrepareManifests,
  downloadLevel: mockDownloadLevel,
  downloadLocale: mockDownloadLocale,
  cancelDownload: mockCancelDownload,
  removeLevel: mockRemoveLevel,
  removeLocale: mockRemoveLocale,
  reconcileLibrary: mockReconcileLibrary,
  hasAsset: jest.fn(() => false),
};

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: [],
    activeCourse: mockActiveCourse,
    pronunciationVoicePreference: 'neural-en-US',
    savePronunciationVoicePreference: mockSaveVoice,
  }),
}));

jest.mock('@/features/pronunciation/voice-samples', () => ({
  BUNDLED_VOICE_SAMPLE_TEXT: 'Hello! Learning a new language opens the door to new ideas, new places, and new conversations.',
  playBundledVoiceSample: jest.fn(async () => undefined),
  preloadBundledVoiceSamples: jest.fn(async () => undefined),
}));

jest.mock('@/features/pronunciation/offline-downloads-provider', () => ({
  OFFLINE_PRONUNCIATION_LOCALES: ['en-US', 'en-GB'],
  offlinePackKey: (locale: string, level: string) => `${locale}:${level}`,
  useOfflinePronunciationDownloads: () => mockDownloads,
}));

jest.mock('@/components/screen', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Screen: ({ children }: { children: ReactNode }) => <View>{children}</View> };
});

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

function resetPacks() {
  for (const key of Object.keys(mockPacks)) delete mockPacks[key];
  for (const locale of ['en-US', 'en-GB']) {
    for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
      mockPacks[`${locale}:${level}`] = {
        locale,
        level,
        state: 'not_downloaded',
        assetCount: 1,
        totalAudioBytes: 1024 * 1024,
        downloadedCount: 0,
        downloadedBytes: 0,
      };
    }
  }
}

describe('OfflinePronunciationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    resetPacks();
    Object.assign(mockDownloads, {
      preparing: false,
      preparationError: null,
      job: null,
      libraryJob: null,
      libraryError: null,
    });
    Object.assign(mockActiveCourse, {
      displayName: 'English with Slovak hints',
      sourceLanguageCode: 'en',
      defaultSourcePronunciationLocale: 'en-US',
      capabilities: { offlinePronunciation: true },
    });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  it('shows both voices and confirms a level before downloading it', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = await render(<OfflinePronunciationScreen/>);

    expect(screen.getByText('English · United States')).toBeTruthy();
    expect(screen.getByText('English · United Kingdom')).toBeTruthy();
    expect(screen.getAllByText('1 words · 1.0 MiB')).toHaveLength(12);

    await fireEvent.press(screen.getAllByRole('button', { name: 'Download' })[0]);
    expect(alert).toHaveBeenCalledWith(
      'Download en-US A1?',
      expect.stringContaining('1 pronunciations will use up to 1.0 MiB'),
      expect.any(Array),
    );
    const actions = alert.mock.calls[0][2] as { text: string; onPress?(): void }[];
    actions.find((action) => action.text === 'Download')?.onPress?.();
    await waitFor(() => expect(mockDownloadLevel).toHaveBeenCalledWith('en-US', 'A1'));
  });

  it('shows aggregate progress and allows cancellation', async () => {
    Object.assign(mockDownloads, {
      job: {
        locale: 'en-GB',
        levels: ['A1', 'A2'],
        currentLevel: 'A1',
        stage: 'downloading',
        assetCount: 2,
        totalBytes: 200,
        completedCount: 1,
        completedBytes: 100,
      },
    });
    const screen = await render(<OfflinePronunciationScreen/>);

    expect(screen.getByText('Downloading en-GB')).toBeTruthy();
    expect(screen.getByText('1 of 2 · 50%')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel download' }));
    expect(mockCancelDownload).toHaveBeenCalledTimes(1);
  });

  it('shows only honest exact-locale device guidance for the Spanish course', async () => {
    Object.assign(mockActiveCourse, {
      displayName: 'Spanish with Slovak hints',
      sourceLanguageCode: 'es',
      defaultSourcePronunciationLocale: 'es-ES',
      capabilities: { offlinePronunciation: false },
    });

    const screen = await render(<OfflinePronunciationScreen/>);

    expect(screen.getByText(/exact installed Spanish · Spain phone voice/)).toBeTruthy();
    expect(screen.getByText(/cannot verify whether that system voice works offline/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Choose Phone voice · Spanish · Spain' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Choose Ava · US English' })).toBeNull();
    expect(screen.queryByText('Whole level downloads · optional')).toBeNull();
    expect(mockPrepareManifests).not.toHaveBeenCalled();
  });

  it('documents exact-voice browser limitations for the Spanish course', async () => {
    Object.assign(mockActiveCourse, {
      displayName: 'Spanish with Slovak hints',
      sourceLanguageCode: 'es',
      defaultSourcePronunciationLocale: 'es-ES',
      capabilities: { offlinePronunciation: false },
    });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });

    const screen = await render(<OfflinePronunciationScreen/>);

    expect(screen.getByText(/Spanish · Spain pronunciation uses live browser speech/)).toBeTruthy();
    expect(screen.getByText(/cannot download or cache it on web/)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Choose Phone voice · Spanish · Spain' })).toBeNull();
    expect(mockPrepareManifests).not.toHaveBeenCalled();
  });
});
