import { normalizeTermForLanguage } from './normalize-term';

describe('normalizeTermForLanguage', () => {
  it('applies NFKC, collapses whitespace, and lowercases for the selected language', () => {
    expect(normalizeTermForLanguage('  ＨＥＬＬＯ\n  WORLD  ', 'en')).toBe('hello world');
    expect(normalizeTermForLanguage('  ΟΔΟΣ  ', 'el')).toBe('οδος');
  });

  it('preserves language-specific characters while normalizing case', () => {
    expect(normalizeTermForLanguage('  ÜBER  ', 'de')).toBe('über');
    expect(normalizeTermForLanguage('  ESPAÑA  ', 'es')).toBe('españa');
  });
});
