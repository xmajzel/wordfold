import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { AppState, type AppStateStatus } from 'react-native';
import ImportScreen from '@/app/import';
import ImportReviewScreen from '@/app/import-review';
import { AiError } from '@/features/ai/client';
import { makeReviewQueue, parseReviewQueue, reviewQueueKey, saveReviewQueue } from './review-queue';

const mockGenerate = jest.fn();
const mockBalance = jest.fn();
const mockCreateWord = jest.fn(async () => 'new-word');
const mockFindSenses = jest.fn(async () => []);
let mockUser: { id: string } | null = { id: 'user-a' };
let mockId = 0;
const mockWords = [{ normalizedTerm: 'existing', sourceLanguageCode: 'en', targetLanguageCode: 'sk' }];
const mockCollections = [{ id: 'class', name: 'Class' }];
const suggestion = { definition: 'AI definition', translation: 'AI hint', example: 'AI example', partOfSpeech: 'noun' };
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => `11111111-1111-4111-8111-${String(++mockId).padStart(12, '0')}` }));
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissAll: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]) }));
jest.mock('@/components/screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/components/collection-form-disclosure', () => ({ CollectionFormDisclosure: () => null }));
jest.mock('@/app/word/new', () => ({ ModalHeader: () => null }));
jest.mock('@/features/ai/suggestion-transition', () => ({ SuggestionTransition: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/features/ai/client', () => ({ ...jest.requireActual('@/features/ai/client'),
  generateSuggestion: (...args: unknown[]) => mockGenerate(...args), fetchAiBalance: () => mockBalance() }));
jest.mock('@/components/primary-button', () => ({ PrimaryButton: ({ label, onPress, disabled, loading }: any) => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || loading} onPress={onPress}><Text>{label}</Text></Pressable>;
} }));
jest.mock('@/features/ai/ai-presentation', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return { AiHeading: ({ children }: any) => <Text>{children}</Text>, AiSurface: ({ children }: any) => <>{children}</>,
    AiButton: ({ label, onPress, disabled, loading }: any) => <Pressable accessibilityRole="button" accessibilityLabel={label}
      disabled={disabled || loading} onPress={onPress}><Text>{label}</Text></Pressable> };
});
jest.mock('@/features/translation/translator', () => ({ isOnDeviceTranslationPairSupported: () => false }));
jest.mock('@/providers/app-data-provider', () => ({ useAppData: () => ({
  activeCourse: { id: 'en-sk', sourceLanguageCode: 'en', targetLanguageCode: 'sk', defaultSourcePronunciationLocale: 'en-US', defaultTargetPronunciationLocale: 'sk-SK', capabilities: { bundledCatalog: true } },
  words: mockWords, collections: mockCollections, dataSource: 'synced', createWord: mockCreateWord,
  createWords: jest.fn(), createCollection: jest.fn(), findSenses: mockFindSenses, pronunciationVoicePreference: 'device', wordCapacity: { remaining: 100 },
}) }));
const key = reviewQueueKey('user-a', 'en-sk');
beforeEach(async () => {
  await AsyncStorage.clear(); jest.clearAllMocks(); mockUser = { id: 'user-a' }; mockId = 0;
  mockGenerate.mockReset().mockResolvedValue({ status: 'completed', balance: 9, suggestion });
  mockBalance.mockResolvedValue({ balance: 10 });
});

it('starts AI preparation separately and keeps unfinished reviews protected', async () => {
  const view = await render(<ImportScreen/>);
  await fireEvent.changeText(view.getByPlaceholderText(/stakeholder/), 'tenacity - my hint');
  await fireEvent.press(view.getByText('Prepare with AI & review'));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/import-review'));
  expect(parseReviewQueue(await AsyncStorage.getItem(key))).toMatchObject({ aiPreparation: true, rows: [{ pastedFields: { translation: 'my hint' } }] });
  expect(mockGenerate).not.toHaveBeenCalled();
  jest.mocked(router.push).mockClear();
  await fireEvent.changeText(view.getByPlaceholderText(/stakeholder/), 'tolerance');
  await fireEvent.press(view.getByText('Prepare with AI & review'));
  await waitFor(() => expect(view.getByText('Replace saved review')).toBeTruthy());
  expect(router.push).not.toHaveBeenCalled();
  expect(parseReviewQueue(await AsyncStorage.getItem(key))?.rows[0].term).toBe('tenacity');
  await fireEvent.press(view.getByText('Replace saved review'));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/import-review'));
  expect(parseReviewQueue(await AsyncStorage.getItem(key))).toMatchObject({ aiPreparation: true, rows: [{ term: 'tolerance' }] });
});

it('routes guests to sign-in without generating or starting an AI queue', async () => {
  mockUser = null;
  const view = await render(<ImportScreen/>);
  await fireEvent.changeText(view.getByPlaceholderText(/stakeholder/), 'tenacity');
  await fireEvent.press(view.getByText('Sign in to prepare with AI'));
  expect(router.push).toHaveBeenCalledWith('/account');
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});

it('shows cost first, skips invalid and duplicate words, and keeps acceptance separate from saving', async () => {
  await saveReviewQueue(key, makeReviewQueue('tenacity - my hint\ntolerance\nexisting\ntenacity', 'en', 'class', true));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText(/Up to 2 credits/)).toBeTruthy());
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(mockFindSenses).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText('Prepare remaining suggestions'));
  await waitFor(() => expect(view.getByText(suggestion.definition)).toBeTruthy());
  expect(mockGenerate.mock.calls.map((call) => call[1].term)).toEqual(['tenacity', 'tolerance']);
  expect(view.getByLabelText('Definition').props.value).toBe('');
  expect(view.getByLabelText('Translation').props.value).toBe('my hint');
  expect(mockCreateWord).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText('Accept'));
  await waitFor(() => expect(view.getByLabelText('Definition').props.value).toBe(suggestion.definition));
  expect(view.getByLabelText('Translation').props.value).toBe('my hint');
  expect(mockCreateWord).not.toHaveBeenCalled();
  expect(parseReviewQueue(await AsyncStorage.getItem(key))?.index).toBe(0);
  await fireEvent.press(view.getByText('Add & next'));
  await waitFor(() => expect(view.getByText('Word 2 of 4 · 1 added')).toBeTruthy());
  await waitFor(() => expect(view.getByText(suggestion.definition)).toBeTruthy());
  expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({ term: 'tenacity', definition: suggestion.definition, translation: 'my hint' }));
  await fireEvent.press(view.getByText('Discard'));
  await waitFor(() => expect(view.queryByText(suggestion.definition)).toBeNull());
  expect(view.getByLabelText('Definition').props.value).toBe('');
  expect(mockGenerate).toHaveBeenCalledTimes(2);
  await fireEvent.press(view.getByText('Skip'));
  await waitFor(() => expect(view.getByText('Word 3 of 4 · 1 added')).toBeTruthy());
});

it('keeps pasted editorial fields and manual edits when accepting a prepared suggestion', async () => {
  await saveReviewQueue(key, makeReviewQueue('tenacity | My definition | My hint | My example', 'en', 'class', true));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText('Prepare remaining suggestions')).toBeTruthy());
  await fireEvent.press(view.getByText('Prepare remaining suggestions'));
  await waitFor(() => expect(view.getByText('Accept')).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText('Translation'), 'Edited hint');
  await fireEvent.press(view.getByText('Accept'));
  await waitFor(() => expect(view.queryByText('Accept')).toBeNull());
  expect(view.getByLabelText('Definition').props.value).toBe('My definition');
  expect(view.getByLabelText('Translation').props.value).toBe('Edited hint');
  expect(view.getByLabelText('Example').props.value).toBe('My example');
  expect(view.getByLabelText('Part of speech').props.value).toBe('noun');
});

it('resumes partial preparation without regenerating completed suggestions', async () => {
  mockGenerate.mockResolvedValueOnce({ status: 'completed', balance: 0, suggestion }).mockRejectedValueOnce(new AiError('no_credits'));
  await saveReviewQueue(key, makeReviewQueue('tenacity\ntolerance', 'en', 'class', true));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText('Prepare remaining suggestions')).toBeTruthy());
  await fireEvent.press(view.getByText('Prepare remaining suggestions'));
  await waitFor(() => expect(view.getByText('1 of 2 suggestions ready')).toBeTruthy());
  await waitFor(() => expect(view.getByText(/No AI credits remaining/)).toBeTruthy());
  await view.unmount();
  const resumed = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(resumed.getByText(/Up to 1 credit for/)).toBeTruthy());
  await fireEvent.press(resumed.getByText('Prepare remaining suggestions'));
  await waitFor(() => expect(resumed.getByText('Accept')).toBeTruthy());
  expect(mockGenerate).toHaveBeenCalledTimes(3);
  expect(mockGenerate.mock.calls[2][1].term).toBe('tolerance');
  expect(mockCreateWord).not.toHaveBeenCalled();
});

it('can continue reviewing after a preparation failure and recover the same request in the word panel', async () => {
  mockGenerate.mockRejectedValueOnce(new AiError('unavailable'));
  await saveReviewQueue(key, makeReviewQueue('tenacity', 'en', 'class', true));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText('Prepare remaining suggestions')).toBeTruthy());
  await fireEvent.press(view.getByText('Prepare remaining suggestions'));
  await waitFor(() => expect(view.getByText(/AI could not be reached/)).toBeTruthy());
  const requestId = mockGenerate.mock.calls[0][0];
  await fireEvent.press(view.getByText('Continue review'));
  await waitFor(() => expect(view.getByText('Retry AI request · no extra credit')).toBeTruthy());
  await fireEvent.press(view.getByText('Retry AI request · no extra credit'));
  await waitFor(() => expect(view.getByText('Accept')).toBeTruthy());
  expect(mockGenerate.mock.calls[1][0]).toBe(requestId);
});

it.each(['Accept', 'Discard'])('keeps %s decisions when resuming preparation before advancing', async (action) => {
  await saveReviewQueue(key, makeReviewQueue('tenacity\ntolerance', 'en', 'class', true));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText('Prepare remaining suggestions')).toBeTruthy());
  await fireEvent.press(view.getByText('Prepare remaining suggestions'));
  await waitFor(() => expect(view.getByText(action)).toBeTruthy());
  await fireEvent.press(view.getByText(action));
  await waitFor(async () => expect(parseReviewQueue(await AsyncStorage.getItem(key))?.rows[0].aiReviewed).toBe(true));
  await view.unmount();
  const resumed = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(resumed.getByText('1 of 1 suggestions ready')).toBeTruthy());
  expect(resumed.getByText(/Up to 0 credits/)).toBeTruthy();
  await fireEvent.press(resumed.getByText('Continue review'));
  await waitFor(() => expect(resumed.getByLabelText('Definition').props.value).toBe(action === 'Accept' ? suggestion.definition : ''));
  expect(resumed.queryByText('Accept')).toBeNull();
  expect(mockGenerate).toHaveBeenCalledTimes(2);
});

it('pauses when backgrounded and keeps the current result without starting the next word', async () => {
  let finish!: (value: unknown) => void;
  let appStateChanged!: (state: AppStateStatus) => void;
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    appStateChanged = callback; return { remove: jest.fn() };
  });
  mockGenerate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await saveReviewQueue(key, makeReviewQueue('tenacity\ntolerance', 'en', 'class', true));
  const view = await render(<ImportReviewScreen/>);
  await waitFor(() => expect(view.getByText('Prepare remaining suggestions')).toBeTruthy());
  await fireEvent.press(view.getByText('Prepare remaining suggestions'));
  await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
  await act(async () => appStateChanged('background'));
  await act(async () => finish({ status: 'completed', balance: 9, suggestion }));
  await waitFor(() => expect(view.getByText('1 of 2 suggestions ready')).toBeTruthy());
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByText('Continue review'));
  await waitFor(() => expect(view.getByText('Accept')).toBeTruthy());
  subscription.mockRestore();
});
