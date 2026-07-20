import { normalizeTermForLanguage } from '@/domain/normalize-term';

export interface ParsedImportLine {
  lineNumber: number;
  term: string;
  normalizedTerm: string;
  translation: string | null;
  error: string | null;
}

export function normalizeTerm(term: string, languageCode = 'en') {
  return normalizeTermForLanguage(term, languageCode);
}

export function parseBulkInput(input: string, sourceLanguageCode = 'en'): ParsedImportLine[] {
  const seen = new Set<string>();

  return input.split(/\r?\n/).flatMap((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return [];

    const separatorIndex = line.indexOf(' - ');
    const term = (separatorIndex >= 0 ? line.slice(0, separatorIndex) : line).trim();
    const translation = separatorIndex >= 0 ? line.slice(separatorIndex + 3).trim() : '';
    const normalizedTerm = normalizeTerm(term, sourceLanguageCode);
    let error: string | null = null;

    if (!term) error = 'Word is missing';
    else if (term.length > 100) error = 'Word is too long';
    else if (separatorIndex >= 0 && !translation) error = 'Translation is missing';
    else if (seen.has(normalizedTerm)) error = 'Duplicate in this paste';

    seen.add(normalizedTerm);
    return [{ lineNumber: index + 1, term, normalizedTerm, translation: translation || null, error }];
  });
}
