import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Linking, Text } from 'react-native';
import { ReleaseGate } from './app-update-gate';
import { fetchReleasePolicy, readStoredValue, writeStoredValue } from './release-policy-client';
import { REMIND_AFTER_MS, type ReleaseTarget } from './release-policy';

jest.mock('expo-application', () => ({ nativeBuildVersion: '5', applicationId: 'com.jozefmajzel.wordfold' }));
jest.mock('expo-updates', () => ({ channel: 'production' }));
jest.mock('./release-policy-client', () => ({
  fetchReleasePolicy: jest.fn(), readStoredValue: jest.fn(), writeStoredValue: jest.fn(async () => undefined), releaseCacheKey: () => 'policy',
}));
jest.mock('@/components/primary-button', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return { PrimaryButton: ({ label, onPress, loading }: { label: string; onPress(): void; loading?: boolean }) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={loading} onPress={onPress}><Text>{label}</Text></Pressable> };
});

const target: ReleaseTarget = { platform: 'android', channel: 'production', applicationId: 'com.jozefmajzel.wordfold', build: 5 };
const policy = { latest_build: 7, minimum_supported_build: 5, message: 'New features', store_url: 'https://play.google.com/store/apps/details?id=com.jozefmajzel.wordfold' };

beforeEach(() => {
  jest.clearAllMocks();
  (readStoredValue as jest.Mock).mockResolvedValue(null);
  (fetchReleasePolicy as jest.Mock).mockResolvedValue(policy);
});
afterEach(() => jest.restoreAllMocks());

it('opens the store and persists an optional reminder dismissal', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const view = await render(<ReleaseGate target={target}><Text>Learn</Text></ReleaseGate>);
  await waitFor(() => expect(view.getByText('New features')).toBeTruthy());
  await fireEvent.press(view.getByText('Update Wordfold'));
  expect(open).toHaveBeenCalledWith(policy.store_url);
  await fireEvent.press(view.getByText('Remind me later'));
  expect(view.queryByText('New features')).toBeNull();
  expect(writeStoredValue).toHaveBeenCalledWith('policy:snooze', expect.objectContaining({ build: 7 }));
});

it('blocks dismissal of a cached required update offline, then accepts a revoked policy', async () => {
  const required = { ...policy, minimum_supported_build: 6 };
  (readStoredValue as jest.Mock).mockImplementation(async (key) => key === 'policy' ? required : { build: 7, at: Date.now() });
  (fetchReleasePolicy as jest.Mock).mockRejectedValue(new Error('offline'));
  const view = await render(<ReleaseGate target={target}><Text>Learn</Text></ReleaseGate>);
  await waitFor(() => expect(view.getByText(/Could not check/)).toBeTruthy());
  expect(view.getByText('Update Wordfold to continue')).toBeTruthy();
  expect(view.queryByText('Remind me later')).toBeNull();
  await fireEvent(view.getByTestId('app-update-dialog'), 'requestClose');
  expect(view.getByText('Update Wordfold to continue')).toBeTruthy();
  (fetchReleasePolicy as jest.Mock).mockResolvedValue(null);
  await fireEvent.press(view.getByText('Try again'));
  await waitFor(() => expect(view.queryByText('Update Wordfold to continue')).toBeNull());
  expect(writeStoredValue).toHaveBeenCalledWith('policy', null);
});

it('keeps the app usable when the first check fails', async () => {
  (fetchReleasePolicy as jest.Mock).mockRejectedValue(new Error('offline'));
  const view = await render(<ReleaseGate target={target}><Text>Learn</Text></ReleaseGate>);
  await waitFor(() => expect(fetchReleasePolicy).toHaveBeenCalled());
  expect(view.getByText('Learn')).toBeTruthy();
  expect(view.queryByText('Update Wordfold')).toBeNull();
});

it('respects a stored snooze and checks again when foregrounded after its expiry', async () => {
  const start = 1_000_000;
  const clock = jest.spyOn(Date, 'now').mockReturnValue(start);
  (readStoredValue as jest.Mock).mockImplementation(async (key) => key === 'policy:snooze' ? { build: 7, at: start } : null);
  let foreground: ((state: AppStateStatus) => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    foreground = listener;
    return { remove: jest.fn() };
  });
  const view = await render(<ReleaseGate target={target}><Text>Learn</Text></ReleaseGate>);
  await waitFor(() => expect(writeStoredValue).toHaveBeenCalledWith('policy', policy));
  expect(view.queryByText('New features')).toBeNull();
  clock.mockReturnValue(start + REMIND_AFTER_MS);
  await act(() => foreground?.('active'));
  await waitFor(() => expect(view.getByText('New features')).toBeTruthy());
  expect(fetchReleasePolicy).toHaveBeenCalledTimes(2);
});

it('shows store-opening errors without dismissing the update', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('unavailable'));
  const view = await render(<ReleaseGate target={target}><Text>Learn</Text></ReleaseGate>);
  await waitFor(() => expect(view.getByText('Update Wordfold')).toBeTruthy());
  await fireEvent.press(view.getByText('Update Wordfold'));
  expect(view.getByText(/Could not open the store/)).toBeTruthy();
});
