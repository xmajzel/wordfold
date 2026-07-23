import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import PrivatePronunciationScreen from '@/app/private-pronunciation';

const mockEnable = jest.fn(async () => undefined);
const mockDisableAndDelete = jest.fn(async () => undefined);
const mockRetryDeletion = jest.fn(async () => undefined);
const mockConsent: {
  status: 'loading' | 'disabled' | 'enabled' | 'deletion_pending';
  userId: string;
} = {
  status: 'disabled',
  userId: '00000000-0000-4000-8000-0000000000a1',
};

jest.mock('@/features/pronunciation/private-consent-provider', () => ({
  usePrivatePronunciationConsent: () => ({
    ...mockConsent,
    enable: mockEnable,
    disableAndDelete: mockDisableAndDelete,
    retryDeletion: mockRetryDeletion,
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
    useSharedValue: jest.fn((initialValue: number) => ({
      value: initialValue,
      set(nextValue: number) { this.value = nextValue; },
    })),
    withRepeat: jest.fn((value: number) => value),
    withSpring: jest.fn((value: number) => value),
    withTiming: jest.fn((value: number) => value),
  };
});

describe('private pronunciation disclosure screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConsent.status = 'disabled';
  });
  afterEach(() => jest.restoreAllMocks());

  it('discloses exact cloud processing before enabling', async () => {
    const screen = await render(<PrivatePronunciationScreen/>);

    expect(screen.getByText('What leaves this device')).toBeTruthy();
    expect(screen.getByText(/exact displayed word or phrase/)).toBeTruthy();
    expect(screen.getByText(/do not store the raw word or phrase/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', {
      name: 'Enable private neural pronunciation',
    }));
    await waitFor(() => expect(mockEnable).toHaveBeenCalledTimes(1));
  });

  it('requires destructive confirmation before turning off and deleting', async () => {
    mockConsent.status = 'enabled';
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = await render(<PrivatePronunciationScreen/>);

    await fireEvent.press(screen.getByRole('button', {
      name: 'Turn off and delete private audio',
    }));
    expect(mockDisableAndDelete).not.toHaveBeenCalled();
    const actions = alert.mock.calls[0][2]!;
    await act(async () => {
      actions[1].onPress?.();
    });
    await waitFor(() => expect(mockDisableAndDelete).toHaveBeenCalledTimes(1));
  });

  it('offers retry while deletion remains pending', async () => {
    mockConsent.status = 'deletion_pending';
    const screen = await render(<PrivatePronunciationScreen/>);

    await fireEvent.press(screen.getByRole('button', {
      name: 'Retry private audio deletion',
    }));
    await waitFor(() => expect(mockRetryDeletion).toHaveBeenCalledTimes(1));
  });
});
