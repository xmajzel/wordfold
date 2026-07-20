import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { usePronunciationCacheScope } from './cache-scope';
import { PronunciationCacheScopeProvider } from './cache-scope-provider';

const mockClearAccountCache = jest.fn(async (_userId: string) => undefined);
let mockUserId: string | null = null;

jest.mock('@/features/pronunciation/cache', () => ({
  clearPronunciationAccountCache: (userId: string) => mockClearAccountCache(userId),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ user: mockUserId ? { id: mockUserId } : null }),
}));

function ScopeProbe() {
  const scope = usePronunciationCacheScope();
  return <Text>{scope.type === 'account' ? `account:${scope.userId}` : scope.type}</Text>;
}

describe('PronunciationCacheScopeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = null;
  });

  it('isolates signed-in files and clears the previous account on automatic session changes', async () => {
    mockUserId = 'account-a';
    const screen = await render(<PronunciationCacheScopeProvider><ScopeProbe/></PronunciationCacheScopeProvider>);
    expect(screen.getByText('account:account-a')).toBeTruthy();

    mockUserId = 'account-b';
    await screen.rerender(<PronunciationCacheScopeProvider><ScopeProbe/></PronunciationCacheScopeProvider>);

    expect(screen.getByText('account:account-b')).toBeTruthy();
    await waitFor(() => expect(mockClearAccountCache).toHaveBeenCalledWith('account-a'));
  });

  it('keeps guest cache separate without treating it as an account cache', async () => {
    const screen = await render(<PronunciationCacheScopeProvider><ScopeProbe/></PronunciationCacheScopeProvider>);

    expect(screen.getByText('guest')).toBeTruthy();
    expect(mockClearAccountCache).not.toHaveBeenCalled();
  });
});
