import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CefrLevelScreen from '@/app/level/[level]';
import type { CefrCatalogEntry, CefrLevel } from '@/domain/types';

const mockCreateWord = jest.fn(async () => 'word-1');
let mockSpanishPreview = false;
let mockLevel: CefrLevel = 'A1';
const mockEntry: CefrCatalogEntry = {
  id: 'a1:00023271-n:scope',
  term: 'scope',
  normalizedTerm: 'scope',
  level: 'A1',
  partOfSpeech: 'noun',
  definition: 'The extent of something.',
  example: 'The project has a clear scope.',
  translation: 'rozsah',
  catalogSenseId: '00023271-n:scope',
  source: 'cefr-j',
  sourceVersion: '1.6',
  sourcePartOfSpeech: ['noun'],
};

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ level: mockLevel }),
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

jest.mock('@/domain/spanish-preview', () => ({
  get spanishA1PreviewEnabled() { return mockSpanishPreview; },
}));

jest.mock('@/data/course-catalog', () => ({
  getCourseCatalogAvailability: () => ({ isPreview: mockSpanishPreview }),
  getCourseCatalogEntries: () => [{
    ...mockEntry,
    courseId: 'en-sk', sourceLanguageCode: 'en', targetLanguageCode: 'sk',
    publicationStatus: 'production', learnerContentReviewStatus: 'approved',
    hintReviewStatus: 'approved', levelEvidence: 'cefr-j:1.6',
    ...(mockSpanishPreview ? {
      id: 'es-sk:a1:001-cabeza', catalogSenseId: 'es-sk:a1:001-cabeza:noun:1',
      term: 'cabeza', normalizedTerm: 'cabeza', translation: 'hlava',
      definition: 'Parte superior del cuerpo.', example: 'Me duele la cabeza.',
      courseId: 'es-sk', sourceLanguageCode: 'es', targetLanguageCode: 'sk',
      level: mockLevel, gender: 'feminine', publicationStatus: 'draft',
    } : {}),
  }],
}));

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: [],
    activeCourseId: mockSpanishPreview ? 'es-sk' : 'en-sk',
    activeCourse: {
      sourceLanguageCode: mockSpanishPreview ? 'es' : 'en', targetLanguageCode: 'sk',
      defaultSourcePronunciationLocale: mockSpanishPreview ? 'es-ES' : 'en-US', defaultTargetPronunciationLocale: 'sk-SK',
    },
    collections: [{ id: 'my-words', name: 'My words' }],
    pronunciationVoicePreference: 'device',
    createWord: mockCreateWord,
  }),
}));

describe('CEFR catalog word translation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSpanishPreview = false;
    mockLevel = 'A1';
  });

  afterEach(() => jest.restoreAllMocks());

  it('saves the bundled Slovak translation when adding the word', async () => {
    const view = await render(<CefrLevelScreen/>);

    view.getByText('Your progress');
    view.getByText('0 of 1 known');
    view.getByText('1', { exact: true });
    view.getByText('Not added');
    await fireEvent.press(view.getByRole('button', { name: 'Add to My words' }));

    await waitFor(() => expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({
      term: 'scope',
      translation: 'rozsah',
    })));
  });

  it('displays the local Spanish preview and adds its Spanish identity, hint and device locale', async () => {
    mockSpanishPreview = true;
    const view = await render(<CefrLevelScreen/>);
    view.getByTestId('spanish-preview-notice');
    view.getByText('cabeza');
    view.getByText('Slovak hint: hlava');
    view.getByText('Gender: feminine');
    await fireEvent.press(view.getByRole('button', { name: 'Add to My words' }));
    await waitFor(() => expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({
      term: 'cabeza', definition: 'Parte superior del cuerpo.', translation: 'hlava',
      catalogSenseId: 'es-sk:a1:001-cabeza:noun:1', cefrLevel: 'A1',
      sourceLanguageCode: 'es', targetLanguageCode: 'sk',
      sourcePronunciationLocale: 'es-ES', targetPronunciationLocale: 'sk-SK',
    })));
  });

  it.each(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const)('keeps Spanish search/add identity and device locale at %s', async (level) => {
    mockSpanishPreview = true;
    mockLevel = level;
    const view = await render(<CefrLevelScreen/>);
    await fireEvent.changeText(view.getByPlaceholderText('Word or meaning'), 'missing word');
    expect(view.queryByRole('button', { name: 'Add to My words' })).toBeNull();
    await fireEvent.changeText(view.getByPlaceholderText('Word or meaning'), 'cabeza');
    view.getByText('Slovak hint: hlava');
    await fireEvent.press(view.getByRole('button', { name: 'Add to My words' }));
    await waitFor(() => expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({
      cefrLevel: level, translation: 'hlava', sourceLanguageCode: 'es', targetLanguageCode: 'sk',
      sourcePronunciationLocale: 'es-ES', targetPronunciationLocale: 'sk-SK',
    })));
  });
});
