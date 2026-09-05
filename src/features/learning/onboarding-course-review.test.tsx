import { fireEvent, render, waitFor } from '@testing-library/react-native';

import OnboardingScreen from '@/app/onboarding';

const mockComplete = jest.fn(async () => 0);
const mockReplace = jest.fn();
let mockCourseId = 'es-sk';

jest.mock('expo-router', () => ({ Redirect: () => null, router: { replace: (...args: unknown[]) => mockReplace(...args) } }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/pronunciation-voice-picker', () => ({ PronunciationVoicePicker: () => null }));
jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: [], onboardingComplete: false, activeCourseId: mockCourseId,
    activeCourse: { id: mockCourseId, directionLabel: mockCourseId === 'es-sk' ? 'Slovak → Spanish' : 'Slovak → English', sourceLanguageCode: mockCourseId === 'es-sk' ? 'es' : 'en', capabilities: { recommendations: mockCourseId === 'en-sk', offlinePronunciation: false } },
    switchActiveCourse: jest.fn(), completePersonalizedOnboarding: mockComplete,
    wordCapacity: { remaining: 100 },
  }),
}));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const transition = { duration: () => transition, reduceMotion: () => transition };
  return {
    __esModule: true, default: { View, createAnimatedComponent: (component: unknown) => component },
    FadeInLeft: transition, FadeInRight: transition, ReduceMotion: { System: 'system' },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value, set: jest.fn() }),
    withSpring: (value: number) => value,
    interpolate: (_value: number, _input: number[], output: number[]) => output[0],
    cancelAnimation: jest.fn(), withRepeat: (value: number) => value, withTiming: (value: number) => value,
  };
});

beforeEach(() => { jest.clearAllMocks(); mockCourseId = 'es-sk'; });

it('saves Spanish preferences without promising an automatically created starter set', async () => {
  const view = await render(<OnboardingScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  await fireEvent.press(view.getByTestId('level-C2'));
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  expect(view.queryByRole('button', { name: 'Create my set' })).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Save my preferences' }));
  await waitFor(() => expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({ levels: ['C2'] }), 'device'));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/onboarding-ready', params: { count: '0' } });
});

it('keeps the English starter-set action', async () => {
  mockCourseId = 'en-sk';
  const view = await render(<OnboardingScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  await fireEvent.press(view.getByTestId('level-A1'));
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  await fireEvent.press(view.getByTestId('topic-spoken'));
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  expect(view.getByRole('button', { name: 'Create my set' })).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Save my preferences' })).toBeNull();
});
