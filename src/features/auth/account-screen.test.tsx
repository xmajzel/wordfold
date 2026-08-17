import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AccountScreen from '@/app/account';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();
const mockClearMessage = jest.fn();
const mockClearBeforeSignOut = jest.fn();
const mockPrepareForSignOut = jest.fn();

const mockAuth = {
  status: 'signedOut' as const,
  session: null,
  user: null,
  message: null,
  clearMessage: mockClearMessage,
  signIn: mockSignIn,
  signUp: mockSignUp,
  signOut: mockSignOut,
};

jest.mock('@/providers/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    guestImport: {
      phase: 'ready', totals: { collections: 1, words: 2, events: 3 },
      uploaded: { collections: 0, words: 0, events: 0 }, conflicts: [], message: null,
    },
    dataSource: 'guest',
    prepareForSignOut: mockPrepareForSignOut,
  }),
}));
jest.mock('@/providers/sync-provider', () => ({
  useSync: () => ({
    phase: 'connected', hasSynced: true, lastSyncedAt: null,
    message: 'PowerSync is connected. Local vocabulary import is the next step.',
    clearBeforeSignOut: mockClearBeforeSignOut,
  }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    cancelAnimation: jest.fn(),
    interpolate: jest.fn((_value: number, _input: number[], output: number[]) => output[0]),
    ReduceMotion: { System: 'system' },
    useAnimatedStyle: jest.fn((factory: () => object) => factory()),
    useSharedValue: jest.fn((initialValue: number) => ({ value: initialValue, set(nextValue: number) { this.value = nextValue; } })),
    withRepeat: jest.fn((value: number) => value),
    withSpring: jest.fn((value: number) => value),
    withTiming: jest.fn((value: number) => value),
  };
});

describe('AccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue({ ok: true, outcome: 'signedIn' });
    mockSignUp.mockResolvedValue({ ok: true, outcome: 'confirmationRequired' });
    mockSignOut.mockResolvedValue({ ok: true, outcome: 'signedOut' });
    mockClearBeforeSignOut.mockResolvedValue(undefined);
    mockPrepareForSignOut.mockResolvedValue(undefined);
    Object.assign(mockAuth, { status: 'signedOut', session: null, user: null });
  });

  it('validates a signup password before calling Supabase', async () => {
    const view = await render(<AccountScreen/>);
    await fireEvent.press(view.getByText('Create account'));
    await fireEvent.changeText(view.getByLabelText('Email'), 'reader@example.com');
    await fireEvent.changeText(view.getByLabelText('Password'), 'short');
    await fireEvent.changeText(view.getByLabelText('Confirm password'), 'short');
    await fireEvent.press(view.getByRole('button', { name: 'Create account' }));

    expect(view.getByText('Use at least 8 characters for your password.')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('shows the confirmation-required state without claiming sign-in', async () => {
    const view = await render(<AccountScreen/>);
    await fireEvent.press(view.getByText('Create account'));
    await fireEvent.changeText(view.getByLabelText('Email'), '  Reader@Example.com ');
    await fireEvent.changeText(view.getByLabelText('Password'), 'long-password');
    await fireEvent.changeText(view.getByLabelText('Confirm password'), 'long-password');
    await fireEvent.press(view.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledWith('reader@example.com', 'long-password'));
    await waitFor(() => expect(view.getByText('Check your email')).toBeTruthy());
    expect(view.queryByText('Signed in')).toBeNull();
  });

  it('clears synchronized data before signing out of Supabase', async () => {
    const events: string[] = [];
    Object.assign(mockAuth, { status: 'signedIn', user: { email: 'reader@example.com' } });
    mockPrepareForSignOut.mockImplementation(async () => { events.push('local data prepared'); });
    mockClearBeforeSignOut.mockImplementation(async () => { events.push('sync cleared'); });
    mockSignOut.mockImplementation(async () => {
      events.push('auth signed out');
      return { ok: true, outcome: 'signedOut' };
    });
    const view = await render(<AccountScreen/>);

    await fireEvent.press(view.getByRole('button', { name: 'Sign out of this device' }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(events).toEqual(['local data prepared', 'sync cleared', 'auth signed out']);
  });

  it('keeps the session when synchronized data cannot be cleared', async () => {
    Object.assign(mockAuth, { status: 'signedIn', user: { email: 'reader@example.com' } });
    mockClearBeforeSignOut.mockRejectedValue(new Error('clear failed'));
    const view = await render(<AccountScreen/>);

    await fireEvent.press(view.getByRole('button', { name: 'Sign out of this device' }));

    await waitFor(() => expect(view.getByText('Sign out could not safely clear synchronized data. Please try again.')).toBeTruthy());
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
