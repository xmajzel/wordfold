import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve(process.argv[2] ?? '/Users/jozefmajzel/Desktop/Anglické slovíčka - Hárok1.tsv');
const outputPath = resolve(process.argv[3] ?? 'docs/personal-vocabulary-archive/personal-vocabulary.json');
const catalogPath = resolve(process.argv[4] ?? 'assets/catalog/wordnet.sqlite');
const overridePath = resolve('docs/personal-vocabulary-archive/personal-vocabulary-overrides.json');

const groups = [
  { id: 'ux-ui', name: 'UX/UI', termColumn: 4, translationColumn: 5, priority: 0 },
  { id: 'project-management', name: 'Project Management', termColumn: 1, translationColumn: 2, priority: 1 },
  { id: 'headway-upper-intermediate', name: 'Headway Upper Intermediate', termColumn: 7, translationColumn: 8, priority: 2 },
];

const rows = readFileSync(sourcePath, 'utf8')
  .replace(/\r/g, '')
  .split('\n')
  .map((line) => line.split('\t'));
const overrides = JSON.parse(readFileSync(overridePath, 'utf8'));
const database = new DatabaseSync(catalogPath, { readOnly: true });
const lookup = database.prepare(`
  SELECT id, part_of_speech, definition, example
  FROM senses
  WHERE normalized_term = ?
  ORDER BY rank
`);

function normalizeTerm(term) {
  return term.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function stableId(collectionId, normalizedTerm) {
  let hash = 2166136261;
  for (const character of `${collectionId}:${normalizedTerm}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `seed-${collectionId}-${(hash >>> 0).toString(36)}`;
}

function partOfSpeechLabel(value) {
  return ({ n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' })[value] ?? value;
}

const extracted = [];
for (const group of groups) {
  for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
    const originalTerm = (rows[rowIndex][group.termColumn] ?? '').trim();
    const originalTranslation = (rows[rowIndex][group.translationColumn] ?? '').trim();
    if (!originalTerm || !originalTranslation || originalTerm === 'EN') continue;

    const correction = overrides.corrections[normalizeTerm(originalTerm)] ?? {};
    const term = correction.term ?? originalTerm;
    extracted.push({
      collectionId: group.id,
      collectionName: group.name,
      priority: group.priority,
      sourceRow: rowIndex + 1,
      term,
      normalizedTerm: normalizeTerm(term),
      translation: correction.translation ?? originalTranslation,
    });
  }
}

extracted.push({
  collectionId: 'headway-upper-intermediate',
  collectionName: 'Headway Upper Intermediate',
  priority: 2,
  sourceRow: 198,
  term: 'IIRC (if I remember correctly)',
  normalizedTerm: normalizeTerm('IIRC (if I remember correctly)'),
  translation: 'ak si správne pamätám',
});

const unique = new Map();
for (const item of extracted.sort((left, right) => left.priority - right.priority || left.sourceRow - right.sourceRow)) {
  if (!unique.has(item.normalizedTerm)) unique.set(item.normalizedTerm, item);
}

const missing = [];
const seededWords = [];
for (const item of unique.values()) {
  const rawContent = overrides.content[item.normalizedTerm] ?? {};
  const content = Array.isArray(rawContent)
    ? { partOfSpeech: rawContent[0], definition: rawContent[1], example: rawContent[2] }
    : rawContent;
  const senses = lookup.all(content.catalogTerm ? normalizeTerm(content.catalogTerm) : item.normalizedTerm);
  const sense = senses[content.senseIndex ?? 0] ?? null;
  const definition = content.definition ?? sense?.definition ?? null;
  const example = content.example ?? sense?.example ?? null;
  const partOfSpeech = content.partOfSpeech ?? (sense ? partOfSpeechLabel(sense.part_of_speech) : null);

  if (!definition || !example || !partOfSpeech) {
    missing.push({
      term: item.term,
      normalizedTerm: item.normalizedTerm,
      translation: item.translation,
      needs: [!definition && 'definition', !example && 'example', !partOfSpeech && 'partOfSpeech'].filter(Boolean),
    });
    continue;
  }

  seededWords.push({
    id: stableId(item.collectionId, item.normalizedTerm),
    collectionId: item.collectionId,
    term: item.term,
    normalizedTerm: item.normalizedTerm,
    translation: item.translation,
    definition,
    example,
    partOfSpeech,
    catalogSenseId: content.definition ? null : sense?.id ?? null,
  });
}

database.close();

if (missing.length > 0) {
  for (const item of missing) {
    console.error(`${item.normalizedTerm}\t${item.translation}\t${item.needs.join(',')}`);
  }
  throw new Error(`${missing.length} vocabulary entries need curated content`);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({
  collections: groups
    .slice()
    .sort((left, right) => left.priority - right.priority)
    .map(({ id, name }) => ({ id, name })),
  words: seededWords,
}, null, 2)}\n`);
console.log(`Created ${outputPath} with ${seededWords.length} corrected vocabulary entries.`);
