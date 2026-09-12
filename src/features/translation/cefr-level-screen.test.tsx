import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import CefrLevelScreen from '@/app/level/[level]';
import type { CefrCatalogEntry, CefrLevel } from '@/domain/types';

const mockCreateWord = jest.fn(async () => 'word-1');
let mockSpanishCourse = false;
let mockMemberSearch = false;
let mockLevelState: 'available' | 'not-yet-available' | 'unsupported-by-source' = 'available';
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

jest.mock('@/data/course-catalog', () => ({
  getCourseCatalogLevelState: () => mockLevelState,
  getCourseCatalogEntriesForNormalizedTerm: (_courseId: string, normalizedTerm: string) => normalizedTerm === 'fotografía' ? [{
    ...mockEntry,
    id: 'es-cefr:fotografia', catalogSenseId: 'es-sk:a1:i57211',
    term: 'fotografía', normalizedTerm: 'fotografía', translation: 'fotografia',
    definition: 'Imagen obtenida con una cámara.', example: 'Miro una fotografía.',
    courseId: 'es-sk', sourceLanguageCode: 'es', targetLanguageCode: 'sk', level: 'A1',
    publicationStatus: 'production', learnerContentReviewStatus: 'approved', hintReviewStatus: 'approved',
    levelEvidence: 'ELELex A1 level assignment', alternativeTerms: ['foto'],
  }] : [],
  getCourseCatalogEntries: () => [{
    ...mockEntry,
    courseId: 'en-sk', sourceLanguageCode: 'en', targetLanguageCode: 'sk',
    publicationStatus: 'production', learnerContentReviewStatus: 'approved',
    hintReviewStatus: 'approved', levelEvidence: 'cefr-j:1.6',
    ...(mockSpanishCourse ? mockMemberSearch ? {
      id: 'es-cefr:foto', catalogSenseId: 'es-sk:a1:i57211',
      term: 'foto', normalizedTerm: 'foto', translation: 'fotka',
      definition: 'Imagen obtenida con una cámara.', example: 'Miro una foto.',
      courseId: 'es-sk', sourceLanguageCode: 'es', targetLanguageCode: 'sk',
      level: mockLevel, publicationStatus: 'production', alternativeTerms: ['fotografía'],
    } : {
      id: 'es-cefr:cabeza', catalogSenseId: 'es-sk:a1:i66025',
      term: 'cabeza', normalizedTerm: 'cabeza', translation: 'hlava',
      definition: 'Parte superior del cuerpo.', example: 'Me duele la cabeza.',
      courseId: 'es-sk', sourceLanguageCode: 'es', targetLanguageCode: 'sk',
      level: mockLevel, gender: 'feminine', publicationStatus: 'production',
    } : {}),
  }],
}));

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    words: [],
    activeCourseId: mockSpanishCourse ? 'es-sk' : 'en-sk',
    activeCourse: {
      sourceLanguageCode: mockSpanishCourse ? 'es' : 'en', targetLanguageCode: 'sk',
      defaultSourcePronunciationLocale: mockSpanishCourse ? 'es-ES' : 'en-US', defaultTargetPronunciationLocale: 'sk-SK',
    },
    collections: [{ id: 'my-words', name: 'My words' }],
    pronunciationVoicePreference: 'device',
    createWord: mockCreateWord,
  }),
}));

describe('CEFR catalog word translation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 390, height: 844, scale: 1, fontScale: 1 });
    mockSpanishCourse = false;
    mockMemberSearch = false;
    mockLevelState = 'available';
    mockLevel = 'A1';
  });

  afterEach(() => jest.restoreAllMocks());

  it('uses a compact complete pair at 320px and 2x font scale while retaining the full accessible meaning', async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 320, height: 640, scale: 1, fontScale: 2 });
    const view = await render(<CefrLevelScreen/>);
    view.getByText('0 Not started');
    expect(view.queryByText('0 Added, not started')).toBeNull();
    view.getByLabelText('0 known, 0 learning, 0 added but not started, 1 not added, out of 1 words');
  });

  it('saves the bundled Slovak translation when adding the word', async () => {
    const view = await render(<CefrLevelScreen/>);

    view.getByText('Your progress');
    view.getByText('0 of 1 known');
    view.getByText('0 Known');
    view.getByText('0 Learning');
    view.getByText('0 Added, not started');
    view.getByText('1 Not added');
    await fireEvent.press(view.getByRole('button', { name: 'Add to My words' }));

    await waitFor(() => expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({
      term: 'scope',
      translation: 'rozsah',
    })));
  });

  it('displays production Spanish A1 and adds its Spanish identity, hint and locale', async () => {
    mockSpanishCourse = true;
    const view = await render(<CefrLevelScreen/>);
    view.getByText('cabeza');
    view.getByText('Slovak hint: hlava');
    view.getByText('Gender: feminine');
    await fireEvent.press(view.getByRole('button', { name: 'Add to My words' }));
    await waitFor(() => expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({
      term: 'cabeza', definition: 'Parte superior del cuerpo.', translation: 'hlava',
      catalogSenseId: 'es-sk:a1:i66025', cefrLevel: 'A1',
      sourceLanguageCode: 'es', targetLanguageCode: 'sk',
      sourcePronunciationLocale: 'es-ES', targetPronunciationLocale: 'sk-SK',
    })));
  });

  it('searches a secondary member term and adds that member presentation', async () => {
    mockSpanishCourse = true;
    mockMemberSearch = true;
    const view = await render(<CefrLevelScreen/>);
    await fireEvent.changeText(view.getByPlaceholderText('Word or meaning'), 'fotografía');
    view.getByText('fotografía');
    view.getByText('Slovak hint: fotografia');
    await fireEvent.press(view.getByRole('button', { name: 'Add to My words' }));
    await waitFor(() => expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({
      term: 'fotografía', translation: 'fotografia', catalogSenseId: 'es-sk:a1:i57211',
    })));
  });

  it.each([
    ['A2', 'not-yet-available', 'Level not yet available'],
    ['C2', 'unsupported-by-source', 'Level unsupported by the current source'],
  ] as const)('blocks Spanish %s with an explicit availability reason', async (level, state, title) => {
    mockSpanishCourse = true;
    mockLevel = level;
    mockLevelState = state;
    const view = await render(<CefrLevelScreen/>);
    view.getByText(title);
    expect(view.queryByPlaceholderText('Word or meaning')).toBeNull();
    expect(view.queryByRole('button', { name: 'Add to My words' })).toBeNull();
  });
});
