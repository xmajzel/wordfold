import { describeCatalogAvailability } from './catalog-availability';

describe('catalog availability presentation', () => {
  const counts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
  const levels = { A1: 'available', A2: 'available', B1: 'available', B2: 'available', C1: 'available', C2: 'available' } as const;

  it('does not describe empty catalog levels as complete or available', () => {
    expect(describeCatalogAvailability({ total: 0, counts, levels, state: 'unavailable' }))
      .toBe('Catalog not available yet. Manual words, imports, and phone pronunciation are available.');
  });

  it('derives available counts and levels from data', () => {
    const description = describeCatalogAvailability({ total: 12, counts: { ...counts, A1: 9, B2: 3 }, levels, state: 'available' });
    expect(description).toBe('12 catalog entries available · A1: 9 · B2: 3.');
    expect(description).not.toContain('A2');
  });

  it('describes the bundled production catalog', () => {
    expect(describeCatalogAvailability({ total: 8, counts: { ...counts, A1: 8 }, levels, state: 'available' }))
      .toBe('8 catalog entries available · A1: 8.');
  });
});
