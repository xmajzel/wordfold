import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LEVEL_INDEX = new Map(CEFR_LEVELS.map((level, index) => [level, index]));
const sourcePaths = {
  cefrJ: resolve('assets/catalog/sources/cefr-j-wordlist-1.6.csv'),
  octanove: resolve('assets/catalog/sources/octanove-vocabulary-profile-c1c2-1.0.csv'),
};
const wordnetPath = resolve('assets/catalog/wordnet.sqlite');
const catalogPath = resolve('assets/catalog/cefr-catalog.json');
const indexPath = resolve('assets/catalog/cefr-index.json');
const senseLevelsPath = resolve('assets/catalog/cefr-sense-levels.json');
const manifestPath = resolve('assets/catalog/cefr-catalog-manifest.json');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function recordsFromCsv(path, source, version) {
  const [headers, ...rows] = parseCsv(readFileSync(path, 'utf8'));
  return rows.map((values, rowIndex) => {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    return {
      source,
      version,
      row: rowIndex + 2,
      originalHeadword: row.headword.trim(),
      partOfSpeech: row.pos.trim(),
      level: row.CEFR.trim(),
    };
  });
}

function normalizeTerm(term) {
  return term.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function uniqueBy(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wordnetParts(partOfSpeech) {
  switch (partOfSpeech.toLocaleLowerCase('en')) {
    case 'noun': return ['n'];
    case 'verb': return ['v'];
    case 'adjective': return ['a', 's'];
    case 'adverb': return ['r'];
    default: return [];
  }
}

const cefrJRecords = recordsFromCsv(sourcePaths.cefrJ, 'cefr-j', '1.6');
const octanoveRecords = recordsFromCsv(sourcePaths.octanove, 'octanove', '1.0');
const sourceRows = { cefrJ: cefrJRecords.length, octanove: octanoveRecords.length };
const corrections = [];
for (const record of octanoveRecords) {
  if (record.originalHeadword === 'remonstrate' && record.partOfSpeech === 'vern') {
    corrections.push({ source: record.source, row: record.row, field: 'partOfSpeech', from: 'vern', to: 'verb' });
    record.partOfSpeech = 'verb';
  }
}

const variants = [];
let slashAliasesExpanded = 0;
for (const record of [...cefrJRecords, ...octanoveRecords]) {
  if (!LEVEL_INDEX.has(record.level)) continue;
  const splitTerms = record.source === 'cefr-j'
    ? record.originalHeadword.split('/').map((term) => term.trim()).filter(Boolean)
    : [record.originalHeadword];
  slashAliasesExpanded += Math.max(0, splitTerms.length - 1);
  for (const term of splitTerms) {
    variants.push({
      ...record,
      term,
      normalizedTerm: normalizeTerm(term),
    });
  }
}

const groups = new Map();
for (const variant of variants) {
  if (!variant.normalizedTerm) continue;
  const group = groups.get(variant.normalizedTerm) ?? [];
  group.push(variant);
  groups.set(variant.normalizedTerm, group);
}

const advancedConflictsExcluded = [];
const lowerLevelResolutions = [];
const lowerLevelPrecedence = [];
const selectedCandidates = [];
for (const [normalizedTerm, rawGroup] of groups) {
  const group = uniqueBy(rawGroup, (item) => `${item.source}|${item.row}|${item.term}|${item.partOfSpeech}|${item.level}`);
  const lower = group.filter((item) => item.source === 'cefr-j');
  const upper = group.filter((item) => item.source === 'octanove');
  let selectedLevel;
  let selectedSource;
  if (lower.length > 0) {
    selectedSource = 'cefr-j';
    selectedLevel = lower.map((item) => item.level).sort((a, b) => LEVEL_INDEX.get(a) - LEVEL_INDEX.get(b))[0];
    const omittedLevels = [...new Set(group.map((item) => item.level).filter((level) => level !== selectedLevel))].sort();
    if (omittedLevels.length > 0) {
      const resolution = { normalizedTerm, keptLevel: selectedLevel, omittedLevels };
      if (upper.length > 0) lowerLevelPrecedence.push(resolution);
      else lowerLevelResolutions.push(resolution);
    }
  } else {
    const levels = [...new Set(upper.map((item) => item.level))].sort();
    if (levels.length !== 1) {
      advancedConflictsExcluded.push({ normalizedTerm, levels, rows: upper.map((item) => item.row) });
      continue;
    }
    selectedSource = 'octanove';
    [selectedLevel] = levels;
  }
  const selectedRecords = group.filter((item) => item.source === selectedSource && item.level === selectedLevel);
  selectedCandidates.push({
    normalizedTerm,
    term: selectedRecords[0].term,
    level: selectedLevel,
    source: selectedSource,
    sourceVersion: selectedRecords[0].version,
    sourcePartOfSpeech: [...new Set(selectedRecords.map((item) => item.partOfSpeech))].sort(),
    provenance: group.map(({ source, version, row, originalHeadword, term, partOfSpeech, level }) => ({
      source, version, row, originalHeadword, splitTerm: term, partOfSpeech, level,
    })),
  });
}

const database = new DatabaseSync(wordnetPath, { readOnly: true });
const sensesForTerm = database.prepare(
  `SELECT id, term, part_of_speech, definition, example, rank
   FROM senses WHERE normalized_term = ? ORDER BY rank, id`,
);
const partOfSpeechLabels = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' };
const unmatched = [];
const entries = [];
const entryProvenance = [];
for (const candidate of selectedCandidates) {
  const desiredParts = new Set(candidate.sourcePartOfSpeech.flatMap(wordnetParts));
  const senses = sensesForTerm.all(candidate.normalizedTerm);
  const sense = senses.find((item) => desiredParts.has(item.part_of_speech));
  if (!sense) {
    unmatched.push({
      normalizedTerm: candidate.normalizedTerm,
      level: candidate.level,
      source: candidate.source,
      sourcePartOfSpeech: candidate.sourcePartOfSpeech,
      reason: senses.length === 0 ? 'no-wordnet-sense' : desiredParts.size === 0 ? 'unsupported-source-pos' : 'no-compatible-wordnet-pos',
    });
    continue;
  }
  const entry = {
    id: `${candidate.level.toLocaleLowerCase('en')}:${sense.id}`,
    term: candidate.term,
    normalizedTerm: candidate.normalizedTerm,
    level: candidate.level,
    partOfSpeech: partOfSpeechLabels[sense.part_of_speech] ?? sense.part_of_speech,
    definition: sense.definition,
    example: sense.example,
    catalogSenseId: sense.id,
    source: candidate.source,
    sourceVersion: candidate.sourceVersion,
    sourcePartOfSpeech: candidate.sourcePartOfSpeech,
  };
  entries.push(entry);
  entryProvenance.push({ id: entry.id, normalizedTerm: entry.normalizedTerm, records: candidate.provenance });
}
database.close();

entries.sort((left, right) => {
  const byLevel = LEVEL_INDEX.get(left.level) - LEVEL_INDEX.get(right.level);
  return byLevel || left.term.localeCompare(right.term, 'en', { sensitivity: 'base' });
});
const normalizedTerms = new Set(entries.map((entry) => entry.normalizedTerm));
if (normalizedTerms.size !== entries.length) throw new Error('Generated catalog contains duplicate normalized terms.');
for (const level of CEFR_LEVELS) {
  if (!entries.some((entry) => entry.level === level)) throw new Error(`Generated catalog is missing ${level}.`);
}
for (const entry of entries) {
  if (!entry.term || !entry.definition || !entry.partOfSpeech || !entry.catalogSenseId) {
    throw new Error(`Generated catalog contains an incomplete entry: ${entry.normalizedTerm}`);
  }
}

const counts = Object.fromEntries(CEFR_LEVELS.map((level) => [level, entries.filter((entry) => entry.level === level).length]));
const catalog = {
  schemaVersion: 1,
  title: 'CEFR-aligned English vocabulary',
  levels: CEFR_LEVELS,
  counts,
  entries,
};
const serializedCatalog = `${JSON.stringify(catalog, null, 2)}\n`;
const manifest = {
  schemaVersion: 1,
  catalogSha256: createHash('sha256').update(serializedCatalog).digest('hex'),
  sources: [
    { id: 'cefr-j', version: '1.6', levels: ['A1', 'A2', 'B1', 'B2'], rows: sourceRows.cefrJ },
    { id: 'octanove', version: '1.0', levels: ['C1', 'C2'], rows: sourceRows.octanove },
  ],
  inputVariants: variants.length,
  outputEntries: entries.length,
  counts,
  transformations: {
    slashAliasesExpanded,
    corrections,
    lowerLevelResolutions,
    lowerLevelPrecedence,
    advancedConflictsExcluded,
    unmatched,
  },
  entryProvenance,
  qa: {
    uniqueNormalizedTerms: normalizedTerms.size === entries.length,
    allLevelsPresent: CEFR_LEVELS.every((level) => counts[level] > 0),
    allEntriesHaveDefinitions: entries.every((entry) => Boolean(entry.definition)),
    allEntriesHaveCatalogSenses: entries.every((entry) => Boolean(entry.catalogSenseId)),
  },
};

writeFileSync(catalogPath, serializedCatalog);
writeFileSync(indexPath, `${JSON.stringify({ schemaVersion: 1, title: catalog.title, levels: CEFR_LEVELS, counts }, null, 2)}\n`);
writeFileSync(senseLevelsPath, `${JSON.stringify(Object.fromEntries(entries.map((entry) => [entry.catalogSenseId, entry.level])), null, 2)}\n`);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created ${catalogPath} with ${entries.length.toLocaleString()} entries (${CEFR_LEVELS.map((level) => `${level}: ${counts[level].toLocaleString()}`).join(', ')}).`);
console.log(`QA details: ${manifestPath}`);
