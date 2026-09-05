import { describeCatalogAvailability } from './catalog-availability';

describe('catalog availability presentation', () => {
  const counts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };

  it('does not describe empty catalog levels as complete or available', () => {
    expect(describeCatalogAvailability({ total: 0, counts, isPreview: false, state: 'unavailable' }))
      .toBe('Catalog not available yet. Manual words, imports, and phone pronunciation are available.');
  });

  it('derives partial preview counts and levels from data', () => {
    const description = describeCatalogAvailability({ total: 12, counts: { ...counts, A1: 9, B2: 3 }, isPreview: true, state: 'preview' });
    expect(description).toBe('Local preview: 12 entries · A1: 9 · B2: 3. Available entries do not mean a complete level.');
    expect(description).not.toContain('A2');
  });

  it('keeps production availability separate from draft preview', () => {
    expect(describeCatalogAvailability({ total: 8, counts: { ...counts, A1: 8 }, isPreview: false, state: 'available' }))
      .toBe('8 catalog entries available · A1: 8.');
  });
});
