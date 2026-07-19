import { render, waitFor } from '@testing-library/react-native';

import LearnScreen from '@/app/(tabs)';
import type { Word } from '@/domain/types';

const mockSaveWordTranslation = jest.fn(() => new Promise<void>(() => undefined));
const mockTranslateEnglishToSlovak = jest.fn(async (_text: string) => 'rozsah');

const word: Word = {
  id: 'word', collectionId: 'my-words', term: 'scope', normalizedTerm: 'scope',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', partOfSpeech: 'noun',
  definition: 'The extent of something.', example: null, translation: null,
  catalogSenseId: '00023271-n:scope', cefrLevel: 'A1', source: 'manual', state: 'new',
  understoodStreak: 0, lapseCount: 0, viewCount: 0, lastViewedAt: null, lastRatedAt: null,
  nextReviewAt: null, createdAt: '2026-07-19T10:00:00.000Z', updatedAt: '2026-07-19T10:00:00.000Z',
};

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

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
    withTiming: (value: unknown) => value,
  };
});

jest.mock('@/features/translation/translator', () => ({
  translateEnglishToSlovak: (text: string) => mockTranslateEnglishToSlovak(text),
}));

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: [word],
    collections: [{ id: 'my-words', name: 'My words' }],
    learningFilter: 'all',
    updateLearningFilter: jest.fn(async () => undefined),
    rateWord: jest.fn(async () => undefined),
    markViewed: jest.fn(async () => undefined),
    saveWordTranslation: mockSaveWordTranslation,
  }),
}));

describe('Today word translation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('generates and persists a missing translation for the active card', async () => {
    const view = await render(<LearnScreen/>);

    await waitFor(() => expect(mockTranslateEnglishToSlovak).toHaveBeenCalledWith('scope'));
    await waitFor(() => expect(mockSaveWordTranslation).toHaveBeenCalledWith('word', 'rozsah'));
    view.getByLabelText('Preparing Slovak hint');
  });
});
