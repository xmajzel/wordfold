import { fireEvent, render } from '@testing-library/react-native';

import type { Word } from '@/domain/types';

import { WordCard } from './word-card';

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
    default: { View },
    FadeIn: transition,
    FadeInDown: transition,
    FadeOut: transition,
    ReduceMotion: { System: 'system' },
  };
});

const word: Word = {
  id: 'word', collectionId: 'collection', term: 'scope', normalizedTerm: 'scope',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', partOfSpeech: 'noun',
  definition: 'The extent of something.', example: null, translation: null,
  catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'understood',
  understoodStreak: 1, lapseCount: 0, viewCount: 2,
  lastViewedAt: '2026-07-17T10:00:00.000Z', lastRatedAt: '2026-07-17T10:00:00.000Z',
  nextReviewAt: '2026-07-20T10:00:00.000Z', createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-17T10:00:00.000Z',
};

describe('WordCard learning actions', () => {
  it('explains when each action will return the word', async () => {
    const onRate = jest.fn();
    const screen = await render(<WordCard word={word} onRate={onRate}/>);

    screen.getByText('When should this word return?');
    await fireEvent.press(screen.getByRole('button', { name: 'Again soon. This session.' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Review later. In 7 days.' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Stop reviews. No auto return.' }));

    expect(onRate.mock.calls.map(([rating]) => rating)).toEqual(['again', 'understood', 'learned']);
  });

  it('shows translation preparation for an untranslated word', async () => {
    const preparing = await render(<WordCard word={word} translationStatus="loading"/>);

    preparing.getByLabelText('Preparing Slovak hint');
  });

  it('allows a failed translation to be retried', async () => {
    const retryTranslation = jest.fn();
    const failed = await render(<WordCard word={word} translationStatus="error" onRetryTranslation={retryTranslation}/>);
    await fireEvent.press(failed.getByLabelText('Retry Slovak hint'));

    expect(retryTranslation).toHaveBeenCalledTimes(1);
  });

  it('reveals a generated Slovak hint only after it is requested', async () => {
    const translatedWord = { ...word, translation: 'rozsah' };
    const screen = await render(<WordCard word={translatedWord}/>);

    expect(screen.queryByText('rozsah')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Need a Slovak hint?'));

    screen.getByText('rozsah');
  });
});
