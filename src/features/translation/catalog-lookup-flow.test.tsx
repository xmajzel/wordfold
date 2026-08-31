import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ImportScreen from '@/app/import';
import NewWordScreen from '@/app/word/new';
import type { CatalogSense } from '@/domain/types';

const mockCreateWord = jest.fn(async () => 'word-1');
const mockCreateWords = jest.fn(async () => ['word-1']);
const mockTranslateOnDevice = jest.fn(async (..._args: unknown[]) => 'srdce');
let mockWords: unknown[] = [];
let mockActiveCourse = {
  id: 'en-sk', sourceLanguageCode: 'en', targetLanguageCode: 'sk',
  defaultSourcePronunciationLocale: 'en-US', defaultTargetPronunciationLocale: 'sk-SK',
  capabilities: { bundledCatalog: true },
};
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
jest.mock('@/features/translation/translator', () => ({
  isOnDeviceTranslationPairSupported: (source: string, target: string) => (
    (source === 'en' || source === 'es') && target === 'sk'
  ),
  translateOnDevice: (...args: unknown[]) => mockTranslateOnDevice(...args),
  TranslationCancelledError: class TranslationCancelledError extends Error {},
}));
jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: mockWords,
    collections: [{ id: 'my-words', name: 'My words' }],
    wordCapacity: { remaining: null },
    findSenses: mockFindSenses,
    createWord: mockCreateWord,
    createWords: mockCreateWords,
    activeCourse: mockActiveCourse,
    pronunciationVoicePreference: 'device',
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockWords = [];
    mockActiveCourse = {
      id: 'en-sk', sourceLanguageCode: 'en', targetLanguageCode: 'sk',
      defaultSourcePronunciationLocale: 'en-US', defaultTargetPronunciationLocale: 'sk-SK',
      capabilities: { bundledCatalog: true },
    };
  });

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

  it('constrains new words to the active course language pair', async () => {
    const view = await render(<NewWordScreen/>);

    expect(view.getByRole('button', { name: 'Learning language: English' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Hint language: Slovak' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Learning language: Spanish' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Hint language: German' })).toBeNull();
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

  it('imports Spanish Unicode terms with active-course languages and locales', async () => {
    mockActiveCourse = {
      id: 'es-sk', sourceLanguageCode: 'es', targetLanguageCode: 'sk',
      defaultSourcePronunciationLocale: 'es-ES', defaultTargetPronunciationLocale: 'sk-SK',
      capabilities: { bundledCatalog: false },
    };
    const view = await render(<ImportScreen/>);

    await fireEvent.changeText(
      view.getByPlaceholderText(/corazón \| Órgano/),
      'Corazón | Órgano que impulsa la sangre. | srdce | Su corazón late deprisa.',
    );
    await fireEvent.press(view.getByRole('button', { name: 'Review paste' }));
    await waitFor(() => view.getByText('Hint: srdce'));
    await fireEvent.press(view.getByRole('button', { name: 'Import first 1 word' }));

    await waitFor(() => expect(mockCreateWords).toHaveBeenCalledWith([
      expect.objectContaining({
        term: 'Corazón', normalizedTerm: 'corazón', translation: 'srdce',
        definition: 'Órgano que impulsa la sangre.', example: 'Su corazón late deprisa.',
        catalogSenseId: null,
        sourceLanguageCode: 'es', targetLanguageCode: 'sk',
        sourcePronunciationLocale: 'es-ES', targetPronunciationLocale: 'sk-SK',
      }),
    ]));
  });

  it('defaults manual entry and on-device hints to the active Spanish course', async () => {
    mockActiveCourse = {
      id: 'es-sk', sourceLanguageCode: 'es', targetLanguageCode: 'sk',
      defaultSourcePronunciationLocale: 'es-ES', defaultTargetPronunciationLocale: 'sk-SK',
      capabilities: { bundledCatalog: false },
    };
    const view = await render(<NewWordScreen/>);

    expect(view.getByRole('button', { name: 'Learning language pronunciation: Spain' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Learning language pronunciation: Mexico' })).toBeNull();

    await fireEvent.changeText(view.getByLabelText('Spanish word or phrase'), 'corazón');
    await fireEvent.changeText(view.getByLabelText('Definition'), 'Órgano que impulsa la sangre.');
    await fireEvent.press(view.getByRole('button', { name: 'Generate Slovak hint on device' }));
    await waitFor(() => expect(view.getByLabelText('Slovak hint').props.value).toBe('srdce'));
    await fireEvent.press(view.getByRole('button', { name: 'Add to my words' }));

    expect(mockTranslateOnDevice).toHaveBeenCalledWith(
      'corazón',
      { sourceLanguageCode: 'es', targetLanguageCode: 'sk' },
      expect.objectContaining({ signal: expect.anything() }),
    );
    await waitFor(() => expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({
      normalizedTerm: 'corazón', translation: 'srdce',
      sourceLanguageCode: 'es', targetLanguageCode: 'sk',
      sourcePronunciationLocale: 'es-ES', targetPronunciationLocale: 'sk-SK',
    })));
  });
});
