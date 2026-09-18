import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, Pressable } from 'react-native';
import type { Session } from '@supabase/supabase-js';

const mockUnsubscribe = jest.fn();
const mockLinkRemove = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();
const mockResetPassword = jest.fn();
const mockUpdateUser = jest.fn();
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
    resetPasswordForEmail: mockResetPassword,
    updateUser: mockUpdateUser,
    startAutoRefresh: mockStartAutoRefresh,
    stopAutoRefresh: mockStopAutoRefresh,
  },
};

jest.mock('@/data/supabase/client', () => ({
  supabase: mockSupabase,
  supabaseConfigurationError: null,
}));

jest.mock('expo-linking', () => ({
  createURL: () => 'wordfold://localhost:8081/account',
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
    <Text testID="recovery">{String(auth.passwordRecovery)}</Text>
    <Text testID="message">{auth.message}</Text>
    <Pressable onPress={() => void auth.requestPasswordReset(' READER@EXAMPLE.COM ')}><Text>Reset probe</Text></Pressable>
    <Pressable onPress={() => void auth.updatePassword('new-password')}><Text>Update probe</Text></Pressable>
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
    mockResetPassword.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({ data: { user: session.user }, error: null });
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

describe('password recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks(); mockInitialUrl = null;
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSetSession.mockResolvedValue({ data: { session }, error: null });
    mockResetPassword.mockResolvedValue({ error: null });
    mockUpdateUser.mockResolvedValue({ error: null });
  });
  it('requests a reset with a normalized email and account redirect', async () => {
    const view = await render(<AuthProvider><Probe/></AuthProvider>);
    await fireEvent.press(view.getByText('Reset probe'));
    expect(mockResetPassword).toHaveBeenCalledWith('reader@example.com', { redirectTo: 'wordfold://account' });
  });
  it('opens recovery and only completes it after a successful update', async () => {
    mockInitialUrl = 'wordfold://account#type=recovery&access_token=a&refresh_token=r';
    const view = await render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(() => expect(view.getByTestId('recovery').props.children).toBe('true'));
    mockUpdateUser.mockResolvedValueOnce({ error: { code: 'weak_password' } });
    await fireEvent.press(view.getByText('Update probe'));
    expect(view.getByTestId('recovery').props.children).toBe('true');
    await fireEvent.press(view.getByText('Update probe'));
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'new-password' });
    await waitFor(() => expect(view.getByTestId('recovery').props.children).toBe('false'));
    expect(view.getByTestId('message').props.children).toBe('Password updated. You are signed in.');
  });
  it('rejects expired links and never enables a password change', async () => {
    mockInitialUrl = 'wordfold://account#error_code=otp_expired';
    const view = await render(<AuthProvider><Probe/></AuthProvider>);
    await waitFor(() => expect(view.getByTestId('message').props.children).toContain('expired'));
    await fireEvent.press(view.getByText('Update probe'));
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
