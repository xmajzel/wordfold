import { act, render, waitFor } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';

import { PronunciationLibraryDownloadCoordinator } from './library-download-coordinator';

const mockReconcileLibrary = jest.fn(async () => undefined);
const mockAppData: Record<string, unknown> = {
  onboardingComplete: true,
  pronunciationVoicePreference: 'neural-en-US',
  words: [
    { sourceLanguageCode: 'en', catalogSenseId: 'sense-b' },
    { sourceLanguageCode: 'en', catalogSenseId: 'sense-a' },
    { sourceLanguageCode: 'en', catalogSenseId: 'sense-a' },
    { sourceLanguageCode: 'es', catalogSenseId: 'spanish-sense' },
    { sourceLanguageCode: 'en', catalogSenseId: null },
  ],
};
const mockDownloads = {
  packs: {},
  job: null,
  libraryJob: null,
  reconcileLibrary: mockReconcileLibrary,
};

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => mockAppData,
}));

jest.mock('@/features/pronunciation/offline-downloads-provider', () => ({
  useOfflinePronunciationDownloads: () => mockDownloads,
}));

describe('PronunciationLibraryDownloadCoordinator', () => {
  let onAppStateChange: ((state: string) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED = 'true';
    Object.assign(mockAppData, {
      onboardingComplete: true,
      pronunciationVoicePreference: 'neural-en-US',
    });
    Object.assign(mockDownloads, { job: null, libraryJob: null, packs: {} });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onAppStateChange = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED;
  });

  it('reconciles unique English catalog words for the preferred natural voice', async () => {
    await render(<PronunciationLibraryDownloadCoordinator/>);

    await waitFor(() => expect(mockReconcileLibrary).toHaveBeenCalledWith(
      'en-US',
      ['sense-a', 'sense-b'],
    ));
  });

  it('does not download Wordfold audio for the phone voice', async () => {
    mockAppData.pronunciationVoicePreference = 'device';
    await render(<PronunciationLibraryDownloadCoordinator/>);

    await act(async () => undefined);
    expect(mockReconcileLibrary).not.toHaveBeenCalled();
  });

  it('retries reconciliation when the app returns to the foreground', async () => {
    mockReconcileLibrary.mockRejectedValueOnce(new Error('offline'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await render(<PronunciationLibraryDownloadCoordinator/>);
    await waitFor(() => expect(mockReconcileLibrary).toHaveBeenCalledTimes(1));

    await act(async () => onAppStateChange?.('active'));
    await waitFor(() => expect(mockReconcileLibrary).toHaveBeenCalledTimes(2));
  });
});
