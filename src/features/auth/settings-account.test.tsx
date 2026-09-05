import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import SettingsScreen from '@/app/settings';
import { ACCOUNT_DELETION_URL, PRIVACY_POLICY_URL } from '@/features/legal/urls';

const mockPush = jest.fn();
const mockSwitchCourse = jest.fn(async (_courseId: string) => undefined);
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
    activeCourseId: 'en-sk',
    activeCourse: {
      id: 'en-sk', directionLabel: 'Slovak → English', sourceLanguageCode: 'en',
      capabilities: { recommendations: true, offlinePronunciation: true, privateNeuralPronunciation: true },
    },
    learningPreferences: { levels: [], topics: [] },
    switchActiveCourse: mockSwitchCourse,
    updateReminderSettings: jest.fn(async () => 0),
  }),
}));
jest.mock('@/features/reminders/scheduler', () => ({ requestReminderPermission: jest.fn() }));
jest.mock('@/features/pronunciation/private-consent', () => ({
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
    mockSwitchCourse.mockResolvedValue(undefined);
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

  it('keeps opt-out accessible if a later build disables new private requests', async () => {
    mockPrivateConsentStatus = 'enabled';
    const view = await render(<SettingsScreen/>);

    expect(view.getByRole('button', { name: 'Manage private pronunciation' })).toBeTruthy();
    expect(view.getByText(/On · private neural voice/)).toBeTruthy();
  });

  it('opens the published privacy and account-deletion pages', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const view = await render(<SettingsScreen/>);

    await fireEvent.press(view.getByTestId('privacy-policy-link'));
    await fireEvent.press(view.getByTestId('account-deletion-link'));

    expect(openUrl).toHaveBeenNthCalledWith(1, PRIVACY_POLICY_URL);
    expect(openUrl).toHaveBeenNthCalledWith(2, ACCOUNT_DELETION_URL);
  });

  it('stages a course choice and leaves the active course unchanged until confirmation', async () => {
    const view = await render(<SettingsScreen/>);
    await fireEvent.press(view.getByRole('radio', { name: 'Slovak → Spanish' }));
    expect(mockSwitchCourse).not.toHaveBeenCalled();
    expect(view.getByText('Active course: Slovak → English')).toBeTruthy();
    await fireEvent.press(view.getByTestId('course-switch-confirm'));
    expect(mockSwitchCourse).toHaveBeenCalledTimes(1);
    expect(mockSwitchCourse).toHaveBeenCalledWith('es-sk');
  });

  it('discards an unconfirmed choice when Settings is closed', async () => {
    const view = await render(<SettingsScreen/>);
    await fireEvent.press(view.getByRole('radio', { name: 'Slovak → Spanish' }));
    await fireEvent.press(view.getByRole('button', { name: 'Close' }));
    expect(mockSwitchCourse).not.toHaveBeenCalled();
  });

  it('blocks duplicate submissions and preserves the real course after a failure', async () => {
    let rejectSwitch!: (reason: Error) => void;
    mockSwitchCourse.mockImplementationOnce(() => new Promise((_, reject) => { rejectSwitch = reject; }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<SettingsScreen/>);
    await fireEvent.press(view.getByRole('radio', { name: 'Slovak → Spanish' }));
    await fireEvent.press(view.getByTestId('course-switch-confirm'));
    await fireEvent.press(view.getByTestId('course-switch-confirm'));
    expect(mockSwitchCourse).toHaveBeenCalledTimes(1);
    await act(() => rejectSwitch(new Error('Storage unavailable')));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Could not switch course', 'Storage unavailable'));
    expect(view.getByText('Active course: Slovak → English')).toBeTruthy();
    expect(view.getByRole('radio', { name: 'Slovak → English' }).props.accessibilityState.checked).toBe(true);
    alert.mockRestore();
  });
});
