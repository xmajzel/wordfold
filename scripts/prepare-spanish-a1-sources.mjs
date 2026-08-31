import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const posToOmw = new Map([
  ['noun', 'n'],
  ['NOUN', 'n'],
  ['verb', 'v'],
  ['VERB', 'v'],
  ['adjective', 'a'],
  ['ADJ', 'a'],
  ['adverb', 'r'],
  ['ADV', 'r'],
]);

function parseArgs(argv) {
  const options = {
    candidatesPath: resolve('assets/catalog/spanish/a1-candidates.json'),
    manifestPath: resolve('assets/catalog/spanish/a1-source-manifest.json'),
    outputPath: resolve('assets/catalog/spanish/a1-lexical-evidence.json'),
    archivePath: null,
    omwPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--candidates') options.candidatesPath = resolve(argv[++index]);
    else if (argument === '--manifest') options.manifestPath = resolve(argv[++index]);
    else if (argument === '--output') options.outputPath = resolve(argv[++index]);
    else if (argument === '--archive') options.archivePath = resolve(argv[++index]);
    else if (argument === '--omw') options.omwPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.archivePath || !options.omwPath) {
    throw new Error('--archive and --omw are required so the pinned source can be verified.');
  }
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizeSpanish(value) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function parseOmwEntries(xml) {
  const entriesByKey = new Map();
  const entryPattern = /<LexicalEntry id="([^"]+)">([\s\S]*?)<\/LexicalEntry>/g;
  for (const match of xml.matchAll(entryPattern)) {
    const lexicalEntryId = decodeXml(match[1]);
    const body = match[2];
    const lemma = body.match(/<Lemma writtenForm="([^"]+)" partOfSpeech="([^"]+)"\s*\/>/);
    if (!lemma) continue;
    const writtenForm = decodeXml(lemma[1]);
    const partOfSpeech = decodeXml(lemma[2]);
    const senses = [...body.matchAll(/<Sense id="([^"]+)" synset="([^"]+)"\s*\/>/g)]
      .map((sense) => ({
        senseId: decodeXml(sense[1]),
        synsetId: decodeXml(sense[2]),
      }));
    const key = `${normalizeSpanish(writtenForm)}\u0000${partOfSpeech}`;
    const existing = entriesByKey.get(key) ?? [];
    existing.push({ lexicalEntryId, writtenForm, partOfSpeech, senses });
    entriesByKey.set(key, existing);
  }
  return entriesByKey;
}

const options = parseArgs(process.argv.slice(2));
const candidates = JSON.parse(readFileSync(options.candidatesPath, 'utf8'));
const manifest = JSON.parse(readFileSync(options.manifestPath, 'utf8'));
const archive = readFileSync(options.archivePath);
const omwXml = readFileSync(options.omwPath, 'utf8');
const omwSource = manifest.sources?.find((source) => source.id === 'omw-es:2.0');

if (!omwSource) throw new Error('Source manifest is missing omw-es:2.0.');
const actualArchiveSha256 = sha256(archive);
if (actualArchiveSha256 !== omwSource.sha256) {
  throw new Error(`OMW archive SHA-256 mismatch: expected ${omwSource.sha256}, received ${actualArchiveSha256}.`);
}
if (!Array.isArray(candidates.entries)) throw new Error('Candidate asset requires an entries array.');

const candidatesSha256 = sha256(Buffer.from(canonicalJson(candidates)));
const omwEntries = parseOmwEntries(omwXml);
let matchedEntries = 0;
const evidenceEntries = candidates.entries.map((candidate) => {
  const omwPos = posToOmw.get(candidate.partOfSpeech) ?? null;
  const matches = omwPos
    ? omwEntries.get(`${normalizeSpanish(candidate.term)}\u0000${omwPos}`) ?? []
    : [];
  const senses = matches.flatMap((entry) => entry.senses.map((sense) => ({
    lexicalEntryId: entry.lexicalEntryId,
    writtenForm: entry.writtenForm,
    partOfSpeech: entry.partOfSpeech,
    ...sense,
  })));
  if (senses.length > 0) matchedEntries += 1;
  return {
    candidateId: candidate.id,
    catalogSenseId: candidate.catalogSenseId,
    term: candidate.term,
    normalizedTerm: candidate.normalizedTerm,
    candidatePartOfSpeech: candidate.partOfSpeech,
    sourceId: senses.length > 0 ? 'omw-es:2.0' : 'wordfold-original-spanish-a1',
    sourceVersion: senses.length > 0 ? omwSource.version : 'draft-2026-08-28',
    selectedSenseId: null,
    candidateSenses: senses,
    requiresSpanishSenseSelection: senses.length > 1,
    exceptionRationale: senses.length === 0
      ? 'No exact compatible OMW Spanish lemma/POS match; requires explicit editorial evidence and Spanish review.'
      : null,
  };
});

const payload = {
  schemaVersion: 1,
  courseId: 'es-sk',
  level: 'A1',
  publicationStatus: 'draft',
  candidatesSha256,
  source: {
    id: omwSource.id,
    version: omwSource.version,
    archiveSha256: actualArchiveSha256,
    license: omwSource.license,
    attribution: omwSource.attribution,
  },
  coverage: {
    entries: evidenceEntries.length,
    exactLemmaAndPosMatches: matchedEntries,
    exactLemmaAndPosRatio: evidenceEntries.length === 0 ? 0 : matchedEntries / evidenceEntries.length,
    targetRatio: 0.8,
  },
  entries: evidenceEntries,
};

writeFileSync(options.outputPath, canonicalJson(payload));
console.log(`Prepared OMW evidence for ${matchedEntries}/${evidenceEntries.length} candidates.`);
console.log(`Candidate SHA-256: ${candidatesSha256}`);
console.log(`Output: ${options.outputPath}`);
