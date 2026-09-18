import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ImportReviewScreen from '@/app/import-review';
import { makeReviewQueue, reviewQueueKey, saveReviewQueue, parseReviewQueue } from './review-queue';
const mockTranslate = jest.fn();
jest.mock('@/features/translation/translator', () => ({
  isOnDeviceTranslationPairSupported: (source: string, target: string) => ['en', 'es'].includes(source) && target === 'sk',
  translateOnDevice: (...args: unknown[]) => mockTranslate(...args),
  TranslationCancelledError: class extends Error {},
}));
const mockCreateWord = jest.fn(async () => 'new-word');
const mockFindSenses = jest.fn(async () => [{ id: 'sense', definition: 'Determination despite difficulty.', partOfSpeech: 'noun', example: 'She never gave up.', translation: 'vytrvalosť' }]);
let mockUser = 'user-a'; let mockWords: { normalizedTerm: string; sourceLanguageCode: string; targetLanguageCode: string }[] = [];
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: { id: mockUser } }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), dismissAll: jest.fn(), navigate: jest.fn() } }));
jest.mock('@/components/screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/app/word/new', () => ({ ModalHeader: () => null }));
jest.mock('@/features/ai/suggestion-panel', () => ({ SuggestionPanel: () => null }));
jest.mock('@/providers/app-data-provider', () => ({ useAppData: () => ({
  activeCourse: { id: 'en-sk', sourceLanguageCode: 'en', targetLanguageCode: 'sk', defaultSourcePronunciationLocale: 'en-US', defaultTargetPronunciationLocale: 'sk-SK', capabilities: { bundledCatalog: true } },
  collections: [{ id: 'class', name: 'Class' }], words: mockWords, createWord: mockCreateWord, findSenses: mockFindSenses, pronunciationVoicePreference: 'device', wordCapacity: { remaining: 100 },
}) }));
jest.mock('@/components/primary-button', () => ({ PrimaryButton: ({ label, onPress, disabled, loading }: any) => {
  const { Pressable, Text } = jest.requireActual('react-native'); return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}><Text>{label}</Text></Pressable>;
} }));
beforeEach(async () => { await AsyncStorage.clear(); jest.clearAllMocks(); mockTranslate.mockReset(); mockUser = 'user-a'; mockWords = []; });
it('finds dictionary meanings, saves edited words individually, and resumes the next word', async () => {
  const key = reviewQueueKey(mockUser,'en-sk');
  await saveReviewQueue(key,makeReviewQueue('tenacity\ntolerance','en','class'));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByDisplayValue('Determination despite difficulty.')).toBeTruthy());
  expect(mockCreateWord).not.toHaveBeenCalled();
  await fireEvent.changeText(view.getByLabelText('Translation'),'húževnatosť');
  await fireEvent.press(view.getByText('Add & next'));
  await waitFor(() => expect(view.getByText('Word 2 of 2 · 1 added')).toBeTruthy());
  expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({ term: 'tenacity', translation: 'húževnatosť' }));
  await waitFor(async () => expect(parseReviewQueue(await AsyncStorage.getItem(key))?.index).toBe(1));
  await view.unmount(); const resumed = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(resumed.getByText('Word 2 of 2 · 1 added')).toBeTruthy());
});
it('lets users skip duplicates without saving them and isolates account queues', async () => {
  mockWords = [{ normalizedTerm: 'tenacity', sourceLanguageCode: 'en', targetLanguageCode: 'sk' }];
  await saveReviewQueue(reviewQueueKey(mockUser,'en-sk'),makeReviewQueue('tenacity','en','class'));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText('Already in your library. Skip this word to avoid a duplicate.')).toBeTruthy());
  await fireEvent.press(view.getByText('Skip'));
  await waitFor(() => expect(view.getByText('0 words added · 1 skipped')).toBeTruthy());
  expect(mockCreateWord).not.toHaveBeenCalled();
  mockUser = 'user-b'; await view.rerender(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText('No saved review for this account and course. Start from Bulk paste.')).toBeTruthy());
});

it('generates a missing translation for free and persists it with manual edits', async () => {
  mockFindSenses.mockResolvedValueOnce([]);
  mockTranslate.mockResolvedValue('vytrvalosť');
  const key = reviewQueueKey(mockUser, 'en-sk');
  await saveReviewQueue(key, makeReviewQueue('tenacity', 'en', 'class'));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText('No offline definition found. Write your own or ask AI.')).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText('Definition'), 'My definition');
  await fireEvent.press(view.getByText('Generate Slovak hint on device'));
  await waitFor(() => expect(view.getByLabelText('Translation').props.value).toBe('vytrvalosť'));
  expect(mockTranslate).toHaveBeenCalledWith('tenacity', { sourceLanguageCode: 'en', targetLanguageCode: 'sk' }, { signal: expect.any(AbortSignal) });
  expect(view.getByLabelText('Definition').props.value).toBe('My definition');
  await waitFor(async () => expect(parseReviewQueue(await AsyncStorage.getItem(key))?.rows[0].translation).toBe('vytrvalosť'));
  await fireEvent.press(view.getByText('Add & next'));
  expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({ definition: 'My definition', translation: 'vytrvalosť' }));
});
it('keeps manual translations and allows retry when the translator fails', async () => {
  mockTranslate.mockRejectedValueOnce(new Error('Connect to Wi-Fi and try again.')).mockResolvedValue('new hint');
  await saveReviewQueue(reviewQueueKey(mockUser, 'en-sk'), makeReviewQueue('tenacity', 'en', 'class'));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByDisplayValue('vytrvalosť')).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText('Translation'), 'my hint');
  await fireEvent.press(view.getByText('Generate Slovak hint on device'));
  await waitFor(() => expect(view.getByText('Connect to Wi-Fi and try again.')).toBeTruthy());
  expect(view.getByLabelText('Translation').props.value).toBe('my hint');
  await fireEvent.press(view.getByText('Generate Slovak hint on device'));
  await waitFor(() => expect(view.getByDisplayValue('new hint')).toBeTruthy());
});
it('cancels a pending translation when editing or advancing so late results cannot overwrite drafts', async () => {
  let resolve!: (value: string) => void;
  mockTranslate.mockImplementation(() => new Promise<string>((done) => { resolve = done; }));
  await saveReviewQueue(reviewQueueKey(mockUser, 'en-sk'), makeReviewQueue('tenacity\ntolerance', 'en', 'class'));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByDisplayValue('vytrvalosť')).toBeTruthy());
  await fireEvent.press(view.getByText('Generate Slovak hint on device'));
  const firstSignal = mockTranslate.mock.calls[0][2].signal;
  await fireEvent.changeText(view.getByLabelText('Translation'), 'manual hint');
  expect(firstSignal.aborted).toBe(true);
  await act(async () => resolve('late result'));
  expect(view.getByLabelText('Translation').props.value).toBe('manual hint');
  await fireEvent.press(view.getByText('Generate Slovak hint on device'));
  const secondSignal = mockTranslate.mock.calls[1][2].signal;
  await fireEvent.press(view.getByText('Skip'));
  await waitFor(() => expect(view.getByText('Word 2 of 2 · 0 added')).toBeTruthy());
  expect(secondSignal.aborted).toBe(true);
  await act(async () => resolve('wrong word result'));
  expect(view.getByLabelText('Translation').props.value).toBe('vytrvalosť');
  await fireEvent.press(view.getByText('Generate Slovak hint on device'));
  const thirdSignal = mockTranslate.mock.calls[2][2].signal;
  await view.unmount();
  expect(thirdSignal.aborted).toBe(true);
  await act(async () => resolve('after close'));
});

it('clears completed review and dismisses the import stack before opening My words', async () => {
  const key = reviewQueueKey(mockUser, 'en-sk');
  const queue = makeReviewQueue('tenacity', 'en', 'class');
  await saveReviewQueue(key, { ...queue, index: 1, added: 1 });
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText('Review complete')).toBeTruthy());
  await fireEvent.press(view.getByText('Done'));
  await waitFor(() => expect(router.navigate).toHaveBeenCalledWith({ pathname: '/(tabs)/library', params: { view: 'my-words' } }));
  expect(await AsyncStorage.getItem(key)).toBeNull();
  expect(router.dismissAll).toHaveBeenCalledTimes(1);
  expect(jest.mocked(router.dismissAll).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(router.navigate).mock.invocationCallOrder[0]);
  expect(router.back).not.toHaveBeenCalled();
});
it('stays on completion and allows retry if clearing the review fails', async () => {
  const key = reviewQueueKey(mockUser, 'en-sk');
  const queue = makeReviewQueue('tenacity', 'en', 'class');
  await saveReviewQueue(key, { ...queue, index: 1, skipped: 1 });
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText('Review complete')).toBeTruthy());
  jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('Storage unavailable'));
  await fireEvent.press(view.getByText('Done'));
  await waitFor(() => expect(view.getByText('Could not clear this review. Please try again.')).toBeTruthy());
  expect(router.dismissAll).not.toHaveBeenCalled();
  expect(router.navigate).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(key)).not.toBeNull();
  await fireEvent.press(view.getByText('Done'));
  await waitFor(() => expect(router.navigate).toHaveBeenCalledTimes(1));
});
