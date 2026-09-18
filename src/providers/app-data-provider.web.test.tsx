import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { getCourseCatalogEntry } from '@/data/course-catalog';
import { calculateCefrProgress } from '@/features/learning/cefr-progress';
import { buildRecommendations } from '@/features/recommendations/selector';

import { AppDataProvider, useAppData } from './app-data-provider.web';

const mockFound = jest.fn();

jest.mock('@/data/cefr-catalog', () => ({
  getCefrEntryForNormalizedTerm: (normalizedTerm: string) => normalizedTerm === 'bank' ? {
    id: 'a1:legacy-sense',
    term: 'bank',
    normalizedTerm: 'bank',
    level: 'A1',
    partOfSpeech: 'noun',
    definition: "A business that keeps, lends, and manages people's money.",
    example: 'I need to visit the bank before it closes.',
    translation: 'banka',
    catalogSenseId: 'legacy-sense',
    source: 'cefr-j',
    sourceVersion: '1.6',
    sourcePartOfSpeech: ['noun'],
  } : null,
}));

function LookupProbe() {
  const { findSenses } = useAppData();
  return <Pressable accessibilityRole="button" onPress={() => void findSenses('bank').then(mockFound)}>
    <Text>Find bank</Text>
  </Pressable>;
}

function CapacityProbe() {
  const { wordCapacity } = useAppData();
  return <Text>{wordCapacity.remaining} free word slots</Text>;
}

function CourseProbe() {
  const { activeCourseId, learningFilter, switchActiveCourse, updateLearningFilter } = useAppData();
  return <>
    <Text>{`${activeCourseId}:${learningFilter}`}</Text>
    <Pressable accessibilityRole="button" onPress={() => void updateLearningFilter('collection:lessons')}><Text>Choose lessons</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => void switchActiveCourse('en-sk')}><Text>Choose English</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => void switchActiveCourse('es-sk')}>
      <Text>Choose Spanish</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={() => void updateLearningFilter('A2')}>
      <Text>Choose A2</Text>
    </Pressable>
  </>;
}

function SpanishLookupProbe() {
  const { activeCourseId, findSenses, switchActiveCourse } = useAppData();
  return <>
    <Text>{activeCourseId}</Text>
    <Pressable accessibilityRole="button" onPress={() => void switchActiveCourse('es-sk')}>
      <Text>Choose Spanish lookup</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={() => void findSenses('bank').then(mockFound)}>
      <Text>Find Spanish bank</Text>
    </Pressable>
  </>;
}

const mockSavedWords = jest.fn();
const starterPreview = buildRecommendations({ levels: ['A1'], topics: ['spoken'] }, [], 10, 'es-sk', () => 0.2);
const nextPreview = buildRecommendations({ levels: ['A1'], topics: ['spoken'] }, starterPreview.map(({ entry }) => entry.normalizedTerm), 10, 'es-sk', () => 0.3);
function StarterProbe() {
  const { activeCourseId, words, switchActiveCourse, completePersonalizedOnboarding, addRecommendedWords, rateWord } = useAppData();
  mockSavedWords(words);
  return <>
    <Text>{`${activeCourseId}:${words.length}`}</Text>
    <Pressable onPress={() => void switchActiveCourse('es-sk')}><Text>Spanish starter</Text></Pressable>
    <Pressable onPress={() => void completePersonalizedOnboarding({ levels: ['A1'], topics: ['spoken'] }, 'device', starterPreview)}><Text>Create starter</Text></Pressable>
    <Pressable onPress={() => void addRecommendedWords(10, words.some((word) => word.cefrLevel === 'C2') ? undefined : nextPreview)}><Text>Next batch</Text></Pressable>
    <Pressable onPress={() => void completePersonalizedOnboarding({ levels: ['C2'], topics: ['academic'] }, 'device')}><Text>Create C2 starter</Text></Pressable>
    <Pressable onPress={() => void rateWord(words[0], 'learned')}><Text>Learn first word</Text></Pressable>
  </>;
}

describe('web app data provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: jest.fn(() => null), setItem: jest.fn() },
    });
  });

  it('returns the reviewed English meaning and Slovak hint together', async () => {
    const view = await render(<AppDataProvider><LookupProbe/></AppDataProvider>);

    await fireEvent.press(view.getByRole('button', { name: 'Find bank' }));

    await waitFor(() => expect(mockFound).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'legacy-sense',
        definition: "A business that keeps, lends, and manages people's money.",
        translation: 'banka',
      }),
    ]));
  });

  it('exposes free word capacity on web', async () => {
    const view = await render(<AppDataProvider><CapacityProbe/></AppDataProvider>);

    view.getByText('100 free word slots');
  });

  it('persists active course and settings under course-specific web keys', async () => {
    const view = await render(<AppDataProvider><CourseProbe/></AppDataProvider>);

    await fireEvent.press(view.getByRole('button', { name: 'Choose Spanish' }));
    await waitFor(() => view.getByText('es-sk:all'));
    await fireEvent.press(view.getByRole('button', { name: 'Choose A2' }));
    await waitFor(() => view.getByText('es-sk:A2'));

    expect(window.localStorage.setItem).toHaveBeenCalledWith('wordfold.activeCourseId', 'es-sk');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('wordfold.learningFilter.es-sk', 'A2');
  });

  it('restores collection filters across remounts and course switches', async () => {
    const storage = new Map<string, string>();
    jest.mocked(window.localStorage.getItem).mockImplementation((key) => storage.get(key) ?? null);
    jest.mocked(window.localStorage.setItem).mockImplementation((key, value) => { storage.set(key, value); });
    const view = await render(<AppDataProvider><CourseProbe/></AppDataProvider>);
    await fireEvent.press(view.getByText('Choose lessons'));
    view.getByText('en-sk:collection:lessons');
    await fireEvent.press(view.getByText('Choose Spanish'));
    view.getByText('es-sk:all');
    await fireEvent.press(view.getByText('Choose A2'));
    await fireEvent.press(view.getByText('Choose English'));
    view.getByText('en-sk:collection:lessons');
    await view.unmount();
    const reopened = await render(<AppDataProvider><CourseProbe/></AppDataProvider>);
    await waitFor(() => reopened.getByText('en-sk:collection:lessons'));
  });

  it('does not resolve an English catalog sense while Spanish is active', async () => {
    const view = await render(<AppDataProvider><SpanishLookupProbe/></AppDataProvider>);

    await fireEvent.press(view.getByRole('button', { name: 'Choose Spanish lookup' }));
    await waitFor(() => view.getByText('es-sk'));
    await fireEvent.press(view.getByRole('button', { name: 'Find Spanish bank' }));

    await waitFor(() => expect(mockFound).toHaveBeenCalledWith([]));
  });
  it('saves the Spanish preview with Spanish metadata and adds a distinct next batch', async () => {
    const view = await render(<AppDataProvider><StarterProbe/></AppDataProvider>);
    await fireEvent.press(view.getByText('Spanish starter'));
    await waitFor(() => view.getByText('es-sk:0'));
    await fireEvent.press(view.getByText('Create starter'));
    await waitFor(() => view.getByText('es-sk:10'));
    const first = mockSavedWords.mock.calls.at(-1)![0];
    const preview = starterPreview;
    expect(first.map((word: { catalogSenseId: string }) => word.catalogSenseId)).toEqual(preview.map(({ entry }) => entry.catalogSenseId));
    expect(first).toEqual(expect.arrayContaining([expect.objectContaining({ sourceLanguageCode: 'es', targetLanguageCode: 'sk', sourcePronunciationLocale: 'es-ES' })]));
    await fireEvent.press(view.getByText('Next batch'));
    await waitFor(() => view.getByText('es-sk:20'));
    const all = mockSavedWords.mock.calls.at(-1)![0];
    expect(new Set(all.map((word: { catalogSenseId: string }) => word.catalogSenseId)).size).toBe(20);
    expect(all.slice(0, 10).map((word: { catalogSenseId: string }) => word.catalogSenseId)).toEqual(nextPreview.map(({ entry }) => entry.catalogSenseId));
  });

  it('adds and studies C2 with exact reviewed hints while preserving existing A1 progress', async () => {
    const view = await render(<AppDataProvider><StarterProbe/></AppDataProvider>);
    await fireEvent.press(view.getByText('Spanish starter'));
    await waitFor(() => view.getByText('es-sk:0'));
    await fireEvent.press(view.getByText('Create starter'));
    await waitFor(() => view.getByText('es-sk:10'));
    await fireEvent.press(view.getByText('Learn first word'));
    await waitFor(() => expect(mockSavedWords.mock.calls.at(-1)![0][0]).toMatchObject({ state: 'understood', knownStreak: 1 }));
    const previous = mockSavedWords.mock.calls.at(-1)![0];
    await fireEvent.press(view.getByText('Create C2 starter'));
    await waitFor(() => view.getByText('es-sk:20'));
    const all = mockSavedWords.mock.calls.at(-1)![0];
    expect(all.filter((word: { cefrLevel: string }) => word.cefrLevel === 'A1')).toEqual(previous);
    const c2 = all.filter((word: { cefrLevel: string }) => word.cefrLevel === 'C2');
    expect(c2).toHaveLength(10);
    for (const word of c2) {
      expect(getCourseCatalogEntry('es-sk', word.catalogSenseId)).toMatchObject({
        definition: word.definition, example: word.example, translation: word.translation, level: 'C2',
      });
    }
    await fireEvent.press(view.getByText('Learn first word'));
    await waitFor(() => expect(mockSavedWords.mock.calls.at(-1)![0][0]).toMatchObject({ state: 'understood', knownStreak: 1 }));
    const studied = mockSavedWords.mock.calls.at(-1)![0];
    expect(calculateCefrProgress(c2, studied).known).toBe(0);
    await fireEvent.press(view.getByText('Next batch'));
    await waitFor(() => view.getByText('es-sk:30'));
    expect(new Set(mockSavedWords.mock.calls.at(-1)![0].map((word: { catalogSenseId: string }) => word.catalogSenseId)).size).toBe(30);
  });

});

function RestoredRhythmProbe() {
  const { onboardingComplete, learningConfirmations, rhythmIntroduced } = useAppData();
  return <Text>{onboardingComplete === null ? 'Loading preferences' : `Ready: ${learningConfirmations}:${rhythmIntroduced}`}</Text>;
}

it('restores the device rhythm before releasing the app readiness gate', async () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: jest.fn((key: string) => key === 'wordfold.learningRhythm' ? '{"confirmations":2,"introVersion":1}' : null), setItem: jest.fn() },
  });
  const view = await render(<AppDataProvider><RestoredRhythmProbe/></AppDataProvider>);
  await waitFor(() => expect(view.getByText('Ready: 2:true')).toBeTruthy());
});
