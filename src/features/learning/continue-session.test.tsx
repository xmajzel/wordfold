import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import LearnScreen from '@/app/(tabs)';
import type { LearningRating, Word } from '@/domain/types';

const mockBuildLearningFeed = jest.fn<Word[], unknown[]>();
const mockBuildContinuedLearningFeed = jest.fn<Word[], unknown[]>();
const mockRateWord = jest.fn<Promise<void>, [Word, LearningRating]>(async () => undefined);
const mockRouterPush = jest.fn();
const mockRouterSetParams = jest.fn();
let mockSearchParams: { notificationWordId?: string } = {};

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
const mockThirdWord = baseWord({ id: 'third', term: 'pace', normalizedTerm: 'pace', translation: 'tempo' });
let mockWords = [mockFirstWord, mockNextWord];

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
    setParams: (...args: unknown[]) => mockRouterSetParams(...args),
  },
  useLocalSearchParams: () => mockSearchParams,
}));

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

jest.mock('@/features/pronunciation/offline-downloads-provider', () => ({
  useOfflinePronunciationDownloads: () => ({ hasAsset: () => false }),
}));

jest.mock('@/components/swipeable-word-card', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    SwipeableWordCard: ({ children, disabled, word }: {
      children: React.ReactNode;
      disabled: boolean;
      word: { id: string };
    }) => React.createElement(View, {
      accessibilityState: { disabled },
      testID: `swipe-wrapper-${word.id}`,
    }, children),
  };
});

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: mockWords,
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
    mockSearchParams = {};
    mockWords = [mockFirstWord, mockNextWord];
    mockRateWord.mockImplementation(async () => undefined);
    mockBuildLearningFeed.mockReturnValue([mockFirstWord]);
    mockBuildContinuedLearningFeed.mockReturnValue([mockNextWord]);
  });

  it('shows a passive result and disables rating swipes on a submitted card', async () => {
    let finishRating!: () => void;
    mockBuildLearningFeed.mockReturnValue([mockFirstWord, mockNextWord]);
    mockRateWord.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishRating = resolve;
    }));
    const view = await render(<LearnScreen/>);

    await fireEvent.press(view.getAllByRole('button', { name: /I know this/ })[0]);

    await waitFor(() => view.getByLabelText('Rated this session. Reviews stopped.'));
    expect(view.getByTestId('swipe-wrapper-first').props.accessibilityState).toEqual({ disabled: true });
    expect(view.getByTestId('swipe-wrapper-next').props.accessibilityState).toEqual({ disabled: false });
    expect(view.getAllByRole('button', { name: /I know this/ })).toHaveLength(1);
    await act(async () => finishRating());
  });

  it('accepts rapid ratings while earlier saves are still pending', async () => {
    let finishFirstRating!: () => void;
    mockBuildLearningFeed.mockReturnValue([mockFirstWord, mockNextWord, mockThirdWord]);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    mockRateWord.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishFirstRating = resolve;
    }));
    const view = await render(<LearnScreen/>);

    const knowButtons = view.getAllByRole('button', { name: /I know this/ });
    await fireEvent.press(knowButtons[0]);
    await waitFor(() => view.getByText(/^2 of 3 due now/));
    expect(knowButtons[1].props.disabled).toBeFalsy();
    await fireEvent.press(knowButtons[1]);
    await waitFor(() => view.getByText(/^3 of 3 due now/));
    await fireEvent.press(knowButtons[2]);
    await waitFor(() => view.getByText('Session complete'));

    expect(mockRateWord).toHaveBeenCalledTimes(1);
    await act(async () => finishFirstRating());
    await waitFor(() => expect(mockRateWord).toHaveBeenCalledTimes(3));
    expect(mockRateWord.mock.calls.map(([word, rating]) => [word.id, rating])).toEqual([
      ['first', 'learned'],
      ['next', 'learned'],
      ['third', 'learned'],
    ]);
  });

  it('returns a failed rating at the end of the current session', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockBuildLearningFeed.mockReturnValue([mockFirstWord, mockNextWord]);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    mockRateWord.mockRejectedValueOnce(new Error('save failed'));
    const view = await render(<LearnScreen/>);

    await fireEvent.press(view.getAllByRole('button', { name: /Keep learning/ })[0]);
    await waitFor(() => view.getByText(/^2 of 3 due now/));
    expect(view.queryByLabelText('Rated this session. Kept in learning.')).toBeNull();
    expect(alert).toHaveBeenCalledWith(
      'Progress was not saved',
      'scope was returned to this session. Please try again.',
    );

    await fireEvent.press(view.getAllByRole('button', { name: /Keep learning/ })[1]);
    await waitFor(() => view.getByText(/^3 of 3 due now/));
    const retryButtons = view.getAllByRole('button', { name: /Keep learning/ });
    await fireEvent.press(retryButtons[retryButtons.length - 1]);
    await waitFor(() => view.getByText('Session complete'));
    expect(mockRateWord.mock.calls.map(([word]) => word.id)).toEqual(['first', 'next', 'first']);
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

  it('starts a notification session with the notified unfinished word', async () => {
    mockSearchParams = { notificationWordId: mockNextWord.id };
    const view = await render(<LearnScreen/>);

    expect(view.getAllByTestId(/swipe-wrapper-/).map((node) => node.props.testID)).toEqual([
      'swipe-wrapper-next',
      'swipe-wrapper-first',
    ]);
    view.getByText(/^1 of 2 due now/);
  });

  it('shows a completed notification word read-only when Today is complete', async () => {
    const completedWord = baseWord({
      id: 'completed',
      term: 'finished',
      normalizedTerm: 'finished',
      state: 'understood',
      lastRatedAt: '2026-08-24T08:00:00.000Z',
      nextReviewAt: '2026-08-27T08:00:00.000Z',
    });
    mockWords = [completedWord];
    mockSearchParams = { notificationWordId: completedWord.id };

    const view = await render(<LearnScreen/>);

    view.getByText('You are caught up');
    view.getByText('finished');
    view.getByText('Today’s session is complete. You can review this reminder word without changing your progress.');
    expect(view.queryByRole('button', { name: /Keep learning/ })).toBeNull();
    expect(view.queryByRole('button', { name: /I know this/ })).toBeNull();
    expect(view.queryByTestId('swipe-wrapper-completed')).toBeNull();
  });

  it('continues with unfinished words after reviewing a completed notification word', async () => {
    const completedWord = baseWord({
      id: 'completed',
      term: 'finished',
      normalizedTerm: 'finished',
      state: 'learned',
    });
    mockWords = [completedWord, mockNextWord];
    mockSearchParams = { notificationWordId: completedWord.id };
    const view = await render(<LearnScreen/>);

    await fireEvent.press(view.getByRole('button', { name: 'Continue today’s words' }));

    await waitFor(() => view.getByTestId('swipe-wrapper-next'));
    view.getByRole('button', { name: /Keep learning/ });
  });
});
