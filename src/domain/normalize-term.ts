export function normalizeTermForLanguage(term: string, languageCode: string) {
  return term.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase(languageCode);
}
