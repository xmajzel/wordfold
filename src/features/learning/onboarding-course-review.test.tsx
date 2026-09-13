import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import OnboardingScreen from '@/app/onboarding';
import { buildRecommendations } from '@/features/recommendations/selector';

const mockComplete = jest.fn(async () => 10);
const mockReplace = jest.fn();
let mockCourseId = 'es-sk';
let mockWords: { normalizedTerm: string; sourceLanguageCode: string; targetLanguageCode: string }[] = [];
let mockRemaining = 100;

jest.mock('expo-router', () => ({ Redirect: () => null, router: { replace: (...args: unknown[]) => mockReplace(...args) } }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/pronunciation-voice-picker', () => ({ PronunciationVoicePicker: () => null }));
jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: mockWords, onboardingComplete: false, activeCourseId: mockCourseId,
    activeCourse: { id: mockCourseId, directionLabel: mockCourseId === 'es-sk' ? 'Slovak → Spanish' : 'Slovak → English', sourceLanguageCode: mockCourseId === 'es-sk' ? 'es' : 'en', capabilities: { recommendations: true, devicePronunciation: mockCourseId === 'en-sk', publicNeuralPronunciation: false, privateNeuralPronunciation: false, offlinePronunciation: false } },
    switchActiveCourse: jest.fn(), completePersonalizedOnboarding: mockComplete,
    wordCapacity: { remaining: mockRemaining },
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

beforeEach(() => { jest.clearAllMocks(); mockComplete.mockResolvedValue(10); mockCourseId = 'es-sk'; mockWords = []; mockRemaining = 100; });

async function openReview() {
  const view = await render(<OnboardingScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  await fireEvent.press(view.getByTestId('level-A1'));
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  await fireEvent.press(view.getByTestId('topic-spoken'));
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  return view;
}

it.each(['en-sk', 'es-sk'] as const)('keeps the %s preview through saving and navigation', async (courseId) => {
  mockCourseId = courseId;
  const first = buildRecommendations({ levels: ['A1'], topics: ['spoken'] }, [], 10, courseId);
  let finish!: (count: number) => void;
  mockComplete.mockImplementationOnce(() => new Promise<number>((resolve) => { finish = resolve; }));
  const view = await openReview();
  await fireEvent.press(view.getByRole('button', { name: 'Create my set' }));
  mockWords = first.map(({ entry }) => entry);
  await view.rerender(<OnboardingScreen/>);
  for (const { entry } of first) expect(view.getByText(entry.term)).toBeTruthy();
  expect(view.getByRole('button', { name: 'Go to Levels' }).props.accessibilityState.disabled).toBe(true);
  // Filling the library must not replace the preview with the full-library message either.
  mockRemaining = 0;
  await view.rerender(<OnboardingScreen/>);
  expect(view.getByText('Your first 10 words')).toBeTruthy();
  await act(async () => finish(10));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/onboarding-ready', params: { count: '10' } });
  for (const { entry } of first) expect(view.getByText(entry.term)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Create my set' }));
  expect(mockComplete).toHaveBeenCalledTimes(1);
});

it('restores editing and current recommendations after a failed save', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  let fail!: (error: Error) => void;
  mockComplete.mockImplementationOnce(() => new Promise<number>((_resolve, reject) => { fail = reject; }));
  const view = await openReview();
  await fireEvent.press(view.getByRole('button', { name: 'Create my set' }));
  await act(async () => fail(new Error('Save failed')));
  expect(alert).toHaveBeenCalledWith('Could not create your set', 'Save failed');
  expect(mockReplace).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Go to Interests' }));
  await fireEvent.press(view.getByTestId('topic-spoken'));
  await fireEvent.press(view.getByTestId('topic-business'));
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  const updated = buildRecommendations({ levels: ['A1'], topics: ['business'] }, [], 10, 'es-sk');
  for (const { entry } of updated) expect(view.getByText(entry.term)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Create my set' }));
  expect(mockReplace).toHaveBeenCalled();
  alert.mockRestore();
});

it('offers Spanish interests and the same ten-word starter set as English', async () => {
  const view = await render(<OnboardingScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  for (const level of ['A2', 'B1', 'B2', 'C1']) {
    expect(view.getByTestId(`level-${level}`).props.accessibilityState.disabled).not.toBe(true);
  }
  expect(view.getByTestId('level-C2').props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(view.getByTestId('level-B2'));
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  expect(view.getByText('What will you use Spanish for?')).toBeTruthy();
  await fireEvent.press(view.getByTestId('topic-business'));
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  expect(view.getByText('Your first 10 words')).toBeTruthy();
  expect(view.queryByText('Preferred voice')).toBeNull();
  expect(view.queryByText('Phone voice')).toBeNull();
  expect(view.queryByText(/entries/)).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Create my set' }));
  await waitFor(() => expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({ levels: ['B2'] }), 'device'));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/onboarding-ready', params: { count: '10' } });
});

it('keeps the English starter-set action', async () => {
  mockCourseId = 'en-sk';
  const view = await render(<OnboardingScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  await fireEvent.press(view.getByTestId('level-A1'));
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  await fireEvent.press(view.getByTestId('topic-spoken'));
  await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  expect(view.getByText('Preferred voice')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Create my set' })).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Save my preferences' })).toBeNull();
});
