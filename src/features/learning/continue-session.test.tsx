import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import LearnScreen from '@/app/(tabs)';
import type { LearningFilter, LearningPreferences, LearningRating, Word } from '@/domain/types';
import type { Recommendation } from '@/features/recommendations/selector';
import { spacing } from '@/theme/tokens';

const mockBuildLearningFeed = jest.fn<Word[], unknown[]>();
const mockBuildContinuedLearningFeed = jest.fn<Word[], unknown[]>();
const mockRateWord = jest.fn<Promise<void>, [Word, LearningRating]>(async () => undefined);
const mockAddRecommendedWords = jest.fn<Promise<number>, [number?]>();
const mockUpdateLearningFilter = jest.fn<Promise<void>, [LearningFilter]>();
const mockBuildRecommendations = jest.fn<Recommendation[], unknown[]>();
const mockRouterPush = jest.fn();
const mockRouterSetParams = jest.fn();
let mockSearchParams: { notificationWordId?: string } = {};
let mockActiveCourseId: 'en-sk' | 'es-sk' = 'en-sk';
let mockLearningFilter: LearningFilter = 'all';
let mockLearningPreferences: LearningPreferences = { levels: [], topics: [] };
let mockWordCapacity = { limit: 100, count: 2, remaining: 98 as number | null, unlimited: false, shouldShowNotice: false };

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
const mockRecommendedWord = baseWord({ id: 'recommended', term: 'negotiate', normalizedTerm: 'negotiate', cefrLevel: 'B2', source: 'business' });
const mockRecommendationBatch = Array.from({ length: 10 }, (_, index): Recommendation => ({
  entry: {
    courseId: 'en-sk', sourceLanguageCode: 'en', targetLanguageCode: 'sk',
    publicationStatus: 'production', learnerContentReviewStatus: 'approved', hintReviewStatus: 'approved', levelEvidence: 'test',
    id: `recommendation-${index}`,
    term: `recommended ${index + 1}`,
    normalizedTerm: `recommended ${index + 1}`,
    level: 'B2',
    partOfSpeech: 'noun',
    definition: 'A recommended word.',
    example: null,
    translation: `odporúčané ${index + 1}`,
    catalogSenseId: `recommendation-sense-${index}`,
    source: 'cefr-j',
    sourceVersion: 'test',
    sourcePartOfSpeech: ['noun'],
  },
  topic: 'business',
}));
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
  const React = jest.requireActual('react');
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
    useReducedMotion: () => false,
    runOnUI: (callback: () => void) => callback,
    cancelAnimation: jest.fn(),
    interpolate: (_value: number, _input: number[], output: number[]) => output[0],
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: unknown) => React.useRef({ value, get() { return this.value; }, set(next: unknown) { this.value = next; } }).current,
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

jest.mock('@/features/recommendations/selector', () => {
  const actual = jest.requireActual('@/features/recommendations/selector');
  return {
    ...actual,
    buildRecommendations: (...args: unknown[]) => mockBuildRecommendations(...args),
  };
});

jest.mock('@/components/swipeable-word-card', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    SwipeableWordCard: ({ children, disabled, word, onSwipe, onNavigate }: {
      children: (onRate: (rating: LearningRating) => void) => React.ReactNode;
      onSwipe: (rating: LearningRating) => void;
      onNavigate: (direction: 'next' | 'previous') => void;
      disabled: boolean;
      word?: { id: string };
    }) => React.createElement(View, {
      accessibilityState: { disabled },
      onNavigate,
      testID: word ? `swipe-wrapper-${word.id}` : 'batch-end-gesture',
    }, children(onSwipe)),
  };
});

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: mockWords,
    activeCourseId: mockActiveCourseId,
    activeCourse: mockActiveCourseId === 'es-sk'
      ? { sourceLanguageCode: 'es', capabilities: { recommendations: true } }
      : { sourceLanguageCode: 'en', capabilities: { recommendations: true } },
    collections: [{ id: 'my-words', name: 'My words' }],
    learningFilter: mockLearningFilter,
    learningPreferences: mockLearningPreferences,
    wordCapacity: mockWordCapacity,
    addRecommendedWords: mockAddRecommendedWords,
    updateLearningFilter: mockUpdateLearningFilter,
    rateWord: mockRateWord,
    markViewed: jest.fn(async () => undefined),
    prepareWordTranslation: jest.fn(async () => undefined),
  }),
}));

describe('continued learning session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockActiveCourseId = 'en-sk';
    mockWords = [mockFirstWord, mockNextWord];
    mockLearningFilter = 'all';
    mockLearningPreferences = { levels: ['B2'], topics: ['business'] };
    mockWordCapacity = { limit: 100, count: 2, remaining: 98, unlimited: false, shouldShowNotice: false };
    mockRateWord.mockImplementation(async () => undefined);
    mockAddRecommendedWords.mockResolvedValue(0);
    mockUpdateLearningFilter.mockImplementation(async (filter) => { mockLearningFilter = filter; });
    mockBuildRecommendations.mockReturnValue([]);
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

    await fireEvent.press(view.getByRole('button', { name: 'Previous word' }));
    await waitFor(() => view.getByLabelText('Rated this session. Reviews stopped.'));
    expect(view.getByTestId('swipe-wrapper-first').props.accessibilityState).toEqual({ disabled: true });
    expect(view.getByTestId('swipe-wrapper-next', { includeHiddenElements: true }).props.accessibilityState).toEqual({ disabled: false });
    expect(view.queryByRole('button', { name: /I know this/ })).toBeNull();
    await act(async () => finishRating());
  });

  it.each([450, 600])('promotes the same mounted pronunciation controls in a %ipx feed', async (height) => {
    mockBuildLearningFeed.mockReturnValue([mockFirstWord, mockNextWord]);
    const view = await render(<LearnScreen/>);
    const stack = view.getByTestId('today-words-stack');
    await fireEvent(stack, 'layout', { nativeEvent: { layout: { height } } });
    expect(StyleSheet.flatten(stack.props.style).marginHorizontal).toBe(-spacing.lg);
    const nextCard = within(view.getByTestId('swipe-wrapper-next', { includeHiddenElements: true }));
    const pronunciation = nextCard.getByRole('button', {
      name: /Play .* device pronunciation for focus/,
      includeHiddenElements: true,
    });
    expect(pronunciation).toBeDisabled();
    expect(nextCard.queryByRole('button', { name: /device pronunciation/ })).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Skip word' }));

    expect(view.getByText(/^2 of 2/ )).toBeTruthy();
    expect(nextCard.getByRole('button', { name: /Play .* device pronunciation for focus/ })).toBe(pronunciation);
    expect(pronunciation).toBeEnabled();
    expect(within(view.getByTestId('swipe-wrapper-first', { includeHiddenElements: true })).getByRole('button', {
      name: /device pronunciation/,
      includeHiddenElements: true,
    })).toBeDisabled();
  });

  it('accepts rapid ratings while earlier saves are still pending', async () => {
    let finishFirstRating!: () => void;
    mockBuildLearningFeed.mockReturnValue([mockFirstWord, mockNextWord, mockThirdWord]);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    mockRateWord.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishFirstRating = resolve;
    }));
    const view = await render(<LearnScreen/>);

    await fireEvent.press(view.getByRole('button', { name: /I know this/ }));
    await waitFor(() => view.getByText(/^2 of 3/));
    await fireEvent.press(view.getByRole('button', { name: /I know this/ }));
    await waitFor(() => view.getByText(/^3 of 3/));
    await fireEvent.press(view.getByRole('button', { name: /I know this/ }));
    await waitFor(() => view.getByText('End of batch'));

    expect(mockRateWord).toHaveBeenCalledTimes(1);
    await act(async () => finishFirstRating());
    await waitFor(() => expect(mockRateWord).toHaveBeenCalledTimes(3));
    expect(mockRateWord.mock.calls.map(([word, rating]) => [word.id, rating])).toEqual([
      ['first', 'learned'],
      ['next', 'learned'],
      ['third', 'learned'],
    ]);
  });

  it('skips through the last card and returns from the end without changing ratings', async () => {
    mockBuildLearningFeed.mockReturnValue([mockFirstWord, mockNextWord]);
    const view = await render(<LearnScreen/>);
    await fireEvent(view.getByTestId('swipe-wrapper-first'), 'navigate', 'next');
    await fireEvent(view.getByTestId('swipe-wrapper-next'), 'navigate', 'next');
    view.getByText('End of batch');
    await fireEvent(view.getByTestId('batch-end-gesture'), 'navigate', 'previous');
    view.getByText('focus');
    await fireEvent(view.getByTestId('swipe-wrapper-next'), 'navigate', 'previous');
    view.getByText('scope');
    expect(view.getByRole('button', { name: 'Previous word' })).toBeDisabled();
    expect(mockRateWord).not.toHaveBeenCalled();
  });

  it('can skip a one-word batch and start fresh without rating the skipped word', async () => {
    const view = await render(<LearnScreen/>);
    await fireEvent.press(view.getByRole('button', { name: 'Skip word' }));
    view.getByText('End of batch');
    await fireEvent.press(view.getByRole('button', { name: 'Continue learning' }));
    view.getByText('focus');
    expect(view.getByRole('button', { name: 'Previous word' })).toBeDisabled();
    expect(mockRateWord).not.toHaveBeenCalled();
  });

  it('offers Add 10 words at the end even when existing words could continue', async () => {
    mockBuildRecommendations.mockReturnValue(mockRecommendationBatch);
    mockBuildContinuedLearningFeed.mockReturnValue([mockNextWord]);
    const view = await render(<LearnScreen/>);
    await fireEvent.press(view.getByRole('button', { name: 'Skip word' }));
    view.getByText('Start a fresh batch');
    expect(view.queryByRole('button', { name: 'Continue learning' })).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Add 10 words & start learning' }));
    expect(mockAddRecommendedWords).toHaveBeenCalledWith(10);
    expect(mockRateWord).not.toHaveBeenCalled();
  });

  it('limits the end-card add action to remaining word capacity', async () => {
    mockBuildRecommendations.mockReturnValue(mockRecommendationBatch);
    mockWordCapacity = { ...mockWordCapacity, remaining: 3 };
    const view = await render(<LearnScreen/>);
    await fireEvent.press(view.getByRole('button', { name: 'Skip word' }));
    await fireEvent.press(view.getByRole('button', { name: 'Add 3 words & start learning' }));
    expect(mockAddRecommendedWords).toHaveBeenCalledWith(3);
  });

  it('explains the full library at batch end without adding words beyond capacity', async () => {
    mockBuildRecommendations.mockReturnValue(mockRecommendationBatch);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    mockWordCapacity = { ...mockWordCapacity, count: 100, remaining: 0 };
    const view = await render(<LearnScreen/>);
    await fireEvent.press(view.getByRole('button', { name: 'Skip word' }));
    view.getByText('Free library full');
    expect(view.queryByRole('button', { name: 'Browse library' })).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Unlock unlimited words' }));
    expect(mockRouterPush).toHaveBeenCalledWith('/upgrade');
    expect(mockAddRecommendedWords).not.toHaveBeenCalled();
  });

  it('keeps only neighboring cards mounted and rejects stale navigation callbacks', async () => {
    mockBuildLearningFeed.mockReturnValue([mockFirstWord, mockNextWord, mockThirdWord, mockRecommendedWord]);
    const view = await render(<LearnScreen/>);
    const first = view.getByTestId('swipe-wrapper-first');
    await fireEvent(first, 'navigate', 'next');
    expect(view.getAllByTestId(/word-stack-layer-/, { includeHiddenElements: true })).toHaveLength(3);
    await fireEvent(first, 'navigate', 'next');
    view.getByText(/^2 of 4/);
    await fireEvent(view.getByTestId('swipe-wrapper-next'), 'navigate', 'next');
    view.getByText(/^3 of 4/);
    expect(view.queryByTestId('swipe-wrapper-first', { includeHiddenElements: true })).toBeNull();
  });

  it('returns a failed final rating from the end card for retry', async () => {
    let fail!: (reason: Error) => void;
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockRateWord.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    const view = await render(<LearnScreen/>);
    await fireEvent.press(view.getByRole('button', { name: /Keep learning/ }));
    view.getByText('End of batch');
    await act(() => fail(new Error('offline')));
    await waitFor(() => view.getByRole('button', { name: /Keep learning/ }));
    view.getByText(/^2 of 2/);
    await fireEvent.press(view.getByRole('button', { name: /Keep learning/ }));
    await waitFor(() => expect(mockRateWord).toHaveBeenCalledTimes(2));
    view.getByText('End of batch');
  });

  it('returns a failed rating at the end of the current session', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockBuildLearningFeed.mockReturnValue([mockFirstWord, mockNextWord]);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    mockRateWord.mockRejectedValueOnce(new Error('save failed'));
    const view = await render(<LearnScreen/>);

    await fireEvent.press(view.getAllByRole('button', { name: /Keep learning/ })[0]);
    await waitFor(() => view.getByText(/^2 of 3/));
    expect(view.queryByLabelText('Rated this session. Kept in learning.')).toBeNull();
    expect(alert).toHaveBeenCalledWith(
      'Progress was not saved',
      'scope was returned to this session. Please try again.',
    );

    await fireEvent.press(view.getByRole('button', { name: /Keep learning/ }));
    await waitFor(() => view.getByText(/^3 of 3/));
    const retryButtons = view.getAllByRole('button', { name: /Keep learning/ });
    await fireEvent.press(retryButtons[retryButtons.length - 1]);
    await waitFor(() => view.getByText('End of batch'));
    expect(mockRateWord.mock.calls.map(([word]) => word.id)).toEqual(['first', 'next', 'first']);
  });

  it('starts the next batch on the same screen', async () => {
    const view = await render(<LearnScreen/>);

    await fireEvent.press(view.getByRole('button', { name: /Keep learning/ }));
    const continueButton = await waitFor(() => view.getByRole('button', { name: 'Continue learning' }));
    expect(view.queryByTestId('empty-state-compact-action')).toBeNull();
    expect(StyleSheet.flatten(continueButton.props.style).borderColor).toBe('transparent');
    await fireEvent.press(continueButton);

    await waitFor(() => view.getByText('focus'));
    expect(view.getByText(/^1 of 1/)).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('does not return words from earlier batches while their ratings are still saving', async () => {
    let finishFirstRating!: () => void;
    mockWords = [mockFirstWord, mockNextWord, mockThirdWord];
    mockBuildContinuedLearningFeed.mockImplementation((_words, completedIds) => {
      const completed = new Set(completedIds as Iterable<string>);
      return mockWords.filter((word) => !completed.has(word.id)).slice(0, 1);
    });
    mockRateWord.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishFirstRating = resolve;
    }));
    const view = await render(<LearnScreen/>);

    await fireEvent.press(view.getByRole('button', { name: /I know this/ }));
    await fireEvent.press(await waitFor(() => view.getByRole('button', { name: 'Continue learning' })));
    await waitFor(() => view.getByText('focus'));

    await fireEvent.press(view.getByRole('button', { name: /I know this/ }));
    await fireEvent.press(await waitFor(() => view.getByRole('button', { name: 'Continue learning' })));

    await waitFor(() => view.getByText('pace'));
    expect(view.queryByText('scope')).toBeNull();
    await act(async () => finishFirstRating());
  });

  it('opens the library when no new words remain', async () => {
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    const view = await render(<LearnScreen/>);

    await fireEvent.press(view.getByRole('button', { name: /Keep learning/ }));
    const browseButton = await waitFor(() => view.getByRole('button', { name: 'Browse library' }));
    expect(view.getByTestId('empty-state-compact-action')).toHaveStyle({ width: '100%', maxWidth: 200 });
    expect(StyleSheet.flatten(browseButton.props.style).borderColor).not.toBe('transparent');
    await fireEvent.press(browseButton);

    expect(mockRouterPush).toHaveBeenCalledWith('/(tabs)/library');
  });

  it('shows a compact secondary library action when Today starts caught up', async () => {
    mockBuildLearningFeed.mockReturnValue([]);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    const view = await render(<LearnScreen/>);

    const browseButton = view.getByRole('button', { name: 'Browse library' });

    expect(view.getByTestId('empty-state-compact-action')).toHaveStyle({ width: '100%', maxWidth: 200 });
    expect(StyleSheet.flatten(browseButton.props.style).borderColor).not.toBe('transparent');
  });

  it('lets existing Spanish users finish their recommendation preferences', async () => {
    mockActiveCourseId = 'es-sk';
    mockLearningPreferences = { levels: ['A1'], topics: [] };
    mockBuildLearningFeed.mockReturnValue([]);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    const view = await render(<LearnScreen/>);
    view.getByText('Personalize your Spanish words');
    await fireEvent.press(view.getByRole('button', { name: 'Choose my preferences' }));
    expect(mockRouterPush).toHaveBeenCalledWith('/preferences');
  });

  it('offers the shared add-words action for Spanish', async () => {
    mockActiveCourseId = 'es-sk';
    mockBuildLearningFeed.mockReturnValue([]);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    mockBuildRecommendations.mockReturnValue(mockRecommendationBatch.slice(0, 1));
    const view = await render(<LearnScreen/>);
    view.getByTestId('today-recommendations');
    await fireEvent.press(view.getByTestId('add-today-recommendations'));
    expect(mockAddRecommendedWords).toHaveBeenCalledWith(1);
  });

  it('keeps the existing library fallback for an empty course that supports recommendations', async () => {
    mockWords = [];
    mockBuildLearningFeed.mockReturnValue([]);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    const view = await render(<LearnScreen/>);

    expect(view.queryByTestId('today-course-empty')).toBeNull();
    view.getByRole('button', { name: 'Browse library' });
  });

  it('adds a recommended batch and starts it as a new learning session', async () => {
    const existingB1Word = baseWord({ id: 'existing-b1', term: 'existing', normalizedTerm: 'existing', cefrLevel: 'B1' });
    mockWords = [existingB1Word];
    mockLearningFilter = 'B1';
    mockLearningPreferences = { levels: ['B2'], topics: ['business'] };
    mockBuildRecommendations.mockReturnValue(mockRecommendationBatch);
    mockBuildLearningFeed.mockImplementation((words: unknown) => (words as Word[]).filter((word) => word.id === mockRecommendedWord.id));
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    mockAddRecommendedWords.mockImplementation(async (limit) => {
      mockWords = [mockRecommendedWord, ...mockWords];
      return limit ?? 0;
    });
    const view = await render(<LearnScreen/>);

    view.getByText('You’re caught up');
    view.getByText('No B1 words are due right now.');
    view.getByText('Start a fresh batch');
    expect(view.queryByText('Recommended for you')).toBeNull();
    view.getByText('B2 English');
    view.getByText('Work and business · 10 words');
    expect(view.getAllByText(/^recommended \d+$/)).toHaveLength(10);
    expect(view.queryByRole('button', { name: 'Browse library' })).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Add 10 words & start learning' }));

    await waitFor(() => expect(mockAddRecommendedWords).toHaveBeenCalledWith(10));
    expect(mockUpdateLearningFilter).toHaveBeenCalledWith('all');
    view.rerender(<LearnScreen/>);
    await waitFor(() => view.getByText('negotiate'));
    view.getByText(/^1 of 1/);
  });

  it('falls back to the compact library action when the free library is full', async () => {
    mockLearningPreferences = { levels: ['B2'], topics: ['business'] };
    mockBuildRecommendations.mockReturnValue(mockRecommendationBatch);
    mockWordCapacity = { limit: 100, count: 100, remaining: 0, unlimited: false, shouldShowNotice: true };
    mockBuildLearningFeed.mockReturnValue([]);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    const view = await render(<LearnScreen/>);

    expect(view.queryByTestId('today-recommendations')).toBeNull();
    expect(view.getByTestId('empty-state-compact-action')).toHaveStyle({ width: '100%', maxWidth: 200 });
  });

  it('falls back to the compact library action when recommendations are exhausted', async () => {
    mockLearningPreferences = { levels: ['B2'], topics: ['business'] };
    mockBuildRecommendations.mockReturnValue([]);
    mockBuildLearningFeed.mockReturnValue([]);
    mockBuildContinuedLearningFeed.mockReturnValue([]);
    const view = await render(<LearnScreen/>);

    expect(view.queryByTestId('today-recommendations')).toBeNull();
    view.getByRole('button', { name: 'Browse library' });
  });

  it('starts a notification session with the notified unfinished word', async () => {
    mockSearchParams = { notificationWordId: mockNextWord.id };
    const view = await render(<LearnScreen/>);

    expect(view.getAllByTestId(/swipe-wrapper-/, { includeHiddenElements: true }).map((node) => node.props.testID)).toEqual([
      'swipe-wrapper-next',
      'swipe-wrapper-first',
    ]);
    view.getByText(/^1 of 2/);
  });

  it('shows a completed notification word read-only when Today is complete', async () => {
    const completedWord = baseWord({
      id: 'completed',
      term: 'finished',
      normalizedTerm: 'finished',
      state: 'understood',
      lastRatedAt: '2026-08-24T08:00:00.000Z',
      nextReviewAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
