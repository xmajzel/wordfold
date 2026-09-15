import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Dimensions, StyleSheet } from 'react-native';

import LibraryScreen from '@/app/(tabs)/library';
import { buildRecommendations } from '@/features/recommendations/selector';
import type { LearningPreferences, Word } from '@/domain/types';

const mockOtherWord: Word = {
  id: 'other-word', collectionId: 'my-words', term: 'Baum', normalizedTerm: 'baum',
  sourceLanguageCode: 'de', targetLanguageCode: 'sk',
  sourcePronunciationLocale: 'de-DE', targetPronunciationLocale: 'sk-SK',
  partOfSpeech: 'noun', definition: 'Eine große Pflanze mit einem Stamm.', example: null,
  translation: 'strom', catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'new',
  understoodStreak: 0, lapseCount: 0, viewCount: 0, lastViewedAt: null, lastRatedAt: null,
  nextReviewAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const mockWords = [mockOtherWord];
let mockPreferences: LearningPreferences = { levels: [], topics: [] };
const mockAddRecommendedWords = jest.fn(async (..._args: unknown[]) => 10);
let mockActiveCourseId: 'en-sk' | 'es-sk' = 'en-sk';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));
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
    default: { View, createAnimatedComponent: (component: unknown) => component },
    FadeIn: transition,
    FadeInDown: transition,
    FadeOut: transition,
    ReduceMotion: { System: 'system' },
    cancelAnimation: jest.fn(),
    interpolate: jest.fn((_value: number, _input: number[], output: number[]) => output[0]),
    interpolateColor: jest.fn((_value: number, _input: number[], output: string[]) => output[0]),
    useAnimatedStyle: jest.fn((factory: () => object) => factory()),
    useSharedValue: jest.fn((initialValue: number) => ({
      value: initialValue,
      set(value: number) { this.value = value; },
    })),
    withRepeat: jest.fn((value: number) => value),
    withSpring: jest.fn((value: number) => value),
    withTiming: jest.fn((value: number) => value),
  };
});
jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: mockWords,
    collections: [{ id: 'my-words', name: 'My words' }],
    activeCourseId: mockActiveCourseId,
    activeCourse: {
      id: mockActiveCourseId,
      sourceLanguageCode: mockActiveCourseId === 'es-sk' ? 'es' : 'en', targetLanguageCode: 'sk',
      capabilities: { bundledCatalog: true, recommendations: true },
    },
    learningPreferences: mockPreferences,
    wordCapacity: { remaining: 99, shouldShowNotice: false },
    createCollection: jest.fn(async () => 'collection'),
    addRecommendedWords: mockAddRecommendedWords,
  }),
}));

describe('library course visibility', () => {
  beforeEach(() => {
    mockActiveCourseId = 'en-sk';
    mockPreferences = { levels: [], topics: [] };
    mockAddRecommendedWords.mockClear();
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1 });
  });
  afterEach(() => jest.restoreAllMocks());

  it('allows one full-width tile at 320px and 2x font scale without reducing its text', async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 320, height: 640, scale: 1, fontScale: 2 });
    const screen = await render(<LibraryScreen/>);
    const tile = screen.getByTestId('catalog-level-A1');
    expect(StyleSheet.flatten(tile.props.style).minWidth).toBe(288);
    expect(StyleSheet.flatten(tile.props.style).flexGrow).toBe(1);
    expect(screen.getByTestId('library-progress-A1-known').props.numberOfLines).toBeUndefined();
    expect(screen.getByTestId('library-progress-A1-known').props.adjustsFontSizeToFit).toBeUndefined();
  });
  it('keeps pre-existing words outside registered courses accessible', async () => {
    const screen = await render(<LibraryScreen/>);

    expect(screen.queryByText('Baum')).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: 'Show My words' }));
    await fireEvent.press(screen.getByText('Other vocabulary (1)'));

    await waitFor(() => screen.getByText('Baum'));
    screen.getByText('Slovak → German');
  });

  it('opens on discovery instead of the potentially long personal list', async () => {
    const screen = await render(<LibraryScreen/>);

    expect(screen.getByRole('tab', { name: 'Show Discover' }).props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByRole('tab', { name: 'Show My words' }).props.accessibilityState).toEqual({ selected: false });
    screen.getByText('English levels');
    expect(screen.getAllByText('0 known')).toHaveLength(6);
    expect(screen.getAllByText('0 learning')).toHaveLength(6);
    expect(screen.getAllByText('0 added')).toHaveLength(6);
    expect(screen.queryByText('Baum')).toBeNull();
  });

  it('enables every released Spanish level including C2', async () => {
    mockActiveCourseId = 'es-sk';
    const screen = await render(<LibraryScreen/>);

    expect(screen.getByTestId('catalog-level-A1').props.accessibilityState).toEqual({ disabled: false });
    for (const level of ['A2', 'B1', 'B2', 'C1']) {
      expect(screen.getByTestId(`catalog-level-${level}`).props.accessibilityState).toEqual({ disabled: false });
    }
    expect(screen.getByTestId('catalog-level-C2').props.accessibilityState).toEqual({ disabled: false });
    expect(screen.queryByText('Not yet available')).toBeNull();
    expect(screen.queryByText('Currently unavailable')).toBeNull();
    screen.getByText('Recommended for you');
    screen.getByRole('button', { name: 'Choose learning preferences' });
  });
});

it.each(['en-sk', 'es-sk'] as const)('adds exactly the stable %s Library preview', async (courseId) => {
  mockActiveCourseId = courseId;
  mockPreferences = { levels: ['B2'], topics: ['business'] };
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(Math, 'random').mockReturnValue(0.2);
  const preview = buildRecommendations(mockPreferences, [], 10, courseId);
  const screen = await render(<LibraryScreen/>);
  for (const { entry } of preview) screen.getByText(entry.term);
  jest.mocked(Math.random).mockReturnValue(0.8);
  await screen.rerender(<LibraryScreen/>);
  for (const { entry } of preview) screen.getByText(entry.term);
  await fireEvent.press(screen.getByRole('button', { name: 'Add 10 recommended words' }));
  expect(mockAddRecommendedWords).toHaveBeenCalledWith(10, preview);
  jest.restoreAllMocks();
});
