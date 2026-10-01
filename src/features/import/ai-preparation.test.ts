import AsyncStorage from '@react-native-async-storage/async-storage';
import { AiError } from '@/features/ai/client';
import { loadSavedSuggestion, suggestionStorageKey } from '@/features/ai/saved-suggestion';
import { prepareReviewSuggestions, reviewSuggestionInput } from './ai-preparation';
import { makeReviewQueue } from './review-queue';

const mockGenerate = jest.fn();
let mockId = 0;
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => `11111111-1111-4111-8111-${String(++mockId).padStart(12, '0')}` }));
jest.mock('@/features/ai/client', () => ({ ...jest.requireActual('@/features/ai/client'), generateSuggestion: (...args: unknown[]) => mockGenerate(...args) }));
const suggestion = { definition: 'Keep trying.', translation: 'vytrvalosť', example: 'She showed great tenacity.', partOfSpeech: 'noun' };
const inputs = makeReviewQueue('tenacity\ntolerance', 'en', 'class').rows.map((row) => reviewSuggestionInput(row, 'en', 'sk'));
const run = (signal = new AbortController().signal, onPrepared = jest.fn()) => prepareReviewSuggestions({ userId: 'user-a', inputs, signal, onPrepared });
beforeEach(async () => {
  await AsyncStorage.clear(); jest.clearAllMocks(); mockId = 0;
  mockGenerate.mockReset().mockResolvedValue({ status: 'completed', balance: 9, suggestion });
});

it('stores recovery IDs before spending and leaves review forms unchanged', async () => {
  mockGenerate.mockImplementation(async (id, input) => {
    expect(await loadSavedSuggestion(suggestionStorageKey('user-a', input), input)).toEqual({ requestId: id, input });
    return { status: 'completed', balance: 9, suggestion };
  });
  const queue = makeReviewQueue('tenacity', 'en', 'class', true);
  const progress = jest.fn();
  await run(undefined, progress);
  expect(progress).toHaveBeenCalledTimes(2);
  expect(queue.rows[0].definition).toBe('');
  expect(await loadSavedSuggestion(suggestionStorageKey('user-a', inputs[0]), inputs[0])).toMatchObject({ suggestion });
  expect(await loadSavedSuggestion(suggestionStorageKey('user-b', inputs[0]), inputs[0])).toBeNull();
  expect(await loadSavedSuggestion(suggestionStorageKey('user-a', { ...inputs[0], sourceLanguageCode: 'es' }), inputs[0])).toBeNull();
});

it('reuses completed drafts and recovers a lost response using the same ID', async () => {
  mockGenerate.mockResolvedValueOnce({ status: 'completed', balance: 9, suggestion }).mockRejectedValueOnce(new AiError('unavailable'));
  await expect(run()).rejects.toThrow();
  const id = mockGenerate.mock.calls[1][0];
  await run();
  expect(mockGenerate).toHaveBeenCalledTimes(3);
  expect(mockGenerate.mock.calls[2][0]).toBe(id);
  expect(mockGenerate.mock.calls[2][1].term).toBe('tolerance');
});

it('keeps a pending request recoverable and pauses the batch', async () => {
  mockGenerate.mockResolvedValueOnce({ status: 'pending', balance: 9 });
  await expect(run()).rejects.toThrow('still being prepared');
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  const id = mockGenerate.mock.calls[0][0];
  await run();
  expect(mockGenerate.mock.calls[1][0]).toBe(id);
});

it.each(['no_credits', 'limited', 'invalid_input', 'request_conflict'])('pauses on %s, retaining completed suggestions', async (code) => {
  mockGenerate.mockResolvedValueOnce({ status: 'completed', balance: 9, suggestion }).mockRejectedValueOnce(new AiError(code));
  await expect(run()).rejects.toThrow();
  expect(await loadSavedSuggestion(suggestionStorageKey('user-a', inputs[0]), inputs[0])).toMatchObject({ suggestion });
  expect(await loadSavedSuggestion(suggestionStorageKey('user-a', inputs[1]), inputs[1])).toBeNull();
});

it('clears a refunded failed request so an explicit retry can generate anew', async () => {
  mockGenerate.mockResolvedValueOnce({ status: 'failed', balance: 10 });
  await expect(run()).rejects.toThrow('credit was returned');
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
  const failedId = mockGenerate.mock.calls[0][0];
  await run();
  expect(mockGenerate.mock.calls[1][0]).not.toBe(failedId);
});

it('stops spending after cancellation but retains the in-flight result', async () => {
  const controller = new AbortController();
  mockGenerate.mockImplementationOnce(async () => {
    controller.abort();
    return { status: 'completed', balance: 9, suggestion };
  });
  const progress = jest.fn();
  await run(controller.signal, progress);
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  expect(progress).not.toHaveBeenCalled();
  expect(await loadSavedSuggestion(suggestionStorageKey('user-a', inputs[0]), inputs[0])).toMatchObject({ suggestion });
});

it('does not spend if saving the recovery ID fails', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Storage full'));
  await expect(run()).rejects.toThrow('Storage full');
  expect(mockGenerate).not.toHaveBeenCalled();
});

it('uses the original request input when recovering after manual edits', async () => {
  const original = { ...inputs[0], context: 'Original context' };
  await AsyncStorage.setItem(suggestionStorageKey('user-a', original), JSON.stringify({ requestId: '11111111-1111-4111-8111-111111111111', input: original }));
  await run();
  expect(mockGenerate.mock.calls[0][1]).toEqual(original);
});

it('uses pasted context without exceeding the AI input limit', () => {
  const row = makeReviewQueue('bank | A place for money. | banka | I visit the bank.', 'en', 'class').rows[0];
  expect(reviewSuggestionInput(row, 'en', 'sk')).toMatchObject({ context: 'Definition: A place for money.\nTranslation: banka\nExample: I visit the bank.' });
  expect(reviewSuggestionInput({ ...row, example: 'x'.repeat(2000) }, 'en', 'sk').context).toHaveLength(1000);
});
