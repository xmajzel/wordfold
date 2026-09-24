import PlayTab from '@/app/(tabs)/play';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import type { Word } from '@/domain/types';
import type { WordPlayEvent, WordPlayStats } from './model';
import { emptyWordPlayStats } from './model';
import { withTiming } from 'react-native-reanimated';
import { RecallFlashcard } from './recall-flashcard';
import WordPlayScreen from './screen';

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
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => { jest.requireActual('react').useEffect(callback, [callback]); }, router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), dismissTo: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${Math.random()}` }));
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
  const view = await render(<WordPlayScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Let’s play' }));
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
    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
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
  const view = await render(<WordPlayScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Let’s play' }));
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
  const view = await render(<WordPlayScreen autoStart/>);
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
  const view = await render(<WordPlayScreen autoStart/>);
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
  const view = await render(<WordPlayScreen autoStart initialFilter="collection:travel"/>);
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
  const view = await render(<WordPlayScreen autoStart initialFilter="collection:travel"/>);
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  await fireEvent.press(view.getByRole('button', { name: 'I know this' }));
  await view.unmount();
  await act(async () => { finish(); });
  expect(mockRecord.mock.calls.map(([event]) => event.type)).toEqual(['game_seen', 'game_answered']);
});

it('does not unlock using learned words from another language', async () => {
  mockCourse = 'es-sk';
  const view = await render(<WordPlayScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Let’s play' }));
  expect(view.getByText('Learn 10 more words to unlock Word play.')).toBeTruthy();
  expect(mockRecord).not.toHaveBeenCalled();
});


it('opens a full-screen game from the Play lobby and keeps the lobby out of the session', async () => {
  const lobby = await render(<WordPlayScreen inTab/>);
  expect(lobby.queryByRole('button', { name: 'Close Word play' })).toBeNull();
  await fireEvent.press(lobby.getByRole('button', { name: 'Let’s play' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/word-play', params: { haptics: '0', filter: 'all' } });
  expect(mockRecord).not.toHaveBeenCalled();
  await lobby.unmount();
  const game = await render(<WordPlayScreen autoStart/>);
  await waitFor(() => expect(game.getByText('Find the pairs')).toBeTruthy());
  expect(game.queryByRole('button', { name: 'Let’s play' })).toBeNull();
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
  view.getByText('0 of 10 words learned');
});

it('carries a selected scope and header haptics into the full-screen game', async () => {
  const view = await render(<WordPlayScreen inTab/>);
  await fireEvent.press(view.getByRole('radio', { name: 'Travel, 2 learned words' }));
  expect(view.getByText('2 words this round')).toBeTruthy();
  await fireEvent.press(view.getByRole('switch', { name: 'Haptic feedback' }));
  await fireEvent.press(view.getByRole('button', { name: 'Let’s play' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/word-play', params: { haptics: '1', filter: 'collection:travel' } });
});

it('plays a short collection session and reports its actual progress', async () => {
  const view = await render(<WordPlayScreen autoStart initialFilter="collection:travel"/>);
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

it('filters by level and disables empty selections without starting a game', async () => {
  const view = await render(<WordPlayScreen/>);
  await fireEvent.press(view.getByRole('radio', { name: 'A1, 3 learned words' }));
  expect(view.getByText('3 words this round')).toBeTruthy();
  await fireEvent.press(view.getByRole('radio', { name: 'C2, 0 learned words' }));
  expect(view.getByRole('button', { name: 'Let’s play' })).toBeDisabled();
  expect(view.getByText('No learned words in this selection yet. Choose another collection or level.')).toBeTruthy();
  expect(mockRecord).not.toHaveBeenCalled();
});

it('offers retry if a queued write fails after closing the game', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  let fail!: (error: Error) => void;
  mockRecord.mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
  const view = await render(<WordPlayScreen autoStart initialFilter="collection:travel"/>);
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
  const view = await render(<WordPlayScreen autoStart initialFilter="collection:travel"/>);
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
  const view = await render(<WordPlayScreen autoStart initialFilter="collection:travel"/>);
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
  const view = await render(<WordPlayScreen autoStart initialFilter="collection:travel"/>);
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
