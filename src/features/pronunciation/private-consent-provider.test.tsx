import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import {
  PrivatePronunciationConsentProvider,
  usePrivatePronunciationConsent,
} from './private-consent-provider';

const mockStorage = new Map<string, string>();
const mockClearPrivateCache = jest.fn(async () => undefined);
const mockDeletePrivatePronunciation = jest.fn(async () => undefined);
const mockAuth: { user: { id: string } | null } = {
  user: { id: '00000000-0000-4000-8000-0000000000a1' },
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async (key: string) => mockStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => { mockStorage.set(key, value); },
  removeItem: async (key: string) => { mockStorage.delete(key); },
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, userId: string) => `hash-${userId}`,
}));

jest.mock('@/providers/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/features/pronunciation/private-cache', () => ({
  clearPrivateNeuralPronunciationCache: (...args: unknown[]) => mockClearPrivateCache(...args),
}));
jest.mock('@/features/pronunciation/private-cloud', () => ({
  deletePrivateNeuralPronunciation: () => mockDeletePrivatePronunciation(),
}));

function Probe() {
  const consent = usePrivatePronunciationConsent();
  return <View>
    <Text>{consent.status}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="enable" onPress={() => void consent.enable()}>
      <Text>enable</Text>
    </Pressable>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="delete"
      onPress={() => void consent.disableAndDelete().catch(() => undefined)}
    >
      <Text>delete</Text>
    </Pressable>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="retry"
      onPress={() => void consent.retryDeletion().catch(() => undefined)}
    >
      <Text>retry</Text>
    </Pressable>
  </View>;
}

describe('private pronunciation consent', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
    mockAuth.user = { id: '00000000-0000-4000-8000-0000000000a1' };
    mockClearPrivateCache.mockResolvedValue(undefined);
    mockDeletePrivatePronunciation.mockResolvedValue(undefined);
  });

  it('defaults off and persists explicit consent in an account-hashed key', async () => {
    const screen = await render(
      <PrivatePronunciationConsentProvider><Probe/></PrivatePronunciationConsentProvider>,
    );
    await waitFor(() => expect(screen.getByText('disabled')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', { name: 'enable' }));
    await waitFor(() => expect(screen.getByText('enabled')).toBeTruthy());

    expect([...mockStorage.keys()]).toEqual([
      'wordfold.privatePronunciationConsent.v1.hash-00000000-0000-4000-8000-0000000000a1',
    ]);
    expect([...mockStorage.values()][0]).not.toContain('00000000-0000-4000-8000-0000000000a1');
  });

  it('disables first and retains a retryable deletion state when server deletion fails', async () => {
    mockDeletePrivatePronunciation.mockRejectedValueOnce(new Error('offline'));
    const screen = await render(
      <PrivatePronunciationConsentProvider><Probe/></PrivatePronunciationConsentProvider>,
    );
    await waitFor(() => expect(screen.getByText('disabled')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'enable' }));
    await waitFor(() => expect(screen.getByText('enabled')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => expect(screen.getByText('deletion_pending')).toBeTruthy());
    expect(mockClearPrivateCache).toHaveBeenCalledWith(mockAuth.user!.id);

    await fireEvent.press(screen.getByRole('button', { name: 'retry' }));
    await waitFor(() => expect(screen.getByText('disabled')).toBeTruthy());
    expect(mockDeletePrivatePronunciation).toHaveBeenCalledTimes(2);
    expect(mockStorage.size).toBe(0);
  });

  it('does not carry one account choice into another account', async () => {
    const screen = await render(
      <PrivatePronunciationConsentProvider><Probe/></PrivatePronunciationConsentProvider>,
    );
    await waitFor(() => expect(screen.getByText('disabled')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'enable' }));
    await waitFor(() => expect(screen.getByText('enabled')).toBeTruthy());

    mockAuth.user = { id: '00000000-0000-4000-8000-0000000000b2' };
    await act(async () => {
      screen.rerender(
        <PrivatePronunciationConsentProvider><Probe/></PrivatePronunciationConsentProvider>,
      );
    });
    await waitFor(() => expect(screen.getByText('disabled')).toBeTruthy());
  });
});
