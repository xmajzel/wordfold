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
});
