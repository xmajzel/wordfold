export interface PronunciationLocaleOption {
  code: string;
  label: string;
}

export interface LanguageOption {
  code: string;
  label: string;
  defaultPronunciationLocale: string;
  pronunciationLocales: PronunciationLocaleOption[];
}

export const languageOptions: LanguageOption[] = [
  {
    code: 'en', label: 'English', defaultPronunciationLocale: 'en-US',
    pronunciationLocales: [
      { code: 'en-US', label: 'United States' },
      { code: 'en-GB', label: 'United Kingdom' },
    ],
  },
  {
    code: 'es', label: 'Spanish', defaultPronunciationLocale: 'es-ES',
    pronunciationLocales: [
      { code: 'es-ES', label: 'Spain' },
      { code: 'es-MX', label: 'Mexico' },
    ],
  },
  {
    code: 'de', label: 'German', defaultPronunciationLocale: 'de-DE',
    pronunciationLocales: [{ code: 'de-DE', label: 'Germany' }],
  },
  {
    code: 'el', label: 'Greek', defaultPronunciationLocale: 'el-GR',
    pronunciationLocales: [{ code: 'el-GR', label: 'Greece' }],
  },
  {
    code: 'sk', label: 'Slovak', defaultPronunciationLocale: 'sk-SK',
    pronunciationLocales: [{ code: 'sk-SK', label: 'Slovakia' }],
  },
];

export const defaultSourceLanguageCode = 'en';
export const defaultTargetLanguageCode = 'sk';

export function getLanguageOption(code: string) {
  return languageOptions.find((language) => language.code === code) ?? null;
}

export function defaultPronunciationLocale(code: string) {
  return getLanguageOption(code)?.defaultPronunciationLocale ?? code;
}

export function languageLabel(code: string) {
  return getLanguageOption(code)?.label ?? code;
}

export function pronunciationLocaleLabel(languageCode: string, locale: string) {
  return getLanguageOption(languageCode)?.pronunciationLocales.find((option) => option.code === locale)?.label ?? locale;
}

export function isSupportedLanguageCode(code: string) {
  return languageOptions.some((language) => language.code === code);
}

export function isSupportedPronunciationLocale(languageCode: string, locale: string) {
  return Boolean(getLanguageOption(languageCode)?.pronunciationLocales.some((option) => option.code === locale));
}
