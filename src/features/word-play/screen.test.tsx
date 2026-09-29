import { Profiler, type ComponentProps } from 'react';
import PlayTab from '@/app/(tabs)/play';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import type { Word } from '@/domain/types';
import type { WordPlayEvent, WordPlayStats } from './model';
import { emptyWordPlayStats } from './model';
import { withTiming } from 'react-native-reanimated';
import { SentenceRound } from './sentence-round';
import { RecallFlashcard } from './recall-flashcard';
import WordPlayScreen from './screen';

function GameScreen(props: ComponentProps<typeof WordPlayScreen>) {
  return <WordPlayScreen initialConfig={{ activity: 'surprise', status: 'learned', filter: props.initialFilter ?? 'all', length: 'quick' }} {...props}/>;
}

const mockRecord = jest.fn<Promise<void>, [WordPlayEvent]>(async () => undefined);
const mockDismiss = jest.fn(async () => undefined);
let mockTransitions: ((finished: boolean) => void)[] = [];
let mockReducedMotion = false;
let mockIntroductions: string[] = [];
let mockStats: Record<string, WordPlayStats> = {};
let mockCourse: 'en-sk' | 'es-sk' = 'en-sk';
const mockWords = Array.from({ length: 10 }, (_, index) => ({
  id: `word-${index}`, term: `word ${index}`, translation: `hint ${index}`, definition: `Meaning ${index}`,
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', state: 'learned', collectionId: index < 2 ? 'travel' : 'other', cefrLevel: index < 3 ? 'A1' : 'B1',
} as Word));
jest.mock('@/providers/app-data-provider', () => ({ useAppData: () => ({
  dismissWordPlayIntroduction: mockDismiss, wordPlayIntroductions: mockIntroductions,
  collections: [{ id: 'travel', name: 'Travel' }, { id: 'other', name: 'Other' }],
  words: mockWords, wordPlayStats: mockStats, activeCourseId: mockCourse,
  activeCourse: { displayName: 'English → Slovak' }, dataSource: 'guest', recordWordPlayEvent: mockRecord,
  updateLearningFilter: jest.fn(async () => undefined),
}) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useFocusEffect: (callback: () => void) => { jest.requireActual('react').useEffect(callback, [callback]); }, router: { navigate: jest.fn(), back: jest.fn(), replace: jest.fn(), push: jest.fn(), dismissTo: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${Math.random()}` }));
jest.mock('@/components/word-card', () => ({ WordCard: ({ word }: { word: Word }) => { const { Text } = jest.requireActual('react-native'); return <Text>{word.term}</Text>; } }));
jest.mock('@/components/screen', () => ({ Screen: jest.requireActual('react-native').View }));
jest.mock('@/components/primary-button', () => ({ PrimaryButton: ({ label, onPress, disabled, loading }: {
  label: string; onPress(): void; disabled?: boolean; loading?: boolean;
}) => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={Boolean(disabled || loading)} onPress={onPress}><Text>{label}</Text></Pressable>;
} }));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const animation = { duration: () => ({ reduceMotion: () => undefined }) };
  return { __esModule: true, default: { View }, FadeInDown: animation, FadeOut: animation, ReduceMotion: { System: 'system' },
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: (initial: number) => jest.requireActual('react').useState(() => ({ value: initial, set(value: number) { this.value = value; } }))[0],
    useAnimatedStyle: (callback: () => unknown) => callback(),
    withTiming: jest.fn((value: number, _config: unknown, callback?: (finished: boolean) => void) => { if (callback) mockTransitions.push(callback); return value; }), cancelAnimation: jest.fn(),
    withDelay: (_delay: number, value: number) => value,
    withSequence: (...values: number[]) => values[values.length - 1],
    runOnJS: (callback: () => void) => callback,
    interpolateColor: (_value: number, _range: number[], colors: string[]) => colors[0],
  };
});

beforeEach(() => { mockTransitions = []; mockReducedMotion = false; jest.clearAllMocks(); mockRecord.mockResolvedValue(undefined); mockStats = {}; mockCourse = 'en-sk'; mockIntroductions = []; });

async function finishTransition() {
  const complete = mockTransitions.shift();
  expect(complete).toBeDefined();
  await act(() => { complete!(true); complete!(true); });
}

it('plays two boards, retains first-attempt mistakes, and only relearns selected words', async () => {
  const view = await render(<GameScreen/>);
  await fireEvent.press(view.getByRole('button', { name: /^Start / }));
  for (let board = 0; board < 2; board += 1) {
    await waitFor(() => {
      const tiles = view.getAllByRole('button', { name: /^Word:/ });
      expect(tiles).toHaveLength(5);
      expect(tiles[0].props.accessibilityState.disabled).toBe(false);
    });
    const terms = view.getAllByRole('button', { name: /^Word:/ }).map((button) => String(button.props.accessibilityLabel).replace('Word: ', ''));
    for (let index = 0; index < terms.length; index += 1) {
      const term = terms[index];
      const hint = term.replace('word', 'hint');
      await fireEvent.press(view.getByRole('button', { name: `Word: ${term}` }));
      if (index === 0) {
        await fireEvent.press(view.getByRole('button', { name: `Meaning: ${terms[1].replace('word', 'hint')}` }));
        await waitFor(() => expect(view.getByText(/Not that pair/)).toBeTruthy());
        await fireEvent.press(view.getByRole('button', { name: `Meaning: ${terms[1].replace('word', 'hint')}` }));
      }
      await fireEvent.press(view.getByRole('button', { name: `Meaning: ${hint}` }));
      await waitFor(() => expect(view.queryByRole('button', { name: `Word: ${term}` })).toBeNull());
    }
    expect(view.getAllByText('Board complete').length).toBeGreaterThan(0);
    await finishTransition();
  }
  expect(view.getByText('10 words revisited · 2 needed another look')).toBeTruthy();
  expect(mockRecord.mock.calls.filter(([event]) => event.type === 'game_seen')).toHaveLength(10);
  expect(mockRecord.mock.calls.filter(([event]) => event.type === 'game_missed')).toHaveLength(2);
  expect(mockRecord.mock.calls.filter(([event]) => event.type === 'game_answered')).toHaveLength(10);
  expect(mockRecord.mock.calls.some(([event]) => event.type === 'game_relearned')).toBe(false);
  const choices = view.getAllByRole('checkbox');
  await fireEvent.press(choices[0]);
  await fireEvent.press(view.getByRole('button', { name: 'Add 1 word to learning' }));
  await waitFor(() => expect(view.getByText('1 word is ready in today’s practice.')).toBeTruthy());
  expect(mockRecord.mock.calls.filter(([event]) => event.type === 'game_relearned')).toHaveLength(1);
  await fireEvent.press(view.getByRole('button', { name: 'Done' }));
  expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/play');
});

it('hides recall answers, saves an encounter before answering, and leaves learning unchanged on exit', async () => {
  mockStats = { 'word-0': { ...emptyWordPlayStats, lastPlayedAt: '2026-09-18', lastMode: 'matching' } };
  const view = await render(<GameScreen/>);
  await fireEvent.press(view.getByRole('button', { name: /^Start / }));
  await waitFor(() => expect(view.getByRole('button', { name: 'Reveal answer' }).props.accessibilityState.disabled).toBe(false));
  expect(view.queryByRole('button', { name: 'I know this' })).toBeNull();
  expect(view.queryByText(/^Meaning/)).toBeNull();
  const footer = view.getByTestId('word-play-actions');
  expect(within(footer).getByRole('button', { name: 'Reveal answer' })).toBeTruthy();
  expect(mockRecord.mock.calls.map(([event]) => event.type)).toEqual(['game_seen']);
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  expect(within(footer).getByRole('button', { name: 'I know this' })).toBeTruthy();
  expect(within(footer).getByRole('button', { name: 'Keep learning' })).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Keep learning' }));
  expect(view.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(within(footer).getByRole('button', { name: 'I know this' })).toBeDisabled();
  await fireEvent.press(view.getByRole('button', { name: 'Close Word play' }));
  expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/play');
  expect(mockRecord.mock.calls.map(([event]) => event.type)).toEqual(['game_seen', 'game_missed', 'game_answered']);
});

it('keeps cards interactive after a failed save and retries the same event', async () => {
  mockRecord.mockRejectedValueOnce(new Error('Storage busy'));
  const view = await render(<GameScreen autoStart/>);
  await waitFor(() => expect(view.getByRole('button', { name: 'Retry saving' })).toBeTruthy());
  expect(view.getAllByRole('button', { name: /^Word:/ }).every((button) => !button.props.accessibilityState.disabled)).toBe(true);
  const firstEvent = mockRecord.mock.calls[0][0];
  await fireEvent.press(view.getByRole('button', { name: 'Retry saving' }));
  await waitFor(() => expect(view.queryByRole('button', { name: 'Retry saving' })).toBeNull());
  expect(mockRecord.mock.calls[1][0]).toEqual(firstEvent);
});

it('matches immediately while saving is pending, without a loader or duplicate answers', async () => {
  let finish!: () => void;
  mockRecord.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const view = await render(<GameScreen autoStart/>);
  const term = view.getAllByRole('button', { name: /^Word:/ })[0].props.accessibilityLabel.replace('Word: ', '');
  await fireEvent.press(view.getByRole('button', { name: `Word: ${term}` }));
  const pair = view.getByRole('button', { name: `Meaning: ${term.replace('word', 'hint')}` });
  await act(async () => { await fireEvent.press(pair); await fireEvent.press(pair); });
  expect(view.queryByRole('button', { name: `Word: ${term}` })).toBeNull();
  expect(view.getByText('1 of 10 words revisited')).toBeTruthy();
  expect(view.queryByText('Saving…')).toBeNull();
  expect(JSON.stringify(view.toJSON())).not.toContain('ActivityIndicator');
  expect(mockRecord).toHaveBeenCalledTimes(1);
  await act(async () => { finish(); });
  await waitFor(() => expect(mockRecord.mock.calls.filter(([event]) => event.type === 'game_answered')).toHaveLength(1));
});

it('keeps optimistic answers and queued events across rounds and retries after failure', async () => {
  let fail!: (error: Error) => void;
  mockRecord.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
  const view = await render(<GameScreen autoStart initialFilter="collection:travel"/>);
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  const needsPractice = view.getByRole('button', { name: 'Keep learning' });
  await act(async () => { await fireEvent.press(needsPractice); await fireEvent.press(needsPractice); });
  await finishTransition();
  expect(view.getByText('1 of 2 words revisited')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Reveal answer' })).toBeEnabled();
  await act(async () => { fail(new Error('Storage busy')); });
  expect(view.getByRole('button', { name: 'Retry saving' })).toBeTruthy();
  expect(view.getByText('1 of 2 words revisited')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  await fireEvent.press(view.getByRole('button', { name: 'I know this' }));
  await finishTransition();
  expect(view.getByText('2 words revisited · 1 needed another look')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Retry saving' }));
  await waitFor(() => expect(view.queryByRole('button', { name: 'Retry saving' })).toBeNull());
  expect(mockRecord.mock.calls.map(([event]) => event.type)).toEqual(['game_seen', 'game_seen', 'game_missed', 'game_answered', 'game_seen', 'game_answered']);
  expect(mockRecord.mock.calls[0][0]).toEqual(mockRecord.mock.calls[1][0]);
});

it('finishes queued writes after leaving the screen', async () => {
  let finish!: () => void;
  mockRecord.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const view = await render(<GameScreen autoStart initialFilter="collection:travel"/>);
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  await fireEvent.press(view.getByRole('button', { name: 'I know this' }));
  await view.unmount();
  await act(async () => { finish(); });
  expect(mockRecord.mock.calls.map(([event]) => event.type)).toEqual(['game_seen', 'game_answered']);
});

it('does not unlock using learned words from another language', async () => {
  mockCourse = 'es-sk';
  const view = await render(<GameScreen/>);
  await fireEvent.press(view.getByRole('button', { name: /^Start / }));
  expect(view.getByText('No learned words in All vocabulary.')).toBeTruthy();
  expect(mockRecord).not.toHaveBeenCalled();
});


it('opens a full-screen game from the Play lobby and keeps the lobby out of the session', async () => {
  const lobby = await render(<GameScreen inTab/>);
  expect(lobby.queryByRole('button', { name: 'Close Word play' })).toBeNull();
  await fireEvent.press(lobby.getByRole('button', { name: /^Start / }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/word-play', params: { haptics: '0', filter: 'all', activity: 'surprise', status: 'learned', length: 'quick' } });
  expect(mockRecord).not.toHaveBeenCalled();
  await lobby.unmount();
  const game = await render(<GameScreen autoStart/>);
  await waitFor(() => expect(game.getByText('Find the pairs')).toBeTruthy());
  expect(game.queryByRole('button', { name: /^Start / })).toBeNull();
  await fireEvent.press(game.getByRole('button', { name: 'Close Word play' }));
  expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/play');
});


it('visiting Play dismisses only the current language introduction without starting a game', async () => {
  const view = await render(<PlayTab/>);
  await waitFor(() => expect(mockDismiss).toHaveBeenCalledWith('en-sk'));
  expect(mockRecord).not.toHaveBeenCalled();
  mockIntroductions = ['en-sk'];
  await view.rerender(<PlayTab/>);
  expect(mockDismiss).toHaveBeenCalledTimes(1);
  mockCourse = 'es-sk';
  await view.rerender(<PlayTab/>);
  await waitFor(() => expect(mockDismiss).toHaveBeenLastCalledWith('es-sk'));
  view.getByText('No words in All vocabulary.');
});

it('carries a selected scope and header haptics into the full-screen game', async () => {
  const view = await render(<GameScreen inTab/>);
  await fireEvent.press(view.getByRole('radio', { name: 'A collection' }));
  await fireEvent.press(view.getByRole('radio', { name: 'Travel, 2 words' }));
  expect(view.getByRole('button', { name: 'Start practice' })).toBeEnabled();
  await fireEvent.press(view.getByRole('switch', { name: 'Haptic feedback' }));
  await fireEvent.press(view.getByRole('button', { name: /^Start / }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/word-play', params: { haptics: '1', filter: 'collection:travel', activity: 'surprise', status: 'learned', length: 'quick' } });
});

it('plays a short collection session and reports its actual progress', async () => {
  const view = await render(<GameScreen autoStart initialFilter="collection:travel"/>);
  for (let index = 0; index < 2; index += 1) {
    await waitFor(() => expect(view.getByRole('button', { name: 'Reveal answer' })).toBeEnabled());
    expect(view.getByText(`${index} of 2 words revisited`)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'I know this' }));
    await finishTransition();
  }
  expect(view.getByText('2 words revisited · 0 needed another look')).toBeTruthy();
  expect(mockRecord.mock.calls.every(([event]) => ['word-0', 'word-1'].includes(event.wordId))).toBe(true);
});

it('filters by level and prevents selecting empty levels', async () => {
  const view = await render(<GameScreen/>);
  await fireEvent.press(view.getByRole('radio', { name: 'A level' }));
  expect(view.getByRole('button', { name: /^Start / })).toBeDisabled();
  await fireEvent.press(view.getByRole('radio', { name: 'A1, 3 words' }));
  expect(view.getByRole('button', { name: 'Start practice' })).toBeEnabled();
  expect(view.getByRole('radio', { name: 'C2, 0 words' })).toBeDisabled();
  await fireEvent.press(view.getByRole('radio', { name: 'C2, 0 words' }));
  expect(view.getByRole('radio', { name: 'A1, 3 words' })).toBeChecked();
  expect(mockRecord).not.toHaveBeenCalled();
});

it('offers retry if a queued write fails after closing the game', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  let fail!: (error: Error) => void;
  mockRecord.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
  const view = await render(<GameScreen autoStart initialFilter="collection:travel"/>);
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  await fireEvent.press(view.getByRole('button', { name: 'I know this' }));
  await view.unmount();
  await act(async () => { fail(new Error('Storage busy')); });
  expect(alert).toHaveBeenCalledWith('Game progress not saved', expect.any(String), expect.any(Array));
  await act(async () => { alert.mock.calls[0][2]![0].onPress!(); });
  await waitFor(() => expect(mockRecord.mock.calls.map(([event]) => event.type)).toEqual(['game_seen', 'game_seen', 'game_answered']));
  alert.mockRestore();
});

it('waits for queued game history before returning selected words to learning', async () => {
  let finish!: () => void;
  mockRecord.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const view = await render(<GameScreen autoStart initialFilter="collection:travel"/>);
  for (let index = 0; index < 2; index += 1) {
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: index ? 'I know this' : 'Keep learning' }));
    await finishTransition();
  }
  await fireEvent.press(view.getByRole('button', { name: 'Add 1 word to learning' }));
  expect(mockRecord).toHaveBeenCalledTimes(1);
  expect(view.queryByText('1 word is ready in today’s practice.')).toBeNull();
  await act(async () => { finish(); });
  await waitFor(() => expect(view.getByText('1 word is ready in today’s practice.')).toBeTruthy());
  expect(mockRecord.mock.calls.map(([event]) => event.type)).toEqual(['game_seen', 'game_missed', 'game_answered', 'game_seen', 'game_answered', 'game_relearned']);
});

it('reveals the back by tapping the card and resets the next word to its front', async () => {
  const view = await render(<GameScreen autoStart initialFilter="collection:travel"/>);
  const frame = view.getByTestId('recall-flashcard');
  const before = frame.props.style;
  expect(view.queryByText(/^Meaning/)).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: /hint.*Reveal answer/ }));
  expect(view.getByText(/^Meaning/)).toBeTruthy();
  expect(view.getByTestId('recall-flashcard').props.style).toEqual(before);
  expect(view.queryByTestId('recall-front')).toBeNull();
  expect(withTiming).toHaveBeenCalledWith(1, { duration: 360, reduceMotion: 'system' });
  await fireEvent.press(view.getByRole('button', { name: 'I know this' }));
  await finishTransition();
  expect(view.getByTestId('recall-front')).toBeTruthy();
  expect(view.queryByTestId('recall-back')).toBeNull();
  expect(view.queryByText(/^Meaning/)).toBeNull();
});

it('shows a complete long answer inside the same card with reduced motion', async () => {
  mockReducedMotion = true;
  const definition = 'A long definition. '.repeat(100);
  const word = { ...mockWords[0], definition, translation: null, partOfSpeech: 'noun' };
  const view = await render(<RecallFlashcard word={word} revealed={false} onReveal={() => undefined}/>);
  const height = StyleSheet.flatten(view.getByTestId('recall-flashcard').props.style).height;
  expect(view.getByText(word.term)).toBeTruthy();
  expect(view.queryByText(definition)).toBeNull();
  await view.rerender(<RecallFlashcard word={word} revealed onReveal={() => undefined}/>);
  expect(view.getByText(definition)).toBeTruthy();
  expect(StyleSheet.flatten(view.getByTestId('recall-flashcard').props.style).height).toBe(height);
  expect(view.queryByTestId('recall-front')).toBeNull();
  expect(withTiming).not.toHaveBeenCalled();
});

it.each([false, true])('animates a rated card then advances once (reduced motion: %s)', async (reducedMotion) => {
  mockReducedMotion = reducedMotion;
  const view = await render(<GameScreen autoStart initialFilter="collection:travel"/>);
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  await fireEvent.press(view.getByRole('button', { name: 'I know this' }));
  expect(view.queryByText('Nicely done!')).toBeNull();
  expect(view.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(view.getByRole('button', { name: 'I know this' })).toBeDisabled();
  expect(view.getByRole('button', { name: 'Keep learning' })).toBeDisabled();
  await fireEvent.press(view.getByRole('button', { name: 'Keep learning' }));
  expect(mockRecord.mock.calls.filter(([event]) => event.type === 'game_missed')).toHaveLength(0);
  expect(withTiming).toHaveBeenCalledWith(reducedMotion ? 0 : 2, expect.objectContaining({ duration: reducedMotion ? 120 : 360 }), expect.any(Function));
  await finishTransition();
  expect(view.getByRole('button', { name: 'Reveal answer' })).toBeEnabled();
  expect(view.getByText('1 of 2 words revisited')).toBeTruthy();
  expect(mockRecord.mock.calls.filter(([event]) => event.type === 'game_answered')).toHaveLength(1);
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  await fireEvent.press(view.getByRole('button', { name: 'Keep learning' }));
  await finishTransition();
  expect(view.getByText('2 words revisited · 1 needed another look')).toBeTruthy();
  expect(mockRecord.mock.calls.filter(([event]) => event.type === 'game_relearned')).toHaveLength(0);
});

it('checks a sentence, retains mistakes after success, and waits for Next', async () => {
  const onRecord = jest.fn(async () => undefined);
  const onNext = jest.fn();
  const word = { ...mockWords[0], term: 'quiet', definition: 'Making little noise.', partOfSpeech: 'adjective', translation: 'tichý' };
  const view = await render(<SentenceRound word={word} gap={{ before: 'The room is ', answer: 'quiet', after: '.' }} haptics={false} onRecord={onRecord} onNext={onNext}/>);
  expect(view.getByRole('button', { name: 'Check answer' })).toBeDisabled();
  expect(view.queryByText(word.definition)).toBeNull();
  await fireEvent.changeText(view.getByLabelText('Missing word'), 'loud');
  await fireEvent.press(view.getByRole('button', { name: 'Check answer' }));
  expect(view.getByRole('alert')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Check answer' }));
  expect(onRecord.mock.calls).toEqual([['game_missed']]);
  await fireEvent.changeText(view.getByLabelText('Missing word'), '  QUIET  ');
  await fireEvent(view.getByLabelText('Missing word'), 'submitEditing');
  expect(view.getByText(word.definition)).toBeTruthy();
  expect(view.getByText('adjective')).toBeTruthy();
  expect(view.getByText('That’s the word!')).toBeTruthy();
  expect(view.queryByLabelText('Missing word')).toBeNull();
  expect(onRecord.mock.calls).toEqual([['game_missed'], ['game_answered']]);
  expect(onNext).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Next word' }));
  await fireEvent.press(view.getByRole('button', { name: 'Next word' }));
  expect(onNext).toHaveBeenCalledTimes(1);
});

it('offers Show answer without typing and records practice only once', async () => {
  const onRecord = jest.fn(async () => undefined);
  const view = await render(<SentenceRound word={mockWords[0]} gap={{ before: 'Use ', answer: 'word 0', after: ' here.' }} haptics={false} onRecord={onRecord} onNext={() => undefined}/>);
  await fireEvent.press(view.getByRole('button', { name: 'Show answer' }));
  expect(view.getByText('A word to revisit')).toBeTruthy();
  expect(view.getByText(mockWords[0].definition)).toBeTruthy();
  expect(onRecord.mock.calls).toEqual([['game_missed'], ['game_answered']]);
});

it('integrates sentence rounds with filtered sessions, saves, and recap', async () => {
  mockStats = { 'word-0': { ...emptyWordPlayStats, gamesPlayed: 1, lastPlayedAt: '2026-09-25', lastMode: 'recall' } };
  const original = mockWords[0].example;
  mockWords[0].example = 'Use word 0 here.';
  try {
    const view = await render(<GameScreen autoStart initialFilter="collection:travel"/>);
    // The unplayed word is selected first and has no example: a recall fallback.
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'I know this' }));
    await finishTransition();
    expect(view.getByText('Fill the gap')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Show answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Next word' }));
    expect(view.getByText('2 words revisited · 1 needed another look')).toBeTruthy();
    expect(mockRecord.mock.calls.every(([event]) => event.sessionMode === 'sentence')).toBe(true);
    expect(mockRecord.mock.calls.filter(([event]) => event.mode === 'sentence').map(([event]) => event.type)).toEqual(['game_seen', 'game_missed', 'game_answered']);
  } finally { mockWords[0].example = original; }
});

it.each([false, true])('reveals skipped pairs, keeps their labels, and advances once (reduced motion: %s)', async (reducedMotion) => {
  mockReducedMotion = reducedMotion;
  const view = await render(<GameScreen autoStart/>);
  const terms = view.getAllByRole('button', { name: /^Word:/ }).map((tile) => tile.props.accessibilityLabel.replace('Word: ', ''));
  for (const term of terms) {
    await fireEvent.press(view.getByRole('button', { name: `Word: ${term}` }));
    const skip = view.getByRole('button', { name: 'Need another look' });
    await act(async () => { await fireEvent.press(skip); await fireEvent.press(skip); });
    expect(view.getByLabelText(`Word: ${term}, review again`)).toBeTruthy();
    expect(view.getByLabelText(`Meaning: ${term.replace('word', 'hint')}, review again`)).toBeTruthy();
    expect(view.queryByRole('button', { name: `Word: ${term}` })).toBeNull();
  }
  expect(view.getByRole('progressbar', { name: 'Pairs reviewed' }).props.accessibilityValue.now).toBe(5);
  expect(view.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(mockRecord.mock.calls.filter(([event]) => event.type === 'game_missed')).toHaveLength(5);
  expect(mockRecord.mock.calls.filter(([event]) => event.type === 'game_answered')).toHaveLength(5);
  await finishTransition();
  expect(view.getAllByRole('button', { name: /^Word:/ })).toHaveLength(5);
  expect(view.getByRole('progressbar', { name: 'Pairs reviewed' }).props.accessibilityValue.now).toBe(0);
});

it('retains the selected word after a mistake and leaves matched text readable', async () => {
  const view = await render(<GameScreen autoStart/>);
  const [first, second] = view.getAllByRole('button', { name: /^Word:/ }).map((tile) => tile.props.accessibilityLabel.replace('Word: ', ''));
  await fireEvent.press(view.getByRole('button', { name: `Word: ${first}` }));
  await fireEvent.press(view.getByRole('button', { name: `Meaning: ${second.replace('word', 'hint')}` }));
  expect(view.getByRole('button', { name: `Word: ${first}` }).props.accessibilityState.selected).toBe(true);
  expect(view.getByRole('button', { name: `Meaning: ${second.replace('word', 'hint')}` })).toBeEnabled();
  await fireEvent.press(view.getByRole('button', { name: `Meaning: ${first.replace('word', 'hint')}` }));
  expect(view.getByLabelText(`Word: ${first}, matched`)).toBeTruthy();
  expect(view.getByLabelText(`Meaning: ${first.replace('word', 'hint')}, matched`)).toBeTruthy();
  expect(view.queryByText('Nicely done!')).toBeNull();
});

it('shows illustrated choices, defaults to Word cards, and passes collection and length to the session', async () => {
  const view = await render(<WordPlayScreen inTab/>);
  expect(view.getByRole('radio', { name: 'Word cards' })).toBeChecked();
  expect(view.getByRole('radio', { name: 'Quick 10' })).toBeChecked();
  expect(view.getByRole('radio', { name: 'All, 10 words' })).toBeChecked();
  expect(view.getByRole('radio', { name: 'Flashcards' })).toBeTruthy();
  expect(within(view.getByTestId('play-setup-scroll')).queryByRole('button', { name: /^Start / })).toBeNull();
  expect(within(view.getByTestId('play-setup-footer')).getByText('Word cards · 10 words')).toBeTruthy();
  expect(within(view.getByTestId('play-setup-footer')).getByText('All vocabulary · All stages')).toBeTruthy();
  expect(within(view.getByTestId('play-setup-footer')).getByRole('button', { name: /^Start / })).toBeEnabled();
  await fireEvent.press(view.getByRole('radio', { name: 'A collection' }));
  await fireEvent.changeText(view.getByLabelText('Search collections'), 'trav');
  expect(view.queryByRole('radio', { name: 'Other, 8 words' })).toBeNull();
  await fireEvent.press(view.getByRole('radio', { name: 'Travel, 2 words' }));
  expect(view.getByRole('radio', { name: 'All, 2 words' })).toBeChecked();
  expect(within(view.getByTestId('play-setup-footer')).getByText('Word cards · 2 words')).toBeTruthy();
  await fireEvent.press(view.getByRole('radio', { name: 'All words' }));
  await fireEvent.press(view.getByRole('button', { name: 'Start practice' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/word-play', params: { activity: 'cards', filter: 'collection:travel', status: 'all', length: 'all', haptics: '0' } });
  expect(mockRecord).not.toHaveBeenCalled();
});

it('explains unsupported activities and offers a working alternative', async () => {
  const view = await render(<WordPlayScreen/>);
  await fireEvent.press(view.getByRole('radio', { name: 'Fill the gap' }));
  expect(view.getByText('0 of 10 words have a suitable example sentence.')).toBeTruthy();
  expect(view.getByRole('button', { name: /^Start / })).toBeDisabled();
  await fireEvent.press(view.getByRole('button', { name: 'Try Word cards' }));
  expect(view.getByRole('radio', { name: 'Word cards' })).toBeChecked();
  expect(view.getByRole('button', { name: 'Start practice' })).toBeEnabled();
  expect(mockRecord).not.toHaveBeenCalled();
});

it('does not offer to return already-learning words to learning after a game', async () => {
  const original = mockWords[0].state;
  mockWords[0].state = 'understood';
  try {
    const view = await render(<WordPlayScreen autoStart initialConfig={{ activity: 'recall', filter: 'collection:travel', status: 'learning', length: 'all' }}/>);
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Keep learning' }));
    await finishTransition();
    expect(view.getByText('word 0 · already learning')).toBeTruthy();
    expect(view.getByRole('checkbox', { name: 'Practise word 0 again' })).toBeDisabled();
    expect(view.queryByRole('button', { name: /Add .* to learning/ })).toBeNull();
    expect(mockRecord.mock.calls.map(([event]) => event.type)).toEqual(['game_seen', 'game_missed', 'game_answered']);
  } finally { mockWords[0].state = original; }
});

it('starts collection word cards with all states and records no game events', async () => {
  const original = mockWords[0].state;
  mockWords[0].state = 'new';
  try {
    const view = await render(<WordPlayScreen autoStart initialConfig={{ activity: 'cards', filter: 'collection:travel', status: 'all', length: 'all' }}/>);
    expect(view.getByText('word 0')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: 'Next' }));
    expect(view.getByText('word 1')).toBeTruthy();
    expect(view.getByText('2 of 2')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Previous' }));
    expect(view.getByText('word 0')).toBeTruthy();
    expect(mockRecord).not.toHaveBeenCalled();
  } finally { mockWords[0].state = original; }
});

it('narrows status counts to the chosen collection and recovers from an empty status', async () => {
  const view = await render(<WordPlayScreen/>);
  await fireEvent.press(view.getByRole('radio', { name: 'A collection' }));
  await fireEvent.press(view.getByRole('radio', { name: 'Travel, 2 words' }));
  expect(view.getByRole('radio', { name: 'Learned, 2 words' })).toBeTruthy();
  await fireEvent.press(view.getByRole('radio', { name: 'Still learning, 0 words' }));
  expect(view.getByRole('button', { name: /^Start / })).toBeDisabled();
  await fireEvent.press(view.getByRole('button', { name: 'Show all words' }));
  expect(view.getByRole('radio', { name: 'All, 2 words' })).toBeChecked();
  expect(within(view.getByTestId('play-setup-footer')).getByText('Word cards · 2 words')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Start practice' })).toBeEnabled();
});

it('keeps the source when dismissing collection search and explains a missing match', async () => {
  const view = await render(<WordPlayScreen initialConfig={{ activity: 'cards', filter: 'A1', status: 'all', length: 'quick' }}/>);
  await fireEvent.press(view.getByRole('radio', { name: 'A collection' }));
  await fireEvent.changeText(view.getByLabelText('Search collections'), 'not-here');
  expect(view.getByText('No collections match “not-here”. Try another name.')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Close collection picker' }));
  expect(view.getByRole('radio', { name: 'A1, 3 words' })).toBeChecked();
  expect(view.getByRole('button', { name: 'Start practice' })).toBeEnabled();
});

it('uses illustrated rows and stacked length cards for large text', async () => {
  const dimensions = jest.spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1.6 });
  try {
    const view = await render(<WordPlayScreen/>);
    const card = view.getByRole('radio', { name: 'Word cards' });
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({ width: '100%', flexDirection: 'row' });
    expect(StyleSheet.flatten(view.getByRole('radio', { name: 'Quick 10' }).props.style)).toMatchObject({ flexBasis: 'auto' });
    expect(view.getByRole('button', { name: 'Start practice' })).toBeEnabled();
  } finally { dimensions.mockRestore(); }
});

it('keeps activity previews still with reduced motion enabled', async () => {
  mockReducedMotion = true;
  const view = await render(<WordPlayScreen/>);
  await fireEvent.press(view.getByRole('radio', { name: 'Flashcards' }));
  expect(view.getByRole('radio', { name: 'Flashcards' })).toBeChecked();
  expect(withTiming).not.toHaveBeenCalled();
});

it('guides explicit choices through measured sections without scrolling on entry', async () => {
  const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
  const scroll = jest.spyOn(ScrollView.prototype, 'scrollTo');
  try {
    const view = await render(<WordPlayScreen/>);
    const layout = async (id: string, y: number) => fireEvent(view.getByTestId(id), 'layout', { nativeEvent: { layout: { x: 0, y, width: 320, height: 200 } } });
    await fireEvent(view.getByTestId('play-setup-scroll'), 'layout', { nativeEvent: { layout: { height: 500 } } });
    await fireEvent(view.getByTestId('play-setup-scroll'), 'contentSizeChange', 320, 1600);
    await layout('play-words-section', 600);
    await layout('play-include-section', 240);
    await layout('play-length-section', 960);
    expect(scroll).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('radio', { name: 'Word cards' }));
    await waitFor(() => expect(scroll).toHaveBeenLastCalledWith({ y: 592, animated: true }));
    await fireEvent.press(view.getByRole('radio', { name: 'All vocabulary' }));
    await waitFor(() => expect(scroll).toHaveBeenLastCalledWith({ y: 832, animated: true }));
    await fireEvent.press(view.getByRole('radio', { name: 'All, 10 words' }));
    await waitFor(() => expect(scroll).toHaveBeenLastCalledWith({ y: 952, animated: true }));
    await fireEvent.press(view.getByRole('radio', { name: 'A level' }));
    await fireEvent.press(view.getByRole('radio', { name: 'A1, 3 words' }));
    await layout('play-include-section', 350);
    await waitFor(() => expect(scroll).toHaveBeenLastCalledWith({ y: 942, animated: true }));
    await fireEvent.press(view.getByRole('radio', { name: 'A collection' }));
    await fireEvent.press(view.getByRole('radio', { name: 'Travel, 2 words' }));
    await layout('play-include-section', 240);
    await waitFor(() => expect(scroll).toHaveBeenLastCalledWith({ y: 832, animated: true }));
  } finally { scroll.mockRestore(); }
});

it('shows the scroll cue only with options below and respects reduced motion', async () => {
  mockReducedMotion = true;
  const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
  const scroll = jest.spyOn(ScrollView.prototype, 'scrollTo');
  try {
    const view = await render(<WordPlayScreen/>);
    const list = view.getByTestId('play-setup-scroll');
    await fireEvent(list, 'layout', { nativeEvent: { layout: { height: 500 } } });
    await fireEvent(list, 'contentSizeChange', 320, 1200);
    await fireEvent(view.getByTestId('play-words-section'), 'layout', { nativeEvent: { layout: { y: 600 } } });
    await fireEvent.press(view.getByRole('button', { name: 'More options below' }));
    await waitFor(() => expect(scroll).toHaveBeenLastCalledWith({ y: 592, animated: false }));
    const cue = view.getByTestId('play-scroll-cue');
    const cueHeight = StyleSheet.flatten(view.getByRole('button', { name: 'More options below' }).props.style).minHeight;
    await fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 700 } } });
    expect(view.getByTestId('play-scroll-cue', { includeHiddenElements: true })).toBe(cue);
    expect(StyleSheet.flatten(view.getByRole('button', { name: 'More options below', includeHiddenElements: true }).props.style).minHeight).toBe(cueHeight);
    expect(view.queryByRole('button', { name: 'More options below' })).toBeNull();
    await fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 100 } } });
    expect(view.getByRole('button', { name: 'More options below' })).toBeTruthy();
    await fireEvent(list, 'contentSizeChange', 320, 400);
    expect(view.queryByRole('button', { name: 'More options below' })).toBeNull();
  } finally { scroll.mockRestore(); }
});


it('clamps guided scrolling at the bottom and when all options fit', async () => {
  const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
  const scroll = jest.spyOn(ScrollView.prototype, 'scrollTo');
  try {
    const view = await render(<WordPlayScreen/>);
    const list = view.getByTestId('play-setup-scroll');
    await fireEvent(list, 'layout', { nativeEvent: { layout: { height: 500 } } });
    await fireEvent(list, 'contentSizeChange', 320, 1200);
    await fireEvent(view.getByTestId('play-length-section'), 'layout', { nativeEvent: { layout: { y: 960 } } });
    await fireEvent.press(view.getByRole('radio', { name: 'All, 10 words' }));
    await waitFor(() => expect(scroll).toHaveBeenLastCalledWith({ y: 700, animated: true }));
    await fireEvent(list, 'layout', { nativeEvent: { layout: { height: 1400 } } });
    await fireEvent.press(view.getByRole('radio', { name: 'All, 10 words' }));
    await waitFor(() => expect(scroll).toHaveBeenLastCalledWith({ y: 0, animated: true }));
  } finally { scroll.mockRestore(); }
});


it('does not rerender the setup on each scroll frame', async () => {
  const onRender = jest.fn();
  const view = await render(<Profiler id="play" onRender={onRender}><WordPlayScreen/></Profiler>);
  const list = view.getByTestId('play-setup-scroll');
  await fireEvent(list, 'layout', { nativeEvent: { layout: { height: 500 } } });
  await fireEvent(list, 'contentSizeChange', 320, 1200);
  onRender.mockClear();
  for (const y of [20, 80, 160, 320, 600]) {
    await fireEvent.scroll(list, { nativeEvent: { contentOffset: { y } } });
  }
  expect(onRender).not.toHaveBeenCalled();
});
