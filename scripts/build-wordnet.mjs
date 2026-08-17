import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourceDirectory = resolve(process.argv[2] ?? '/tmp/oewn2025');
const outputPath = resolve(process.argv[3] ?? 'assets/catalog/wordnet.sqlite');
const sourceFiles = readdirSync(sourceDirectory)
  .filter((name) => /^(adj|adv|noun|verb)\..+\.json$/.test(name))
  .sort();
const entryFiles = readdirSync(sourceDirectory)
  .filter((name) => /^entries-.+\.json$/.test(name))
  .sort();
const curatedPath = resolve('assets/catalog/curated-senses.json');

if (sourceFiles.length === 0) {
  throw new Error(`No Open English WordNet synset files found in ${sourceDirectory}`);
}

mkdirSync(dirname(outputPath), { recursive: true });
rmSync(outputPath, { force: true });

const database = new DatabaseSync(outputPath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = OFF;
  CREATE TABLE senses (
    id TEXT PRIMARY KEY NOT NULL,
    term TEXT NOT NULL,
    normalized_term TEXT NOT NULL,
    part_of_speech TEXT NOT NULL,
    definition TEXT NOT NULL,
    example TEXT,
    rank INTEGER NOT NULL
  );
  CREATE INDEX senses_normalized_term_idx ON senses(normalized_term, rank);
`);

const insert = database.prepare(`
  INSERT OR IGNORE INTO senses
    (id, term, normalized_term, part_of_speech, definition, example, rank)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const ranks = new Map();
let inserted = 0;

function textValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.value === 'string') return value.value;
  return null;
}

for (const fileName of entryFiles) {
  const entries = JSON.parse(readFileSync(resolve(sourceDirectory, fileName), 'utf8'));
  for (const [term, forms] of Object.entries(entries)) {
    const normalizedTerm = term.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
    let rank = 0;
    for (const form of Object.values(forms)) {
      for (const sense of form.sense ?? []) {
        ranks.set(`${sense.synset}:${normalizedTerm}`, rank);
        rank += 1;
      }
    }
  }
}

database.exec('BEGIN');
for (const fileName of sourceFiles) {
  const synsets = JSON.parse(readFileSync(resolve(sourceDirectory, fileName), 'utf8'));
  for (const [synsetId, synset] of Object.entries(synsets)) {
    const definition = textValue(synset.definition?.[0]);
    if (!definition) continue;
    for (const term of synset.members ?? []) {
      const normalizedTerm = term.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
      const rank = ranks.get(`${synsetId}:${normalizedTerm}`) ?? 99;
      insert.run(
        `${synsetId}:${normalizedTerm}`,
        term,
        normalizedTerm,
        synset.partOfSpeech ?? synsetId.slice(-1),
        definition,
        textValue(synset.example?.[0]),
        rank,
      );
      inserted += 1;
    }
  }
}
for (const sense of JSON.parse(readFileSync(curatedPath, 'utf8'))) {
  insert.run(
    sense.id,
    sense.term,
    sense.term.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en'),
    sense.partOfSpeech,
    sense.definition,
    sense.example ?? null,
    -100,
  );
  inserted += 1;
}
database.exec('COMMIT');
database.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE; PRAGMA optimize; VACUUM;');
database.close();

console.log(`Created ${outputPath} with ${inserted.toLocaleString()} senses.`);
