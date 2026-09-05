import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { validateSourceManifest, WORDNET_3_LICENSE_TEXT } from './spanish-a1-pipeline.mjs';

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
    else if (argument === '--english-archive') options.englishArchivePath = resolve(argv[++index]);
    else if (argument === '--english-omw') options.englishOmwPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.archivePath || !options.omwPath || !options.englishArchivePath || !options.englishOmwPath) {
    throw new Error('--archive, --omw, --english-archive and --english-omw are required so both pinned sources can be verified.');
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

function attributes(value) {
  return Object.fromEntries([...value.matchAll(/([\w:]+)="([^"]*)"/g)].map((match) => [match[1], decodeXml(match[2])]));
}

export function parseOmw(xml, language) {
  const lexicon = attributes(xml.match(/<Lexicon\s+([^>]+)>/)?.[1] ?? '');
  if (lexicon.id !== `omw-${language}` || lexicon.version !== '2.0' || lexicon.language !== language) {
    throw new Error(`Expected omw-${language}:2.0 XML lexicon.`);
  }
  const entriesByKey = new Map();
  const membersById = new Map();
  const entryPattern = /<LexicalEntry\s+([^>]+)>([\s\S]*?)<\/LexicalEntry>/g;
  for (const match of xml.matchAll(entryPattern)) {
    const lexicalEntryId = attributes(match[1]).id;
    const body = match[2];
    const lemma = body.match(/<Lemma writtenForm="([^"]+)" partOfSpeech="([^"]+)"\s*\/>/);
    if (!lemma) continue;
    const writtenForm = decodeXml(lemma[1]);
    const partOfSpeech = decodeXml(lemma[2]);
    const senses = [...body.matchAll(/<Sense\s+([^>]+?)(?:\/>|>)/g)].map((sense) => {
      const attrs = attributes(sense[1]);
      membersById.set(attrs.id, writtenForm);
      return { senseId: attrs.id, synsetId: attrs.synset };
    });
    membersById.set(lexicalEntryId, writtenForm);
    const key = `${normalizeSpanish(writtenForm)}\u0000${partOfSpeech}`;
    const existing = entriesByKey.get(key) ?? [];
    existing.push({ lexicalEntryId, writtenForm, partOfSpeech, senses });
    entriesByKey.set(key, existing);
  }
  const synsets = new Map();
  for (const match of xml.matchAll(/<Synset\s+([^>]+?)(?:\/>|>([\s\S]*?)<\/Synset>)/g)) {
    const attrs = attributes(match[1]);
    const body = match[2] ?? '';
    const definition = body.match(/<Definition(?:\s[^>]*)?>([\s\S]*?)<\/Definition>/)?.[1];
    synsets.set(attrs.id, {
      id: attrs.id, iliId: attrs.ili, partOfSpeech: attrs.partOfSpeech,
      memberIds: (attrs.members ?? '').split(/\s+/).filter(Boolean),
      definition: definition === undefined ? null : decodeXml(definition),
      examples: [...body.matchAll(/<Example(?:\s[^>]*)?>([\s\S]*?)<\/Example>/g)].map((example) => decodeXml(example[1])),
    });
  }
  return { entriesByKey, membersById, synsets };
}

export function resolveSemanticReference(sense, spanish, english) {
  const spanishSynset = spanish.synsets.get(sense.synsetId);
  const match = sense.synsetId.match(/^omw-es-(\d{8})-([navr])$/);
  if (!match || !spanishSynset || spanishSynset.partOfSpeech !== match[2]) throw new Error(`Invalid Spanish synset/POS: ${sense.synsetId}.`);
  const directId = `omw-en-${match[1]}-${match[2]}`;
  const englishSynset = english.synsets.get(directId)
    ?? (match[2] === 'a' ? english.synsets.get(`omw-en-${match[1]}-s`) : null);
  if (!englishSynset || englishSynset.partOfSpeech !== englishSynset.id.slice(-1)) throw new Error(`Missing English synset/POS: ${sense.synsetId}.`);
  if (!/^i\d+$/.test(spanishSynset.iliId ?? '') || spanishSynset.iliId !== englishSynset.iliId) throw new Error(`ILI mismatch: ${sense.synsetId}.`);
  const members = englishSynset.memberIds.map((id) => english.membersById.get(id));
  if (!englishSynset.definition?.trim() || members.length === 0 || members.some((member) => !member?.trim())) throw new Error(`Incomplete English description/members: ${englishSynset.id}.`);
  return {
    spanishSynsetId: sense.synsetId, englishSynsetId: englishSynset.id, iliId: spanishSynset.iliId,
    spanish: { definition: spanishSynset.definition, examples: spanishSynset.examples },
    english: { definition: englishSynset.definition, members, examples: englishSynset.examples },
    sourceSenseAliases: [{ senseId: sense.senseId, lexicalEntryId: sense.lexicalEntryId }],
  };
}

export function verifiedXml(archivePath, xmlPath, source, language) {
  if (!source || source.version !== '2.0') throw new Error(`Source manifest is missing omw-${language}:2.0.`);
  const archiveHash = sha256(readFileSync(archivePath));
  if (archiveHash !== source.sha256) throw new Error(`OMW archive SHA-256 mismatch: expected ${source.sha256}, received ${archiveHash}.`);
  // Read the member without extracting files; never resolve the XML's external DTD.
  const archivedXml = execFileSync('tar', ['-xOf', archivePath, `omw-${language}/omw-${language}.xml`], { maxBuffer: 256 * 1024 * 1024 });
  const xml = readFileSync(xmlPath);
  if (!xml.equals(archivedXml)) throw new Error(`OMW ${language} XML does not match the verified archive member.`);
  return xml.toString('utf8');
}

export function groupSemanticSenses(rawSenses, spanish, english) {
  const grouped = new Map();
  for (const sense of rawSenses) {
    const existing = grouped.get(sense.synsetId);
    if (existing) existing.semanticReference.sourceSenseAliases.push({ senseId: sense.senseId, lexicalEntryId: sense.lexicalEntryId });
    else grouped.set(sense.synsetId, { ...sense, semanticReference: resolveSemanticReference(sense, spanish, english) });
  }
  return [...grouped.values()];
}

export function runSourcePreparation(argv) {
  const options = parseArgs(argv);
  const candidates = JSON.parse(readFileSync(options.candidatesPath, 'utf8'));
  const manifest = JSON.parse(readFileSync(options.manifestPath, 'utf8'));
  validateSourceManifest(manifest);
  const omwSource = manifest.sources?.find((source) => source.id === 'omw-es:2.0');
  const englishSource = manifest.sources?.find((source) => source.id === 'omw-en:2.0');
  const omwXml = verifiedXml(options.archivePath, options.omwPath, omwSource, 'es');
  const englishXml = verifiedXml(options.englishArchivePath, options.englishOmwPath, englishSource, 'en');

  if (!omwSource) throw new Error('Source manifest is missing omw-es:2.0.');
  if (!Array.isArray(candidates.entries)) throw new Error('Candidate asset requires an entries array.');

  const candidatesSha256 = sha256(Buffer.from(canonicalJson(candidates)));
  const spanish = parseOmw(omwXml, 'es');
  const english = parseOmw(englishXml, 'en');
  let matchedEntries = 0;
  const evidenceEntries = candidates.entries.map((candidate) => {
    const omwPos = posToOmw.get(candidate.partOfSpeech) ?? null;
    const matches = omwPos
      ? spanish.entriesByKey.get(`${normalizeSpanish(candidate.term)}\u0000${omwPos}`) ?? []
      : [];
    const rawSenses = matches.flatMap((entry) => entry.senses.map((sense) => ({
      lexicalEntryId: entry.lexicalEntryId,
      writtenForm: entry.writtenForm,
      partOfSpeech: entry.partOfSpeech,
      ...sense,
    })));
    const senses = groupSemanticSenses(rawSenses, spanish, english);
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
      archiveSha256: omwSource.sha256,
      license: omwSource.license,
      attribution: omwSource.attribution,
    },
    semanticSource: {
      id: englishSource.id, version: englishSource.version, archiveSha256: englishSource.sha256,
      license: englishSource.license, attribution: englishSource.attribution,
      copyright: englishSource.copyright, licensePath: englishSource.licensePath,
      licenseText: WORDNET_3_LICENSE_TEXT,
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
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runSourcePreparation(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
