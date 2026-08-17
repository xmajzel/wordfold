import { fireEvent, render, waitFor } from '@testing-library/react-native';

import LearnScreen from '@/app/(tabs)';
import type { Word } from '@/domain/types';

const mockBuildLearningFeed = jest.fn<Word[], unknown[]>();
const mockBuildContinuedLearningFeed = jest.fn<Word[], unknown[]>();
const mockRateWord = jest.fn(async () => undefined);
const mockRouterPush = jest.fn();

const baseWord = (overrides: Partial<Word>): Word => ({
  id: 'word', collectionId: 'my-words', term: 'scope', normalizedTerm: 'scope',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK', partOfSpeech: 'noun',
  definition: 'The extent of something.', example: null, translation: 'rozsah',
  catalogSenseId: null, cefrLevel: 'A1', source: 'manual', state: 'new', understoodStreak: 0,
  lapseCount: 0, viewCount: 0, lastViewedAt: null, lastRatedAt: null,
  nextReviewAt: null, createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T10:00:00.000Z', ...overrides,
});

const mockFirstWord = baseWord({ id: 'first', term: 'scope', normalizedTerm: 'scope' });
const mockNextWord = baseWord({ id: 'next', term: 'focus', normalizedTerm: 'focus', translation: 'sústredenie' });

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success' },
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const transition = {
    damping: () => transition,
    duration: () => transition,
    reduceMotion: () => transition,
    springify: () => transition,
  };
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (Component: unknown) => Component },
    FadeIn: transition,
    FadeInDown: transition,
    FadeOut: transition,
    ReduceMotion: { System: 'system' },
    cancelAnimation: jest.fn(),
    interpolate: (_value: number, _input: number[], output: number[]) => output[0],
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: unknown) => ({ value, set(next: unknown) { this.value = next; } }),
    withRepeat: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

jest.mock('@/features/learning/algorithm', () => {
  const actual = jest.requireActual('@/features/learning/algorithm');
  return {
    ...actual,
    buildLearningFeed: (...args: unknown[]) => mockBuildLearningFeed(...args),
    buildContinuedLearningFeed: (...args: unknown[]) => mockBuildContinuedLearningFeed(...args),
  };
});

jest.mock('@/components/swipeable-word-card', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    SwipeableWordCard: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
  };
});

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: [mockFirstWord, mockNextWord],
    collections: [{ id: 'my-words', name: 'My words' }],
    learningFilter: 'all',
    updateLearningFilter: jest.fn(async () => undefined),
    rateWord: mockRateWord,
    markViewed: jest.fn(async () => undefined),
    prepareWordTranslation: jest.fn(async () => undefined),
  }),
}));

describe('continued learning session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildLearningFeed.mockReturnValue([mockFirstWord]);
    mockBuildContinuedLearningFeed.mockReturnValue([mockNextWord]);
  });

  it('starts the next batch on the same screen', async () => {
    const view = await render(<LearnScreen/>);

    await fireEvent.press(view.getByRole('button', { name: /Keep learning/ }));
    const continueButton = await waitFor(() => view.getByRole('button', { name: 'Continue learning' }));
    await fireEvent.press(continueButton);

    await waitFor(() => view.getByText('focus'));
    expect(view.getByText(/^1 of 1 due now/)).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('opens the library when no new words remain', async () => {
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    const view = await render(<LearnScreen/>);

    await fireEvent.press(view.getByRole('button', { name: /Keep learning/ }));
    const browseButton = await waitFor(() => view.getByRole('button', { name: 'Browse library' }));
    await fireEvent.press(browseButton);

    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/library');
  });
});
