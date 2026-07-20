import type { ReactNode } from 'react';
import { render, waitFor } from '@testing-library/react-native';

import LearnScreen from '@/app/(tabs)';
import type { Word } from '@/domain/types';

const mockPrepareWordTranslation = jest.fn(() => new Promise<void>(() => undefined));

const word: Word = {
  id: 'word', collectionId: 'my-words', term: 'scope', normalizedTerm: 'scope',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', partOfSpeech: 'noun',
  definition: 'The extent of something.', example: null, translation: null,
  catalogSenseId: '00023271-n:scope', cefrLevel: 'A1', source: 'manual', state: 'new',
  understoodStreak: 0, lapseCount: 0, viewCount: 0, lastViewedAt: null, lastRatedAt: null,
  nextReviewAt: null, createdAt: '2026-07-19T10:00:00.000Z', updatedAt: '2026-07-19T10:00:00.000Z',
};

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

jest.mock('@/components/swipeable-word-card', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    SwipeableWordCard: ({ children }: { children: ReactNode }) =>
      React.createElement(View, null, children),
  };
});

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

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: [word],
    collections: [{ id: 'my-words', name: 'My words' }],
    learningFilter: 'all',
    updateLearningFilter: jest.fn(async () => undefined),
    rateWord: jest.fn(async () => undefined),
    markViewed: jest.fn(async () => undefined),
    prepareWordTranslation: mockPrepareWordTranslation,
  }),
}));

describe('Today word translation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('waits for the provider to prepare a missing translation for the active card', async () => {
    const view = await render(<LearnScreen/>);

    await waitFor(() => expect(mockPrepareWordTranslation).toHaveBeenCalledWith(word));
    view.getByLabelText('Preparing Slovak hint');
  });
});
