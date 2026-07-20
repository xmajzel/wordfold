import {
  defaultPronunciationLocale,
  isSupportedLanguageCode,
  isSupportedPronunciationLocale,
} from './languages';

describe('language metadata', () => {
  it('supports the approved initial languages and regional accents', () => {
    expect(['en', 'es', 'de', 'el', 'sk'].every(isSupportedLanguageCode)).toBe(true);
    expect(isSupportedPronunciationLocale('en', 'en-GB')).toBe(true);
    expect(isSupportedPronunciationLocale('es', 'es-MX')).toBe(true);
  });

  it('does not accept a locale from another language', () => {
    expect(isSupportedPronunciationLocale('es', 'en-US')).toBe(false);
    expect(defaultPronunciationLocale('el')).toBe('el-GR');
  });
});
