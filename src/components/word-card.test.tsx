import { fireEvent, render, within } from '@testing-library/react-native';

import type { Word } from '@/domain/types';

import { WordCard } from './word-card';

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({ pronunciationVoicePreference: 'device' }),
}));

jest.mock('@/features/pronunciation/offline-downloads-provider', () => ({
  useOfflinePronunciationDownloads: () => ({ hasAsset: () => false }),
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
    default: { View },
    FadeIn: transition,
    FadeInDown: transition,
    FadeOut: transition,
    ReduceMotion: { System: 'system' },
  };
});

const word: Word = {
  id: 'word', collectionId: 'collection', term: 'scope', normalizedTerm: 'scope',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK', partOfSpeech: 'noun',
  definition: 'The extent of something.', example: null, translation: null,
  catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'understood',
  understoodStreak: 1, lapseCount: 0, viewCount: 2,
  lastViewedAt: '2026-07-17T10:00:00.000Z', lastRatedAt: '2026-07-17T10:00:00.000Z',
  nextReviewAt: '2026-07-20T10:00:00.000Z', createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-17T10:00:00.000Z',
};

describe('WordCard learning actions', () => {
  it('opens reporting without rating or changing the displayed word', async () => {
    const onRate = jest.fn();
    const onReport = jest.fn();
    const screen = await render(<WordCard word={word} onRate={onRate} onReport={onReport}/>);
    await fireEvent.press(screen.getByRole('button', { name: 'Report an issue with this word' }));
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onRate).not.toHaveBeenCalled();
    expect(screen.getByText('scope')).toBeTruthy();
  });

  it('hides learning history while keeping it on compact library cards', async () => {
    const learningCard = await render(<WordCard word={word}/>);

    expect(learningCard.queryByText('Seen 2×')).toBeNull();
    expect(learningCard.queryByText('Missed 0×')).toBeNull();
    expect(learningCard.queryByRole('button', { name: /device pronunciation/ })).toBeNull();

    const libraryCard = await render(<WordCard word={word} collectionName="My words" compact/>);
    libraryCard.getByText('My words · seen 2×');
  });

  it('offers only keep-learning and stop-review outcomes', async () => {
    const onRate = jest.fn();
    const screen = await render(<WordCard word={word} onRate={onRate}/>);

    screen.getByText('Swipe or tap');
    expect(screen.queryByText('Again soon')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep learning. Review in 3–5 days.' }));
    await fireEvent.press(screen.getByRole('button', { name: 'I know this. Stop reviews.' }));

    expect(onRate.mock.calls.map(([rating]) => rating)).toEqual(['understood', 'learned']);
  });

  it.each([
    ['learned' as const, 'Reviews stopped'],
    ['understood' as const, 'Kept in learning'],
  ])('replaces actions with the completed %s result', async (sessionRating, detail) => {
    const screen = await render(<WordCard word={word} sessionRating={sessionRating} onRate={jest.fn()}/>);

    screen.getByLabelText(`Rated this session. ${detail}.`);
    screen.getByText('Rated this session');
    screen.getByText(detail);
    expect(screen.queryByText('Swipe or tap')).toBeNull();
    expect(screen.queryByRole('button', { name: /Keep learning/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /I know this/ })).toBeNull();
  });

  it('shows the labeled exact-locale pronunciation control only when requested', async () => {
    const visible = await render(<WordCard word={word} showPronunciation/>);
    expect(visible.getByRole('button', {
      name: 'Play English · United States device pronunciation for scope',
    })).toBeTruthy();
    expect(visible.getByText('Phone voice')).toBeTruthy();
  });

  it('does not expose pronunciation for the Spanish course', async () => {
    const spanishWord = {
      ...word,
      term: 'carro',
      normalizedTerm: 'carro',
      sourceLanguageCode: 'es',
      targetLanguageCode: 'sk',
      sourcePronunciationLocale: 'es-ES',
    };
    const screen = await render(<WordCard word={spanishWord} showPronunciation/>);

    expect(screen.queryByRole('button', { name: /pronunciation/ })).toBeNull();
    expect(screen.queryByText('Phone voice')).toBeNull();
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


describe('WordCard content overflow', () => {
  it.each(['en', 'es'])('keeps complete %s content scrollable and actions outside the reading area', async (sourceLanguageCode) => {
    const longWord = { ...word, sourceLanguageCode,
      definition: 'A long explanation with enough detail to wrap across several lines. '.repeat(5),
      example: 'This example sentence includes additional context that must remain readable. '.repeat(4),
      translation: 'A longer translated hint. '.repeat(8),
    };
    const onRate = jest.fn();
    const view = await render(<WordCard word={longWord} dense showPronunciation onRate={onRate}/>);
    const content = view.getByTestId('word-card-content');
    expect(view.getByText(longWord.definition).props.numberOfLines).toBeUndefined();
    expect(view.getByText(longWord.example).props.numberOfLines).toBeUndefined();
    expect(within(content).queryByRole('button', { name: /Keep learning/ })).toBeNull();
    await fireEvent(content, 'layout', { nativeEvent: { layout: { height: 250 } } });
    await fireEvent(content, 'contentSizeChange', 300, 600);
    expect(content.props.scrollEnabled).toBe(true);
    await fireEvent.press(view.getByLabelText('Need a Slovak hint?'));
    within(content).getByText(longWord.translation);
    await fireEvent.press(view.getByRole('button', { name: /Keep learning/ }));
    expect(onRate).toHaveBeenCalledWith('understood');
    // Rotation or a larger viewport can remove the need to scroll.
    await fireEvent(content, 'layout', { nativeEvent: { layout: { height: 700 } } });
    expect(content.props.scrollEnabled).toBe(false);
  });
});
