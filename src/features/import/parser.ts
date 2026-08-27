import { normalizeTermForLanguage } from '@/domain/normalize-term';

export interface ParsedImportLine {
  lineNumber: number;
  term: string;
  normalizedTerm: string;
  translation: string | null;
  definition: string | null;
  example: string | null;
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

    const columns = line.split(' | ').map((column) => column.trim());
    const usesEditorialColumns = columns.length > 1;
    const separatorIndex = usesEditorialColumns ? -1 : line.indexOf(' - ');
    const term = (usesEditorialColumns ? columns[0] : separatorIndex >= 0 ? line.slice(0, separatorIndex) : line).trim();
    const definition = usesEditorialColumns ? columns[1] ?? '' : '';
    const translation = usesEditorialColumns ? columns[2] ?? '' : separatorIndex >= 0 ? line.slice(separatorIndex + 3).trim() : '';
    const example = usesEditorialColumns ? columns[3] ?? '' : '';
    const normalizedTerm = normalizeTerm(term, sourceLanguageCode);
    let error: string | null = null;

    if (!term) error = 'Word is missing';
    else if (term.length > 100) error = 'Word is too long';
    else if (usesEditorialColumns && !definition) error = 'Definition is missing';
    else if (columns.length > 4) error = 'Use at most four columns';
    else if (separatorIndex >= 0 && !translation) error = 'Translation is missing';
    else if (seen.has(normalizedTerm)) error = 'Duplicate in this paste';

    seen.add(normalizedTerm);
    return [{
      lineNumber: index + 1,
      term,
      normalizedTerm,
      translation: translation || null,
      definition: definition || null,
      example: example || null,
      error,
    }];
  });
}
