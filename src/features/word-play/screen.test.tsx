import PlayTab from '@/app/(tabs)/play';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { Word } from '@/domain/types';
import type { WordPlayEvent, WordPlayStats } from './model';
import { emptyWordPlayStats } from './model';
import WordPlayScreen from './screen';

const mockRecord = jest.fn<Promise<void>, [WordPlayEvent]>(async () => undefined);
const mockDismiss = jest.fn(async () => undefined);
let mockIntroductions: string[] = [];
let mockStats: Record<string, WordPlayStats> = {};
let mockCourse: 'en-sk' | 'es-sk' = 'en-sk';
const mockWords = Array.from({ length: 10 }, (_, index) => ({
  id: `word-${index}`, term: `word ${index}`, translation: `hint ${index}`, definition: `Meaning ${index}`,
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', state: 'learned',
} as Word));
jest.mock('@/providers/app-data-provider', () => ({ useAppData: () => ({
  dismissWordPlayIntroduction: mockDismiss, wordPlayIntroductions: mockIntroductions,
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
  return { __esModule: true, default: { View }, FadeInDown: animation, FadeOut: animation, ReduceMotion: { System: 'system' } };
});

beforeEach(() => { jest.clearAllMocks(); mockRecord.mockResolvedValue(undefined); mockStats = {}; mockCourse = 'en-sk'; mockIntroductions = []; });

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
  expect(view.queryByRole('button', { name: 'Got it' })).toBeNull();
  expect(view.queryByText(/^Meaning/)).toBeNull();
  expect(mockRecord.mock.calls.map(([event]) => event.type)).toEqual(['game_seen']);
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  await fireEvent.press(view.getByRole('button', { name: 'Needs practice' }));
  await waitFor(() => expect(view.getByRole('button', { name: 'Continue' })).toBeTruthy());
  await fireEvent.press(view.getByRole('button', { name: 'Close Word play' }));
  expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/play');
  expect(mockRecord.mock.calls.map(([event]) => event.type)).toEqual(['game_seen', 'game_missed', 'game_answered']);
});

it('retries a failed encounter with the same event identity before exposing answers', async () => {
  mockRecord.mockRejectedValueOnce(new Error('Storage busy'));
  const view = await render(<WordPlayScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Let’s play' }));
  await waitFor(() => expect(view.getByRole('button', { name: 'Retry round' })).toBeTruthy());
  expect(view.getAllByRole('button', { name: /^Word:/ }).every((button) => button.props.accessibilityState.disabled)).toBe(true);
  await fireEvent.press(view.getByRole('button', { name: 'Retry round' }));
  await waitFor(() => {
      const tiles = view.getAllByRole('button', { name: /^Word:/ });
      expect(tiles).toHaveLength(5);
      expect(tiles[0].props.accessibilityState.disabled).toBe(false);
    });
  expect(mockRecord.mock.calls[1][0]).toEqual(mockRecord.mock.calls[0][0]);
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
  expect(router.push).toHaveBeenCalledWith({ pathname: '/word-play', params: { haptics: '0' } });
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
