import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import CefrLevelScreen from '@/app/level/[level]';
import type { CefrCatalogEntry } from '@/domain/types';

const mockCreateWord = jest.fn(async () => 'word-1');
const mockTranslateEnglishToSlovak = jest.fn(async (_text: string) => 'rozsah');
const mockEntry: CefrCatalogEntry = {
  id: 'a1:00023271-n:scope',
  term: 'scope',
  normalizedTerm: 'scope',
  level: 'A1',
  partOfSpeech: 'noun',
  definition: 'The extent of something.',
  example: 'The project has a clear scope.',
  catalogSenseId: '00023271-n:scope',
  source: 'cefr-j',
  sourceVersion: '1.6',
  sourcePartOfSpeech: ['noun'],
};

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ level: 'A1' }),
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

jest.mock('@/data/cefr-catalog', () => ({
  getCefrEntries: () => [mockEntry],
}));

jest.mock('@/features/translation/translator', () => ({
  translateEnglishToSlovak: (text: string) => mockTranslateEnglishToSlovak(text),
}));

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: [],
    collections: [{ id: 'my-words', name: 'My words' }],
    createWord: mockCreateWord,
  }),
}));

describe('CEFR catalog word translation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTranslateEnglishToSlovak.mockResolvedValue('rozsah');
  });

  afterEach(() => jest.restoreAllMocks());

  it('generates and saves a Slovak translation before adding the word', async () => {
    const view = await render(<CefrLevelScreen/>);

    await fireEvent.press(view.getByRole('button', { name: 'Add to My words' }));

    await waitFor(() => expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({
      term: 'scope',
      translation: 'rozsah',
    })));
    expect(mockTranslateEnglishToSlovak).toHaveBeenCalledWith('scope');
  });

  it('keeps the Add action disabled while translation is in progress', async () => {
    let resolveTranslation!: (value: string) => void;
    mockTranslateEnglishToSlovak.mockImplementationOnce(() => new Promise((resolve) => {
      resolveTranslation = resolve;
    }));
    const view = await render(<CefrLevelScreen/>);

    await fireEvent.press(view.getByRole('button', { name: 'Add to My words' }));

    await waitFor(() => expect(view.getByRole('button', { name: 'Add to My words' })).toBeDisabled());
    expect(mockCreateWord).not.toHaveBeenCalled();
    await act(async () => resolveTranslation('rozsah'));
    await waitFor(() => expect(mockCreateWord).toHaveBeenCalled());
  });

  it('does not add the word when translation fails', async () => {
    mockTranslateEnglishToSlovak.mockRejectedValueOnce(new Error('Wi-Fi is required.'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<CefrLevelScreen/>);

    await fireEvent.press(view.getByRole('button', { name: 'Add to My words' }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'Translation is not available',
      expect.stringContaining('The word was not added.'),
    ));
    expect(mockCreateWord).not.toHaveBeenCalled();
  });
});
