import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
    level: 'A1',
    catalogPath: resolve('assets/catalog/spanish/cefr-course-catalog.json'),
    manifestPath: resolve('assets/catalog/spanish/a1-source-manifest.json'),
    outputPath: null,
    archivePath: null,
    omwPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--level') options.level = argv[++index].toUpperCase();
    else if (argument === '--catalog') options.catalogPath = resolve(argv[++index]);
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
  if (!['A1', 'A2', 'B1', 'B2', 'C1'].includes(options.level)) throw new Error('--level must be A1, A2, B1, B2, or C1.');
  options.outputPath ??= resolve(`assets/catalog/spanish/${options.level.toLowerCase()}-lexical-evidence.json`);
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, canonicalJson(value));
  renameSync(temporaryPath, path);
}

export function normalizeSpanish(value) {
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
  const catalogText = readFileSync(options.catalogPath);
  const catalog = JSON.parse(catalogText);
  const sourceManifestText = readFileSync(options.manifestPath);
  const manifest = JSON.parse(sourceManifestText);
  validateSourceManifest(manifest);
  if (manifest.level !== options.level) throw new Error(`Source manifest level ${manifest.level} does not match requested ${options.level}.`);
  const omwSource = manifest.sources?.find((source) => source.id === 'omw-es:2.0');
  const englishSource = manifest.sources?.find((source) => source.id === 'omw-en:2.0');
  const omwXml = verifiedXml(options.archivePath, options.omwPath, omwSource, 'es');
  const englishXml = verifiedXml(options.englishArchivePath, options.englishOmwPath, englishSource, 'en');

  if (!omwSource) throw new Error('Source manifest is missing omw-es:2.0.');
  if (!Array.isArray(catalog.entries)) throw new Error('CEFR course catalog requires an entries array.');

  const catalogSha256 = sha256(catalogText);
  const levelEntries = catalog.entries.filter((entry) => entry.level === options.level);
  if (catalog.counts?.[options.level] !== levelEntries.length) {
    throw new Error(`CEFR course catalog ${options.level} count mismatch: header ${catalog.counts?.[options.level]}, entries ${levelEntries.length}.`);
  }
  const spanish = parseOmw(omwXml, 'es');
  const english = parseOmw(englishXml, 'en');
  let matchedEntries = 0;
  const evidenceEntries = levelEntries.map((entry) => {
    if (entry.courseEligibility?.included !== true || entry.evidenceTier !== 'attested') {
      throw new Error(`${entry.id}: ${options.level} course entry is not an eligible attested member.`);
    }
    const normalizedTerm = normalizeSpanish(entry.term);
    if (normalizedTerm !== entry.normalizedTerm) {
      throw new Error(`${entry.id}: catalog normalizedTerm does not match NFKC Spanish normalization.`);
    }
    const joinNormalizedTerms = entry.omw?.joinNormalizedTerms ?? [entry.sourceNormalizedTerm ?? normalizedTerm];
    if (!Array.isArray(joinNormalizedTerms) || joinNormalizedTerms.length === 0
      || joinNormalizedTerms.some((term) => normalizeSpanish(term) !== term)) {
      throw new Error(`${entry.id}: catalog OMW join terms are invalid.`);
    }
    const omwPos = posToOmw.get(entry.partOfSpeech) ?? null;
    if (!omwPos) throw new Error(`${entry.id}: unsupported catalog POS ${entry.partOfSpeech}.`);
    const matches = joinNormalizedTerms.flatMap((joinTerm) => (
      spanish.entriesByKey.get(`${joinTerm}\u0000${omwPos}`) ?? []
    ));
    const rawSenses = matches.flatMap((entry) => entry.senses.map((sense) => ({
      lexicalEntryId: entry.lexicalEntryId,
      writtenForm: entry.writtenForm,
      partOfSpeech: entry.partOfSpeech,
      ...sense,
    })));
    const senses = groupSemanticSenses(rawSenses, spanish, english);
    if (senses.length === 0) {
      throw new Error(`${entry.id}: fixed A1 member has no exact normalized lemma + compatible POS OMW sense.`);
    }
    const expectedSenseIds = new Set(entry.omw?.senseIds ?? []);
    const actualSenseIds = new Set(rawSenses.map((sense) => sense.senseId));
    if (expectedSenseIds.size !== actualSenseIds.size
      || [...expectedSenseIds].some((senseId) => !actualSenseIds.has(senseId))) {
      throw new Error(`${entry.id}: recomputed OMW sense IDs differ from the frozen catalog join.`);
    }
    matchedEntries += 1;
    return {
      entryId: entry.id,
      term: entry.term,
      normalizedTerm: entry.normalizedTerm,
      level: entry.level,
      partOfSpeech: entry.partOfSpeech,
      membershipSource: entry.source,
      membershipSourceVersion: entry.sourceVersion,
      membershipSourceRows: entry.sourceRows,
      sourceNormalizedTerm: entry.sourceNormalizedTerm ?? entry.normalizedTerm,
      omwJoinNormalizedTerms: joinNormalizedTerms,
      pcicClassification: null,
      candidateSenses: senses,
      requiresSpanishSenseSelection: senses.length > 1,
    };
  });

  const payload = {
    schemaVersion: 2,
    courseId: 'es-sk',
    level: options.level,
    publicationStatus: 'draft',
    catalog: {
      path: 'assets/catalog/spanish/cefr-course-catalog.json',
      sha256: catalogSha256,
      entries: catalog.entries.length,
      levelEntries: levelEntries.length,
      membershipAndLevelSource: 'elelex',
    },
    sourceManifest: {
      path: options.manifestPath,
      sha256: sha256(sourceManifestText),
    },
    normalization: {
      id: 'spanish-omw-lemma-pos-v1',
      unicode: 'NFKC',
      whitespace: 'trim-and-collapse',
      case: 'toLocaleLowerCase(es)',
      joinKey: 'normalizedLemma + U+0000 + mapped POS',
      posMap: { noun: 'n', verb: 'v', adjective: 'a', adverb: 'r' },
    },
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
    },
    entries: evidenceEntries,
  };

  writeJsonAtomic(options.outputPath, payload);
  console.log(`Prepared OMW evidence for ${matchedEntries}/${evidenceEntries.length} fixed ${options.level} members.`);
  console.log(`Catalog SHA-256: ${catalogSha256}`);
  console.log(`Output: ${options.outputPath}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runSourcePreparation(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
