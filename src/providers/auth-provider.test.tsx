import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import type { Session } from '@supabase/supabase-js';

const mockUnsubscribe = jest.fn();
const mockLinkRemove = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();
const mockSetSession = jest.fn();
const mockStartAutoRefresh = jest.fn();
const mockStopAutoRefresh = jest.fn();
const mockGetSession = jest.fn<Promise<{ data: { session: Session | null }; error: null }>, []>();
let mockInitialUrl: string | null = null;

const mockSupabase = {
  auth: {
    onAuthStateChange: jest.fn((_callback: (event: string, session: Session | null) => void) => {
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    }),
    getSession: mockGetSession,
    signInWithPassword: mockSignInWithPassword,
    signUp: mockSignUp,
    signOut: mockSignOut,
    setSession: mockSetSession,
    startAutoRefresh: mockStartAutoRefresh,
    stopAutoRefresh: mockStopAutoRefresh,
  },
};

jest.mock('@/data/supabase/client', () => ({
  supabase: mockSupabase,
  supabaseConfigurationError: null,
}));

jest.mock('expo-linking', () => ({
  createURL: () => 'wordfold://account',
  getInitialURL: jest.fn(async () => mockInitialUrl),
  addEventListener: jest.fn(() => ({ remove: mockLinkRemove })),
}));

const { AuthProvider, useAuth } = jest.requireActual('./auth-provider') as typeof import('./auth-provider');

const session = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_in: 3600,
  expires_at: 1,
  token_type: 'bearer',
  user: { id: 'user-1', email: 'reader@example.com' },
} as Session;

function Probe() {
  const auth = useAuth();
  return <>
    <Text testID="status">{auth.status}</Text>
    <Text testID="email">{auth.user?.email ?? ''}</Text>
    <Pressable accessibilityRole="button" onPress={() => void auth.signIn('  READER@EXAMPLE.COM ', 'password')}><Text>Sign in probe</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => void auth.signUp('  NEW@EXAMPLE.COM ', 'new-password')}><Text>Sign up probe</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => void auth.signOut()}><Text>Sign out probe</Text></Pressable>
  </>;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialUrl = null;
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignInWithPassword.mockResolvedValue({ data: { session }, error: null });
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockSetSession.mockResolvedValue({ data: { session }, error: null });
  });

  it('loads the persisted session locally and normalizes sign-in email', async () => {
    const view = await render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('signedOut'));

    await fireEvent.press(view.getByText('Sign in probe'));

    await waitFor(() => expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'reader@example.com',
      password: 'password',
    }));
    await waitFor(() => expect(view.getByTestId('email').props.children).toBe('reader@example.com'));
  });

  it('requests email confirmation with the account callback', async () => {
    const view = await render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('signedOut'));

    await fireEvent.press(view.getByText('Sign up probe'));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'new-password',
      options: { emailRedirectTo: 'wordfold://account' },
    }));
  });

  it('uses local-only sign out', async () => {
    mockGetSession.mockResolvedValue({ data: { session }, error: null });
    const view = await render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('signedIn'));

    await fireEvent.press(view.getByText('Sign out probe'));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }));
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('signedOut'));
  });

  it('establishes a session from a cold-start confirmation callback once', async () => {
    mockInitialUrl = 'wordfold://account#access_token=callback-access&refresh_token=callback-refresh';
    const view = await render(<AuthProvider><Probe/></AuthProvider>);

    await waitFor(() => expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'callback-access',
      refresh_token: 'callback-refresh',
    }));
    expect(mockSetSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('signedIn'));
  });
});
