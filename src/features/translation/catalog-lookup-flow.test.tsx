import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ImportScreen from '@/app/import';
import NewWordScreen from '@/app/word/new';
import type { CatalogSense } from '@/domain/types';

const mockCreateWord = jest.fn(async () => 'word-1');
const mockCreateWords = jest.fn(async () => ['word-1']);
const mockFindSenses = jest.fn(async (): Promise<CatalogSense[]> => [{
  id: 'legacy-sense',
  term: 'bank',
  partOfSpeech: 'noun',
  definition: "A business that keeps, lends, and manages people's money.",
  example: 'I need to visit the bank before it closes.',
  translation: 'banka',
  rank: -101,
}]);

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/features/translation/translator', () => ({ translateEnglishToSlovak: jest.fn() }));
jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: [],
    collections: [{ id: 'my-words', name: 'My words' }],
    wordCapacity: { remaining: null },
    findSenses: mockFindSenses,
    createWord: mockCreateWord,
    createWords: mockCreateWords,
  }),
}));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (Component: unknown) => Component },
    ReduceMotion: { System: 'system' },
    cancelAnimation: jest.fn(),
    interpolate: (_value: number, _input: number[], output: number[]) => output[0],
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: unknown) => ({ value, set(next: unknown) { this.value = next; } }),
    withRepeat: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

describe('catalog Slovak lookup flows', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves the reviewed Slovak hint after selecting an offline definition', async () => {
    const view = await render(<NewWordScreen/>);

    await fireEvent.changeText(view.getByLabelText('English word or phrase'), 'bank');
    await fireEvent.press(view.getByRole('button', { name: 'Find definition offline' }));
    await waitFor(() => expect(view.getByLabelText('Slovak hint').props.value).toBe('banka'));
    await fireEvent.press(view.getByRole('button', { name: 'Add to my words' }));

    await waitFor(() => expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({
      catalogSenseId: 'legacy-sense',
      definition: "A business that keeps, lends, and manages people's money.",
      translation: 'banka',
    })));
  });

  it('does not put a Slovak catalog hint into another target language', async () => {
    const view = await render(<NewWordScreen/>);

    await fireEvent.press(view.getByRole('button', { name: 'Hint language: German' }));
    await fireEvent.changeText(view.getByLabelText('English word or phrase'), 'bank');
    await fireEvent.press(view.getByRole('button', { name: 'Find definition offline' }));

    await waitFor(() => expect(mockFindSenses).toHaveBeenCalledWith('bank'));
    expect(view.getByLabelText('German hint').props.value).toBe('');
  });

  it('uses the reviewed Slovak hint for an import that did not provide one', async () => {
    const view = await render(<ImportScreen/>);

    await fireEvent.changeText(view.getByPlaceholderText(/stakeholder -/), 'bank');
    await fireEvent.press(view.getByRole('button', { name: 'Review paste' }));
    await waitFor(() => view.getByText('Hint: banka'));
    await fireEvent.press(view.getByRole('button', { name: 'Import first 1 word' }));

    await waitFor(() => expect(mockCreateWords).toHaveBeenCalledWith([
      expect.objectContaining({ translation: 'banka' }),
    ]));
  });

  it('keeps an explicitly pasted Slovak hint authoritative', async () => {
    const view = await render(<ImportScreen/>);

    await fireEvent.changeText(view.getByPlaceholderText(/stakeholder -/), 'bank - vlastný preklad');
    await fireEvent.press(view.getByRole('button', { name: 'Review paste' }));
    await waitFor(() => view.getByText('Hint: vlastný preklad'));
    await fireEvent.press(view.getByRole('button', { name: 'Import first 1 word' }));

    await waitFor(() => expect(mockCreateWords).toHaveBeenCalledWith([
      expect.objectContaining({ translation: 'vlastný preklad' }),
    ]));
  });
});
