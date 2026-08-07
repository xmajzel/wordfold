import { getCefrEntryForNormalizedTerm } from './cefr-catalog';
import { lookupSenses } from './catalog';

jest.mock('./cefr-catalog', () => ({
  getCefrEntryForNormalizedTerm: jest.fn(),
}));

const mockedGetCefrEntry = getCefrEntryForNormalizedTerm as jest.MockedFunction<typeof getCefrEntryForNormalizedTerm>;

describe('catalog lookup', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: index === 2 ? 'legacy-sense' : `sense-${index}`,
    term: 'bank',
    part_of_speech: 'n',
    definition: `Definition ${index}`,
    example: null,
    rank: index,
  }));
  const database = { getAllAsync: jest.fn(async () => rows) };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('places the learner meaning first without changing its catalog identity', async () => {
    mockedGetCefrEntry.mockReturnValue({
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
    });

    const senses = await lookupSenses(database as never, ' Bank ');

    expect(database.getAllAsync).toHaveBeenCalledWith(expect.any(String), 'bank');
    expect(senses).toHaveLength(12);
    expect(senses[0]).toEqual(expect.objectContaining({
      id: 'legacy-sense',
      definition: "A business that keeps, lends, and manages people's money.",
      rank: -101,
    }));
    expect(senses.slice(1).some((sense) => sense.id === 'legacy-sense')).toBe(false);
    expect(senses[1].id).toBe('sense-0');
  });

  it('keeps the WordNet order for terms outside the CEFR catalog', async () => {
    mockedGetCefrEntry.mockReturnValue(null);

    const senses = await lookupSenses(database as never, 'bank');

    expect(senses.map((sense) => sense.id)).toEqual(rows.map((row) => row.id));
  });
});
