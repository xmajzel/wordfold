import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { PronunciationControls } from './pronunciation-controls';

const mockCacheScope: { type: 'guest' | 'account'; userId?: string } = {
  type: 'account', userId: 'reader',
};
let mockHasOfflineAsset = false;
let mockConsentStatus: 'loading' | 'disabled' | 'enabled' | 'deletion_pending' = 'disabled';
let mockConsentUserId: string | null = 'reader';
let mockVoicePreference: 'device' | 'neural-en-US' | 'neural-en-GB' = 'device';
const mockNeuralRender = jest.fn();
const mockDeviceRender = jest.fn();

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({ pronunciationVoicePreference: mockVoicePreference }),
}));

jest.mock('@/features/pronunciation/cache-scope', () => ({
  usePronunciationCacheScope: () => mockCacheScope,
}));

jest.mock('@/features/pronunciation/offline-downloads-provider', () => ({
  useOfflinePronunciationDownloads: () => ({
    hasAsset: () => mockHasOfflineAsset,
  }),
}));

jest.mock('@/features/pronunciation/private-consent', () => ({
  usePrivatePronunciationConsent: () => ({
    status: mockConsentStatus,
    userId: mockConsentUserId,
  }),
}));

jest.mock('@/components/pronunciation-button', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PronunciationButton: ({ idleLabel, locale, text }: { idleLabel?: string; locale: string; text: string }) => {
      mockDeviceRender({ idleLabel, locale, text });
      const label = idleLabel ?? 'device';
      return <Pressable accessibilityRole="button" accessibilityLabel={label}><Text>{label}</Text></Pressable>;
    },
  };
});

jest.mock('@/components/neural-pronunciation-button', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    NeuralPronunciationButton: ({
      offlineOnly,
      locale,
      onUnavailable,
    }: { offlineOnly?: boolean; locale: string; onUnavailable?(): void }) => {
      mockNeuralRender(locale);
      const label = offlineOnly ? 'neural-offline' : 'neural';
      return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onUnavailable}><Text>{label}</Text></Pressable>;
    },
  };
});

jest.mock('@/components/private-pronunciation-button', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PrivatePronunciationButton: ({ consentEnabled }: { consentEnabled: boolean }) => {
      const label = consentEnabled ? 'private-enabled' : 'private-disabled';
      return <Pressable accessibilityRole="button" accessibilityLabel={label}><Text>{label}</Text></Pressable>;
    },
  };
});

describe('PronunciationControls', () => {
  const props = {
    text: 'scope', sourceLanguageCode: 'en', locale: 'en-US',
    catalogSenseId: 'wordfold:scope:business',
  };

  beforeEach(() => {
    process.env.EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED = 'true';
    process.env.EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED = 'true';
    Object.assign(mockCacheScope, { type: 'account', userId: 'reader' });
    mockHasOfflineAsset = false;
    mockConsentStatus = 'disabled';
    mockConsentUserId = 'reader';
    mockVoicePreference = 'device';
    mockNeuralRender.mockClear();
    mockDeviceRender.mockClear();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED;
    delete process.env.EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED;
  });

  it('shows only the phone voice when it is preferred', async () => {
    const screen = await render(<PronunciationControls {...props}/>);
    expect(screen.getByLabelText('Phone voice')).toBeTruthy();
    expect(screen.queryByLabelText('neural')).toBeNull();
  });

  it('uses the preferred natural locale for English playback', async () => {
    mockVoicePreference = 'neural-en-GB';
    const screen = await render(<PronunciationControls {...props}/>);
    expect(screen.getByLabelText('neural')).toBeTruthy();
    expect(screen.queryByLabelText('Phone voice')).toBeNull();
    expect(mockNeuralRender).toHaveBeenCalledWith('en-GB');
  });

  it('keeps Spanish course pronunciation on the word exact locale even with a stale English preference', async () => {
    mockVoicePreference = 'neural-en-GB';
    const screen = await render(<PronunciationControls
      text="hola"
      sourceLanguageCode="es"
      locale="es-ES"
      catalogSenseId="wordfold:hola:greeting"
    />);

    expect(screen.getByLabelText('Phone voice')).toBeTruthy();
    expect(screen.queryByLabelText('neural')).toBeNull();
    expect(mockDeviceRender).toHaveBeenCalledWith({
      idleLabel: 'Phone voice',
      locale: 'es-ES',
      text: 'hola',
    });
  });

  it('uses the phone voice when natural pronunciation is unavailable', async () => {
    mockVoicePreference = 'neural-en-US';
    const edited = await render(<PronunciationControls {...props} text="Scope"/>);
    expect(edited.getByLabelText('Phone voice')).toBeTruthy();
    expect(edited.queryByLabelText('neural')).toBeNull();

    Object.assign(mockCacheScope, { type: 'guest', userId: undefined });
    const signedOut = await render(<PronunciationControls {...props}/>);
    expect(signedOut.getByLabelText('Phone voice')).toBeTruthy();
    expect(signedOut.queryByLabelText('neural')).toBeNull();

    mockHasOfflineAsset = true;
    const downloaded = await render(<PronunciationControls {...props}/>);
    expect(downloaded.getByLabelText('neural-offline')).toBeTruthy();

    Object.assign(mockCacheScope, { type: 'account', userId: 'reader' });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const web = await render(<PronunciationControls {...props}/>);
    expect(web.getByLabelText('Phone voice')).toBeTruthy();
    expect(web.queryByLabelText('neural')).toBeNull();
  });

  it('reveals a small phone fallback only after natural playback fails', async () => {
    mockVoicePreference = 'neural-en-US';
    const screen = await render(<PronunciationControls {...props}/>);
    expect(screen.queryByLabelText('Use phone voice instead')).toBeNull();

    await fireEvent.press(screen.getByLabelText('neural'));
    expect(screen.getByLabelText('Use phone voice instead')).toBeTruthy();
  });

  it('offers private cloud review for a signed-in manual word and honors consent', async () => {
    const manual = { ...props, text: 'custom phrase', catalogSenseId: null };
    const disabled = await render(<PronunciationControls {...manual}/>);
    expect(disabled.getByLabelText('Phone voice')).toBeTruthy();
    expect(disabled.getByLabelText('private-disabled')).toBeTruthy();
    expect(disabled.queryByLabelText('neural')).toBeNull();

    mockConsentStatus = 'enabled';
    const enabled = await render(<PronunciationControls {...manual}/>);
    expect(enabled.getByLabelText('private-enabled')).toBeTruthy();

    Object.assign(mockCacheScope, { type: 'guest', userId: undefined });
    const signedOut = await render(<PronunciationControls {...manual}/>);
    expect(signedOut.queryByLabelText('private-enabled')).toBeNull();
    expect(signedOut.queryByLabelText('private-disabled')).toBeNull();

    Object.assign(mockCacheScope, { type: 'account', userId: 'next-reader' });
    mockConsentUserId = 'reader';
    const transitioning = await render(<PronunciationControls {...manual}/>);
    expect(transitioning.queryByLabelText('private-enabled')).toBeNull();
    expect(transitioning.queryByLabelText('private-disabled')).toBeNull();
  });
});
