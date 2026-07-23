import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

import { PronunciationControls } from './pronunciation-controls';

const mockCacheScope: { type: 'guest' | 'account'; userId?: string } = {
  type: 'account', userId: 'reader',
};
let mockHasOfflineAsset = false;
let mockConsentStatus: 'loading' | 'disabled' | 'enabled' | 'deletion_pending' = 'disabled';

jest.mock('@/features/pronunciation/cache-scope', () => ({
  usePronunciationCacheScope: () => mockCacheScope,
}));

jest.mock('@/features/pronunciation/offline-downloads-provider', () => ({
  useOfflinePronunciationDownloads: () => ({
    hasAsset: () => mockHasOfflineAsset,
  }),
}));

jest.mock('@/features/pronunciation/private-consent-provider', () => ({
  usePrivatePronunciationConsent: () => ({
    status: mockConsentStatus,
    userId: mockCacheScope.userId ?? null,
  }),
}));

jest.mock('@/components/pronunciation-button', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    PronunciationButton: () => {
      return <Pressable accessibilityRole="button" accessibilityLabel="device"><Text>device</Text></Pressable>;
    },
  };
});

jest.mock('@/components/neural-pronunciation-button', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    NeuralPronunciationButton: ({ offlineOnly }: { offlineOnly?: boolean }) => {
      const label = offlineOnly ? 'neural-offline' : 'neural';
      return <Pressable accessibilityRole="button" accessibilityLabel={label}><Text>{label}</Text></Pressable>;
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
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED;
    delete process.env.EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED;
  });

  it('shows both choices for an eligible signed-in catalog word', async () => {
    const screen = await render(<PronunciationControls {...props}/>);
    expect(screen.getByLabelText('device')).toBeTruthy();
    expect(screen.getByLabelText('neural')).toBeTruthy();
  });

  it('keeps device voice but hides neural for edited text, signed-out users, and web', async () => {
    const edited = await render(<PronunciationControls {...props} text="Scope"/>);
    expect(edited.getByLabelText('device')).toBeTruthy();
    expect(edited.queryByLabelText('neural')).toBeNull();

    Object.assign(mockCacheScope, { type: 'guest', userId: undefined });
    const signedOut = await render(<PronunciationControls {...props}/>);
    expect(signedOut.queryByLabelText('neural')).toBeNull();

    mockHasOfflineAsset = true;
    const downloaded = await render(<PronunciationControls {...props}/>);
    expect(downloaded.getByLabelText('neural-offline')).toBeTruthy();

    Object.assign(mockCacheScope, { type: 'account', userId: 'reader' });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const web = await render(<PronunciationControls {...props}/>);
    expect(web.queryByLabelText('neural')).toBeNull();
  });

  it('offers private cloud review for a signed-in manual word and honors consent', async () => {
    const manual = { ...props, text: 'custom phrase', catalogSenseId: null };
    const disabled = await render(<PronunciationControls {...manual}/>);
    expect(disabled.getByLabelText('device')).toBeTruthy();
    expect(disabled.getByLabelText('private-disabled')).toBeTruthy();
    expect(disabled.queryByLabelText('neural')).toBeNull();

    mockConsentStatus = 'enabled';
    const enabled = await render(<PronunciationControls {...manual}/>);
    expect(enabled.getByLabelText('private-enabled')).toBeTruthy();

    Object.assign(mockCacheScope, { type: 'guest', userId: undefined });
    const signedOut = await render(<PronunciationControls {...manual}/>);
    expect(signedOut.queryByLabelText('private-enabled')).toBeNull();
    expect(signedOut.queryByLabelText('private-disabled')).toBeNull();
  });
});
