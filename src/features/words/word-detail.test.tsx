import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import WordDetailScreen from '@/app/word/[id]';

const word = {
  id: 'word', term: 'hello', definition: 'A greeting', collectionId: 'my-words',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', sourcePronunciationLocale: 'en-US',
  targetPronunciationLocale: 'sk-SK', state: 'new', source: 'manual', createdAt: '2026-09-01',
};
let mockWords = [word];
let mockRouteId = 'word';
let mockConfirmations = 3;
let mockCollections = [{ id: 'my-words', name: 'My words' }, { id: 'c1', name: 'English C1 lessons' }];
const mockEditWord = jest.fn(async () => undefined);
const mockCreateCollection = jest.fn(async (_name: string, _color: string) => 'new-collection');
const mockRemoveWord = jest.fn();
const mockResetWord = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() }, useLocalSearchParams: () => ({ id: mockRouteId }) }));
jest.mock('@/providers/app-data-provider', () => ({ useAppData: () => ({ learningConfirmations: mockConfirmations, words: mockWords, collections: mockCollections, removeWord: mockRemoveWord, resetWord: mockResetWord, editWord: mockEditWord, createCollection: mockCreateCollection }) }));
jest.mock('@/features/feedback/feedback-link', () => ({ FeedbackLink: () => null }));
jest.mock('@/components/pronunciation-controls', () => ({ PronunciationControls: () => null }));
jest.mock('@/components/language-selector', () => ({ LanguageSelector: () => null }));
jest.mock('@/features/translation/translator', () => ({ isOnDeviceTranslationPairSupported: () => false }));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true, default: { View, createAnimatedComponent: (component: unknown) => component },
    ReduceMotion: { System: 'system' }, cancelAnimation: jest.fn(),
    useSharedValue: () => ({ set: jest.fn() }), useAnimatedStyle: () => ({}),
    withRepeat: jest.fn(), withTiming: jest.fn(), withSpring: jest.fn(),
  };
});

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.mocked(router.canGoBack).mockReturnValue(true);
  mockWords = [word];
  mockConfirmations = 3;
  mockRouteId = 'word';
  mockCollections = [{ id: 'my-words', name: 'My words' }, { id: 'c1', name: 'English C1 lessons' }];
  mockCreateCollection.mockReset();
  mockCreateCollection.mockImplementation(async (name) => {
    mockCollections = [...mockCollections, { id: 'new-collection', name }];
    return 'new-collection';
  });
  mockRemoveWord.mockReset();
  mockResetWord.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

async function confirmDeletion(view: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(view.getByRole('button', { name: 'Delete word' }));
  const buttons = jest.mocked(Alert.alert).mock.calls[0][2]!;
  await act(() => buttons.find((button) => button.text === 'Delete')!.onPress!());
}

it('returns to My words when deletion refreshes the list while reminders are still pending', async () => {
  mockRemoveWord.mockReturnValue(new Promise(() => undefined));
  const view = await render(<WordDetailScreen/>);
  await confirmDeletion(view);
  expect(mockRemoveWord).toHaveBeenCalledWith('word');
  expect(router.replace).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
  mockWords = [];
  await view.rerender(<WordDetailScreen/>);
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
  expect(view.queryByText('Word not available')).toBeNull();
});

it('opens My words after deletion when there is no previous screen', async () => {
  jest.mocked(router.canGoBack).mockReturnValue(false);
  mockRemoveWord.mockResolvedValue(undefined);
  const view = await render(<WordDetailScreen/>);
  await confirmDeletion(view);
  mockWords = [];
  await view.rerender(<WordDetailScreen/>);
  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/(tabs)/library', params: { view: 'my-words' } });
  await view.rerender(<WordDetailScreen/>);
  expect(router.replace).toHaveBeenCalledTimes(1);
});

it('keeps the word and shows an error when deletion fails', async () => {
  mockRemoveWord.mockRejectedValue(new Error('Storage unavailable'));
  const view = await render(<WordDetailScreen/>);
  await confirmDeletion(view);
  expect(Alert.alert).toHaveBeenLastCalledWith('Could not delete', 'Storage unavailable');
  expect(view.getByRole('button', { name: 'Delete word' })).toBeTruthy();
  expect(router.replace).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
});

it('does not delete or navigate when confirmation is cancelled', async () => {
  const view = await render(<WordDetailScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Delete word' }));
  const cancel = jest.mocked(Alert.alert).mock.calls[0][2]!.find((button) => button.text === 'Cancel')!;
  await act(() => cancel.onPress?.());
  expect(mockRemoveWord).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
});

it('provides a feed action for a stale word link', async () => {
  mockWords = [];
  const view = await render(<WordDetailScreen/>);
  expect(view.getByText('Word not available')).toBeTruthy();
  expect(view.getByText('This word may have been deleted from your library.')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'Open the feed' }));
  expect(router.replace).toHaveBeenCalledWith('/(tabs)');
});

it('handles a reminder failure after deletion without reporting the deletion as failed', async () => {
  let reject!: (error: Error) => void;
  mockRemoveWord.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  const view = await render(<WordDetailScreen/>);
  await confirmDeletion(view);
  mockWords = [];
  await view.rerender(<WordDetailScreen/>);
  await act(() => reject(new Error('Notifications unavailable')));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenLastCalledWith('Word deleted', expect.stringContaining('reminders could not be updated'));
});

it('still navigates if deletion refresh and a scheduling failure arrive together', async () => {
  const view = await render(<WordDetailScreen/>);
  mockRemoveWord.mockImplementation(async () => {
    mockWords = [];
    await view.rerender(<WordDetailScreen/>);
    throw new Error('Notifications unavailable');
  });
  await confirmDeletion(view);
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
  expect(view.queryByText('Word not available')).toBeNull();
  expect(Alert.alert).toHaveBeenLastCalledWith('Word deleted', expect.stringContaining('reminders could not be updated'));
});


it('selects an existing collection and applies it only on Save changes', async () => {
  const view = await render(<WordDetailScreen/>);
  expect(view.getByRole('button', { name: 'Collection: My words' }).props.accessibilityState.selected).toBe(true);
  await fireEvent.press(view.getByRole('button', { name: 'Collection: English C1 lessons' }));
  expect(mockEditWord).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Save changes' }));
  expect(mockEditWord).toHaveBeenCalledWith('word', expect.objectContaining({ collectionId: 'c1', term: 'hello' }));
});

it('preserves every edited field through the provider refresh from collection creation', async () => {
  const view = await render(<WordDetailScreen/>);
  await fireEvent.changeText(view.getByLabelText('English word or phrase'), 'greetings');
  await fireEvent.changeText(view.getByLabelText('Definition'), 'A welcome');
  await fireEvent.changeText(view.getByLabelText('Example'), 'Greetings, everyone!');
  await fireEvent.changeText(view.getByLabelText('Slovak hint'), 'pozdravy');
  await fireEvent.changeText(view.getByLabelText('Part of speech'), 'noun');
  mockCreateCollection.mockImplementationOnce(async (name) => {
    mockCollections = [...mockCollections, { id: 'new-collection', name }];
    mockWords = [{ ...word }];
    await view.rerender(<WordDetailScreen/>);
    return 'new-collection';
  });
  await fireEvent.press(view.getByRole('button', { name: 'New collection' }));
  await fireEvent.changeText(view.getByLabelText('Collection name'), '  Lesson 2  ');
  await fireEvent.press(view.getByRole('button', { name: 'Create collection' }));
  expect(mockCreateCollection).toHaveBeenCalledWith('Lesson 2', '#D8902F');
  expect(view.getByRole('button', { name: 'Collection: Lesson 2' }).props.accessibilityState.selected).toBe(true);
  expect(mockEditWord).not.toHaveBeenCalled();
  // A later refresh must not restore the old collection or overwrite the draft either.
  mockWords = [{ ...word }];
  await view.rerender(<WordDetailScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Save changes' }));
  expect(mockEditWord).toHaveBeenCalledWith('word', expect.objectContaining({
    collectionId: 'new-collection', term: 'greetings', definition: 'A welcome',
    example: 'Greetings, everyone!', translation: 'pozdravy', partOfSpeech: 'noun',
  }));
});

it('rejects blank names and cancels creation without changing the selection or draft', async () => {
  const view = await render(<WordDetailScreen/>);
  await fireEvent.changeText(view.getByLabelText('Definition'), 'Edited greeting');
  await fireEvent.press(view.getByRole('button', { name: 'New collection' }));
  await fireEvent.changeText(view.getByLabelText('Collection name'), '   ');
  await fireEvent(view.getByLabelText('Collection name'), 'submitEditing');
  expect(mockCreateCollection).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Save changes' }));
  expect(mockEditWord).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Cancel new collection' }));
  await fireEvent.press(view.getByRole('button', { name: 'Save changes' }));
  expect(mockEditWord).toHaveBeenCalledWith('word', expect.objectContaining({ collectionId: 'my-words', definition: 'Edited greeting' }));
});

it('retains edits and the collection name on failure and allows retry', async () => {
  mockCreateCollection.mockRejectedValueOnce(new Error('Storage unavailable'));
  const view = await render(<WordDetailScreen/>);
  await fireEvent.changeText(view.getByLabelText('Definition'), 'Edited greeting');
  await fireEvent.press(view.getByRole('button', { name: 'New collection' }));
  await fireEvent.changeText(view.getByLabelText('Collection name'), 'Lesson 3');
  await fireEvent.press(view.getByRole('button', { name: 'Create collection' }));
  expect(Alert.alert).toHaveBeenLastCalledWith('Could not create collection', 'Storage unavailable');
  expect(view.getByLabelText('Collection name').props.value).toBe('Lesson 3');
  expect(view.getByLabelText('Definition').props.value).toBe('Edited greeting');
  await fireEvent.press(view.getByRole('button', { name: 'Create collection' }));
  await fireEvent.press(view.getByRole('button', { name: 'Save changes' }));
  expect(mockEditWord).toHaveBeenCalledWith('word', expect.objectContaining({ collectionId: 'new-collection', definition: 'Edited greeting' }));
});

it('blocks duplicate creation, saving and deletion while creation is pending', async () => {
  let finish!: (id: string) => void;
  mockCreateCollection.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
  const view = await render(<WordDetailScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'New collection' }));
  await fireEvent.changeText(view.getByLabelText('Collection name'), 'Lesson 4');
  await fireEvent(view.getByLabelText('Collection name'), 'submitEditing');
  await fireEvent(view.getByLabelText('Collection name'), 'submitEditing');
  await fireEvent.press(view.getByRole('button', { name: 'Save changes' }));
  await fireEvent.press(view.getByRole('button', { name: 'Delete word' }));
  expect(mockCreateCollection).toHaveBeenCalledTimes(1);
  expect(mockEditWord).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => finish('c1'));
  await fireEvent.press(view.getByRole('button', { name: 'Save changes' }));
  expect(mockEditWord).toHaveBeenCalledWith('word', expect.objectContaining({ collectionId: 'c1' }));
});

it('loads the new word draft when the route changes', async () => {
  const view = await render(<WordDetailScreen/>);
  await fireEvent.changeText(view.getByLabelText('Definition'), 'Unsaved edit');
  await fireEvent.press(view.getByRole('button', { name: 'New collection' }));
  mockRouteId = 'second';
  mockWords = [word, { ...word, id: 'second', term: 'goodbye', definition: 'A farewell', collectionId: 'c1' }];
  await view.rerender(<WordDetailScreen/>);
  expect(view.getByLabelText('Definition').props.value).toBe('A farewell');
  expect(view.getByRole('button', { name: 'Collection: English C1 lessons' }).props.accessibilityState.selected).toBe(true);
  expect(view.queryByLabelText('Collection name')).toBeNull();
});


it('keeps the word draft and exposes only the open form after rapid toggling', async () => {
  const view = await render(<WordDetailScreen/>);
  await fireEvent.changeText(view.getByLabelText('Definition'), 'Unsaved greeting');
  for (let i = 0; i < 3; i += 1) {
    await fireEvent.press(view.getByRole('button', { name: 'New collection' }));
    expect(view.getByLabelText('Collection name')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Cancel new collection' }));
    expect(view.queryByLabelText('Collection name')).toBeNull();
  }
  await fireEvent.press(view.getByRole('button', { name: 'New collection' }));
  await fireEvent.changeText(view.getByLabelText('Collection name'), 'Latest lesson');
  await fireEvent.press(view.getByRole('button', { name: 'Create collection' }));
  expect(view.queryByLabelText('Collection name')).toBeNull();
  expect(view.getByLabelText('Definition').props.value).toBe('Unsaved greeting');
  expect(mockCreateCollection).toHaveBeenCalledTimes(1);
});

it('restarts a stopped word without losing unsaved edits', async () => {
  mockWords = [{ ...word, state: 'learned' }];
  mockResetWord.mockResolvedValue(undefined);
  const view = await render(<WordDetailScreen/>);
  await fireEvent.changeText(view.getByDisplayValue('A greeting'), 'An edited greeting');
  await fireEvent.press(view.getByRole('button', { name: 'Learn again' }));
  expect(mockResetWord).toHaveBeenCalledWith('word');
  mockWords = [{ ...word, state: 'cannot_remember' }];
  await view.rerender(<WordDetailScreen/>);
  expect(view.getByText('Added to today’s practice.')).toBeTruthy();
  expect(view.getByDisplayValue('An edited greeting')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Learn again' })).toBeNull();
  expect(mockEditWord).not.toHaveBeenCalled();
});

it('prevents duplicate restarts while saving', async () => {
  mockWords = [{ ...word, state: 'learned' }];
  let finish!: () => void;
  mockResetWord.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  const view = await render(<WordDetailScreen/>);
  const button = view.getByRole('button', { name: 'Learn again' });
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(mockResetWord).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});

it('keeps restart available after a failure', async () => {
  mockWords = [{ ...word, state: 'learned' }];
  mockResetWord.mockRejectedValue(new Error('Storage unavailable'));
  const view = await render(<WordDetailScreen/>);
  await fireEvent.press(view.getByRole('button', { name: 'Learn again' }));
  expect(Alert.alert).toHaveBeenLastCalledWith('Could not restart learning', 'Storage unavailable');
  expect(view.queryByText('Added to today’s practice.')).toBeNull();
  expect(view.getByRole('button', { name: 'Learn again' })).toBeTruthy();
});

it('does not offer to restart an active word', async () => {
  const view = await render(<WordDetailScreen/>);
  expect(view.queryByRole('button', { name: 'Learn again' })).toBeNull();
});

it('shows remaining confirmations using the selected rhythm', async () => {
  mockConfirmations = 2;
  const view = await render(<WordDetailScreen/>);
  expect(view.getByText('0 of 2 confirmations')).toBeTruthy();
  expect(view.getByText('2 more “I know this” confirmations to mark as learned.')).toBeTruthy();
  mockConfirmations = 1;
  await view.rerender(<WordDetailScreen/>);
  expect(view.queryByRole('progressbar')).toBeNull();
});
