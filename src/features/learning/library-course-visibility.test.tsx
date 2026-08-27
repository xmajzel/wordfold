import { fireEvent, render, waitFor } from '@testing-library/react-native';

import LibraryScreen from '@/app/(tabs)/library';
import type { Word } from '@/domain/types';

const mockOtherWord: Word = {
  id: 'other-word', collectionId: 'my-words', term: 'Baum', normalizedTerm: 'baum',
  sourceLanguageCode: 'de', targetLanguageCode: 'sk',
  sourcePronunciationLocale: 'de-DE', targetPronunciationLocale: 'sk-SK',
  partOfSpeech: 'noun', definition: 'Eine große Pflanze mit einem Stamm.', example: null,
  translation: 'strom', catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'new',
  understoodStreak: 0, lapseCount: 0, viewCount: 0, lastViewedAt: null, lastRatedAt: null,
  nextReviewAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

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
    words: [mockOtherWord],
    collections: [{ id: 'my-words', name: 'My words' }],
    activeCourseId: 'en-sk',
    activeCourse: {
      id: 'en-sk', sourceLanguageCode: 'en', targetLanguageCode: 'sk',
      capabilities: { bundledCatalog: true, recommendations: true },
    },
    learningPreferences: { levels: [], topics: [] },
    wordCapacity: { remaining: 99, shouldShowNotice: false },
    createCollection: jest.fn(async () => 'collection'),
    addRecommendedWords: jest.fn(async () => 0),
  }),
}));

describe('library course visibility', () => {
  it('keeps pre-existing words outside registered courses accessible', async () => {
    const screen = await render(<LibraryScreen/>);

    await fireEvent.press(screen.getByText('Other vocabulary (1)'));

    await waitFor(() => screen.getByText('Baum'));
    screen.getByText('Slovak → German');
  });
});
