import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

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

  it('does not resolve an English catalog sense while Spanish is active', async () => {
    const view = await render(<AppDataProvider><SpanishLookupProbe/></AppDataProvider>);

    await fireEvent.press(view.getByRole('button', { name: 'Choose Spanish lookup' }));
    await waitFor(() => view.getByText('es-sk'));
    await fireEvent.press(view.getByRole('button', { name: 'Find Spanish bank' }));

    await waitFor(() => expect(mockFound).toHaveBeenCalledWith([]));
  });
});
