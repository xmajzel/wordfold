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
});
