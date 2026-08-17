import { fireEvent, render } from '@testing-library/react-native';

import SettingsScreen from '@/app/settings';

const mockPush = jest.fn();
let mockPrivateConsentStatus: 'disabled' | 'enabled' | 'deletion_pending' = 'disabled';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ status: 'signedIn', user: { email: 'reader@example.com' } }),
}));
jest.mock('@/providers/sync-provider', () => ({
  useSync: () => ({ phase: 'connected' }),
}));
jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    guestImport: { phase: 'ready' },
    reminderSettings: { enabled: false, countPerDay: 1, windowStartMinutes: 600, windowEndMinutes: 1200, timeZoneId: 'local' },
    learningPreferences: { levels: [], topics: [] },
    updateReminderSettings: jest.fn(async () => 0),
  }),
}));
jest.mock('@/features/reminders/scheduler', () => ({ requestReminderPermission: jest.fn() }));
jest.mock('@/features/pronunciation/private-consent-provider', () => ({
  usePrivatePronunciationConsent: () => ({
    status: mockPrivateConsentStatus,
    userId: '00000000-0000-4000-8000-0000000000a1',
  }),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    cancelAnimation: jest.fn(),
    interpolate: jest.fn((_value: number, _input: number[], output: number[]) => output[0]),
    interpolateColor: jest.fn((_value: number, _input: number[], output: string[]) => output[0]),
    ReduceMotion: { System: 'system' },
    useAnimatedStyle: jest.fn((factory: () => object) => factory()),
    useSharedValue: jest.fn((initialValue: number) => ({ value: initialValue, set(nextValue: number) { this.value = nextValue; } })),
    withRepeat: jest.fn((value: number) => value),
    withSpring: jest.fn((value: number) => value),
    withTiming: jest.fn((value: number) => value),
  };
});

describe('Settings account entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED;
    mockPrivateConsentStatus = 'disabled';
  });

  it('shows the signed-in PowerSync connection without claiming vocabulary import', async () => {
    const view = await render(<SettingsScreen/>);

    expect(view.getByText('reader@example.com · PowerSync connected; device import is available')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Open account' }));
    expect(mockPush).toHaveBeenCalledWith('/account');
  });

  it('shows the account-scoped private pronunciation state when the pilot is enabled', async () => {
    process.env.EXPO_PUBLIC_PRONUNCIATION_PRIVATE_PREVIEW_ENABLED = 'true';
    mockPrivateConsentStatus = 'deletion_pending';
    const view = await render(<SettingsScreen/>);

    expect(view.getByText('Off · private audio deletion needs attention')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Manage private pronunciation' }));
    expect(mockPush).toHaveBeenCalledWith('/private-pronunciation');
  });
});
