import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CefrLevelScreen from '@/app/level/[level]';
import type { CefrCatalogEntry } from '@/domain/types';

const mockCreateWord = jest.fn(async () => 'word-1');
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
  });

  afterEach(() => jest.restoreAllMocks());

  it('saves the bundled Slovak translation when adding the word', async () => {
    const view = await render(<CefrLevelScreen/>);

    await fireEvent.press(view.getByRole('button', { name: 'Add to My words' }));

    await waitFor(() => expect(mockCreateWord).toHaveBeenCalledWith(expect.objectContaining({
      term: 'scope',
      translation: 'rozsah',
    })));
  });
});
