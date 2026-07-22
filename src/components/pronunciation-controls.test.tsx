import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

import { PronunciationControls } from './pronunciation-controls';

const mockCacheScope: { type: 'guest' | 'account'; userId?: string } = {
  type: 'account', userId: 'reader',
};
let mockHasOfflineAsset = false;

jest.mock('@/features/pronunciation/cache-scope', () => ({
  usePronunciationCacheScope: () => mockCacheScope,
}));

jest.mock('@/features/pronunciation/offline-downloads-provider', () => ({
  useOfflinePronunciationDownloads: () => ({
    hasAsset: () => mockHasOfflineAsset,
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

describe('PronunciationControls', () => {
  const props = {
    text: 'scope', sourceLanguageCode: 'en', locale: 'en-US',
    catalogSenseId: 'wordfold:scope:business',
  };

  beforeEach(() => {
    process.env.EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED = 'true';
    Object.assign(mockCacheScope, { type: 'account', userId: 'reader' });
    mockHasOfflineAsset = false;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_PRONUNCIATION_NEURAL_PREVIEW_ENABLED;
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
});
