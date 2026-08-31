import { normalizeTerm, parseBulkInput } from './parser';

describe('bulk import parser', () => {
  it('parses words with optional Slovak translations', () => {
    expect(parseBulkInput('stakeholder - zainteresovana strana\nscope')).toEqual([
      expect.objectContaining({ term: 'stakeholder', translation: 'zainteresovana strana', error: null }),
      expect.objectContaining({ term: 'scope', translation: null, error: null }),
    ]);
  });

  it('flags duplicate normalized terms', () => {
    const parsed = parseBulkInput('Scope\n scope ');
    expect(parsed[1].error).toBe('Duplicate in this paste');
  });

  it('normalizes whitespace and case', () => {
    expect(normalizeTerm('  Project   Charter ')).toBe('project charter');
  });

  it('preserves Spanish diacritics while normalizing Unicode and case', () => {
    expect(parseBulkInput('  CORAZÓN - srdce\nNiño', 'es')).toEqual([
      expect.objectContaining({ term: 'CORAZÓN', normalizedTerm: 'corazón', translation: 'srdce', error: null }),
      expect.objectContaining({ term: 'Niño', normalizedTerm: 'niño', translation: null, error: null }),
    ]);
  });

  it('parses original learner content for catalog-independent Spanish imports', () => {
    expect(parseBulkInput(
      'corazón | Órgano que impulsa la sangre por el cuerpo. | srdce | El corazón late con fuerza.',
      'es',
    )).toEqual([expect.objectContaining({
      term: 'corazón',
      definition: 'Órgano que impulsa la sangre por el cuerpo.',
      translation: 'srdce',
      example: 'El corazón late con fuerza.',
      error: null,
    })]);
  });
});
