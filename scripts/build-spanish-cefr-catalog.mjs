import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseOmw } from './prepare-spanish-a1-sources.mjs';
import { buildCourseOrderSidecar } from './build-spanish-cefr-order.mjs';

const ELELEX_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const ELELEX_URL = 'https://cental.uclouvain.be/cefrlex/static/resources/es/ELELex.tsv';
const ELELEX_REVISION = {
  lastModified: '2020-12-04T09:48:08Z',
  etag: '1607075288.0-1442791-870521007',
  retrieved: '2026-09-06',
};
const ELELEX_SHA256 = '87a28dc6d3c5c2344883698f7bc77e259bd42212446ac2b52761a3fc8f5f26cf';
const OMW_URL = 'https://github.com/omwn/omw-data/releases/download/v2.0/omw-es-2.0.tar.xz';
const OMW_SHA256 = 'd8450d42885cd51f3db39fe64219a7a003eeb432b4caa00428285fe6ab224303';
const ATTRIBUTION = 'Spanish vocabulary level data is based in part on ELELex, a CEFR-graded lexical resource developed as part of the CEFRLex project at UCLouvain/CENTAL.';
const DEFAULT_DOCUMENT_THRESHOLD = 2;
const LEVEL_INDEX = new Map(ELELEX_LEVELS.map((level, index) => [level, index]));
const EXPECTED_HEADERS = [
  'word', 'tag',
  ...ELELEX_LEVELS.map((level) => `level_freq@${level.toLocaleLowerCase('en')}`),
  'total_freq@total',
  ...ELELEX_LEVELS.map((level) => `nb_doc@${level.toLocaleLowerCase('en')}`),
  'nb_doc@total',
];

const TAG_CATEGORIES = new Map([
  ...['AO0', 'AP0', 'AQ0', 'AQC', 'AQS', 'AQV'].map((tag) => [tag, 'adjective']),
  ...['NC0', 'NCC', 'NCF', 'NCFM', 'NCM', 'NP*', 'NP0'].map((tag) => [tag, 'noun']),
  ...['RG', 'RN'].map((tag) => [tag, 'adverb']),
  ...['VA', 'VM', 'VS'].map((tag) => [tag, 'verb']),
]);
const OMW_POS = new Map([
  ['noun', 'n'],
  ['verb', 'v'],
  ['adjective', 'a'],
  ['adverb', 'r'],
]);

const HEADWORD_NORMALIZATIONS = new Map([
  ['sólo\u0000adverb', {
    canonicalTerm: 'solo',
    rule: 'rae-2010-optional-diacritic-removed',
  }],
  ['guión\u0000noun', {
    canonicalTerm: 'guion',
    rule: 'rae-2010-monosyllabic-diacritic-removed',
  }],
]);

const MISSED_PROPER_NAME_EXCLUSIONS = new Map([
  ['pablo\u0000noun', {
    category: 'person-name',
    evidenceSenseIds: ['omw-es-Pablo-11225661-n'],
    evidence: 'The only compatible OMW sense is the Apostle Paul named instance.',
  }],
  ['mediterráneo\u0000noun', {
    category: 'place-name',
    evidenceSenseIds: ['omw-es-Mediterráneo-09350045-n', 'omw-es-mediterráneo-09350045-n'],
    evidence: 'All compatible OMW aliases resolve to the Mediterranean Sea named instance.',
  }],
  ['maría\u0000noun', {
    category: 'person-name',
    evidenceSenseIds: ['omw-es-María-11161412-n'],
    evidence: 'Reviewed given-name homograph: the title-cased sense is the Virgin Mary; remaining OMW senses are marijuana slang/plant senses or an obsolete coin and do not rescue the course entry.',
  }],
  ['pizarro\u0000noun', {
    category: 'person-name',
    evidenceSenseIds: ['omw-es-Pizarro-11238726-n'],
    evidence: 'The only compatible OMW sense is Francisco Pizarro as a named person instance.',
  }],
  ['teresa\u0000noun', {
    category: 'person-name',
    evidenceSenseIds: ['omw-es-Teresa-11335878-n'],
    evidence: 'The only compatible OMW sense is Mother Teresa as a named person instance.',
  }],
  ['el\u0000noun', {
    category: 'place-name',
    evidenceSenseIds: ['omw-es-El-08738272-n'],
    evidence: 'The only compatible OMW sense is a fragment alias for El Salvador.',
  }],
]);

function parseArgs(argv) {
  const options = {
    elelexPath: resolve('assets/catalog/sources/elelex-freeling-2020-12-04.tsv'),
    catalogPath: resolve('assets/catalog/spanish/cefr-catalog.json'),
    courseCatalogPath: resolve('assets/catalog/spanish/cefr-course-catalog.json'),
    courseOrderPath: resolve('assets/catalog/spanish/cefr-course-order.json'),
    manifestPath: resolve('assets/catalog/spanish/cefr-catalog-manifest.json'),
    omwArchivePath: null,
    documentThreshold: DEFAULT_DOCUMENT_THRESHOLD,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--elelex') options.elelexPath = resolve(argv[++index]);
    else if (argument === '--omw-archive') options.omwArchivePath = resolve(argv[++index]);
    else if (argument === '--catalog') options.catalogPath = resolve(argv[++index]);
    else if (argument === '--course-catalog') options.courseCatalogPath = resolve(argv[++index]);
    else if (argument === '--course-order') options.courseOrderPath = resolve(argv[++index]);
    else if (argument === '--manifest') options.manifestPath = resolve(argv[++index]);
    else if (argument === '--document-threshold') options.documentThreshold = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.omwArchivePath) throw new Error('--omw-archive is required so the pinned OMW source can be verified.');
  if (!Number.isInteger(options.documentThreshold) || options.documentThreshold < 1) {
    throw new Error('--document-threshold must be a positive integer.');
  }
  return options;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function normalizeSpanishLemma(value) {
  return value
    .replaceAll('_', ' ')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es');
}

export function parseDelimited(text, delimiter = '\t') {
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
    else if (character === delimiter) {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('ELELex TSV ends inside a quoted field.');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

export function mapElelexTag(tag) {
  const tokens = tag.split(/[,;\s]+/).filter(Boolean);
  const categories = new Set(tokens.map((token) => TAG_CATEGORIES.get(token) ?? null));
  if (tokens.length === 0 || categories.has(null)) {
    return { partOfSpeech: null, reason: 'unsupported-freeling-tag', tokens };
  }
  if (categories.size !== 1) {
    return { partOfSpeech: null, reason: 'ambiguous-composite-freeling-tag', tokens };
  }
  return { partOfSpeech: [...categories][0], reason: null, tokens };
}

export function isLexicalLemma(value) {
  const letterCount = [...value.matchAll(/\p{L}/gu)].length;
  return letterCount >= 2 && /^\p{L}[\p{L}\p{M}'’ -]*$/u.test(value);
}

export function assignLevelFromDocumentCounts(documentCount, threshold) {
  const thresholdLevel = ELELEX_LEVELS.find((level) => documentCount[level] >= threshold);
  if (thresholdLevel) {
    return {
      level: thresholdLevel,
      method: 'first-level-reaching-document-threshold',
      tiedMaximumLevels: [],
    };
  }
  return {
    level: null,
    method: 'unattested',
    tiedMaximumLevels: [],
  };
}

function numberField(row, field, sourceRow) {
  const value = Number(row[field]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`ELELex row ${sourceRow} has invalid ${field}.`);
  return value;
}

export function parseElelex(text) {
  const [headers, ...rows] = parseDelimited(text);
  if (JSON.stringify(headers) !== JSON.stringify(EXPECTED_HEADERS)) {
    throw new Error(`Unexpected ELELex headers: ${headers.join(', ')}`);
  }
  return rows.map((values, rowIndex) => {
    const sourceRow = rowIndex + 2;
    if (values.length !== headers.length) throw new Error(`ELELex row ${sourceRow} has ${values.length} fields; expected ${headers.length}.`);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    const levelFrequency = Object.fromEntries(ELELEX_LEVELS.map((level) => {
      const key = `level_freq@${level.toLocaleLowerCase('en')}`;
      return [level, numberField(row, key, sourceRow)];
    }));
    const documentCount = Object.fromEntries(ELELEX_LEVELS.map((level) => {
      const key = `nb_doc@${level.toLocaleLowerCase('en')}`;
      return [level, numberField(row, key, sourceRow)];
    }));
    for (const level of ELELEX_LEVELS) {
      if ((levelFrequency[level] > 0) !== (documentCount[level] > 0)) {
        throw new Error(`ELELex row ${sourceRow} has inconsistent frequency/document presence at ${level}.`);
      }
    }
    const level = ELELEX_LEVELS.find((candidate) => documentCount[candidate] > 0);
    if (!level) throw new Error(`ELELex row ${sourceRow} is not observed at any published CEFR level.`);
    return {
      sourceRow,
      originalWord: row.word,
      normalizedLemma: normalizeSpanishLemma(row.word),
      sourceTag: row.tag,
      level,
      levelFrequency,
      totalFrequency: numberField(row, 'total_freq@total', sourceRow),
      documentCount,
      totalDocumentCount: numberField(row, 'nb_doc@total', sourceRow),
    };
  });
}

function sourceRecord(row) {
  return {
    row: row.sourceRow,
    word: row.originalWord,
    tag: row.sourceTag,
    level: row.level,
    levelFrequency: row.levelFrequency,
    totalFrequency: row.totalFrequency,
    documentCount: row.documentCount,
    totalDocumentCount: row.totalDocumentCount,
  };
}

function countLevels(entries) {
  return Object.fromEntries([...ELELEX_LEVELS, 'C2'].map((level) => [level, entries.filter((entry) => entry.level === level).length]));
}

function firstOccurrenceDistribution(entries) {
  return countLevels(entries.map((entry) => ({ level: entry.levelAssignment.firstOccurrenceLevel })));
}

function catalogId(key) {
  return `es-cefr:${sha256(key).slice(0, 16)}`;
}

function readVerifiedOmw(archivePath) {
  const archive = readFileSync(archivePath);
  const archiveSha256 = sha256(archive);
  if (archiveSha256 !== OMW_SHA256) {
    throw new Error(`OMW Spanish archive SHA-256 mismatch: expected ${OMW_SHA256}, received ${archiveSha256}.`);
  }
  return execFileSync('tar', ['-xOf', archivePath, 'omw-es/omw-es.xml'], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8');
}

export function buildSpanishCefrCatalog(elelexRows, spanishOmw, { documentThreshold = DEFAULT_DOCUMENT_THRESHOLD } = {}) {
  const unsupportedRows = [];
  const groups = new Map();
  for (const row of elelexRows) {
    const mapping = mapElelexTag(row.sourceTag);
    if (!mapping.partOfSpeech) {
      unsupportedRows.push({
        ...sourceRecord(row),
        normalizedLemma: row.normalizedLemma,
        reason: mapping.reason,
        parsedTagTokens: mapping.tokens,
      });
      continue;
    }
    const key = `${row.normalizedLemma}\u0000${mapping.partOfSpeech}`;
    const group = groups.get(key) ?? { key, normalizedLemma: row.normalizedLemma, partOfSpeech: mapping.partOfSpeech, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  const entries = [];
  const unmatchedGroups = [];
  const nonlexicalGroups = [];
  const properNameGroups = [];
  const collapsedGroups = [];
  const joinedEntriesBeforeLexicalFilter = [];
  let joinedSourceRowsBeforeLexicalFilter = 0;
  let includedSourceRows = 0;
  for (const group of groups.values()) {
    const omwPartOfSpeech = OMW_POS.get(group.partOfSpeech);
    const matches = spanishOmw.entriesByKey.get(`${group.normalizedLemma}\u0000${omwPartOfSpeech}`) ?? [];
    const matchesWithSenses = matches.filter((entry) => entry.senses.length > 0);
    if (matchesWithSenses.length === 0) {
      unmatchedGroups.push({
        normalizedLemma: group.normalizedLemma,
        partOfSpeech: group.partOfSpeech,
        reason: matches.length === 0 ? 'no-exact-omw-lemma-and-pos' : 'omw-entry-has-no-senses',
        sourceRows: group.rows.map(sourceRecord),
      });
      continue;
    }

    joinedSourceRowsBeforeLexicalFilter += group.rows.length;
    const sortedRows = [...group.rows].sort((left, right) => {
      const byLevel = LEVEL_INDEX.get(left.level) - LEVEL_INDEX.get(right.level);
      return byLevel || left.sourceRow - right.sourceRow;
    });
    const firstOccurrenceLevel = sortedRows[0].level;
    const documentCount = Object.fromEntries(ELELEX_LEVELS.map((level) => [
      level,
      group.rows.reduce((total, row) => total + row.documentCount[level], 0),
    ]));
    const assignment = assignLevelFromDocumentCounts(documentCount, documentThreshold);
    const level = assignment.level;
    const sourceTags = [...new Set(group.rows.map((row) => row.sourceTag))].sort();
    const isLexicalTerm = isLexicalLemma(group.normalizedLemma);
    const isSourceTaggedProperName = sourceTags.some((tag) => tag === 'NP0' || tag === 'NP*');
    const missedProperName = MISSED_PROPER_NAME_EXCLUSIONS.get(group.key) ?? null;
    const senseIds = [...new Set(matchesWithSenses.flatMap((entry) => entry.senses.map((sense) => sense.senseId)))].sort();
    if (missedProperName && missedProperName.evidenceSenseIds.some((senseId) => !senseIds.includes(senseId))) {
      throw new Error(`${group.normalizedLemma}/${group.partOfSpeech}: audited proper-name evidence no longer matches pinned OMW.`);
    }
    const isProperName = isSourceTaggedProperName || missedProperName !== null;
    const isMultiwordExpression = group.normalizedLemma.includes(' ');
    const headwordNormalization = HEADWORD_NORMALIZATIONS.get(group.key) ?? null;
    const canonicalTerm = headwordNormalization?.canonicalTerm ?? group.normalizedLemma;
    const evidenceTier = level === null ? 'unattested' : 'attested';
    const courseExclusionReasons = [];
    if (evidenceTier === 'unattested') courseExclusionReasons.push('unattested');
    if (!isLexicalTerm) courseExclusionReasons.push('nonlexical-term-shape');
    if (isSourceTaggedProperName) courseExclusionReasons.push('proper-name-source-tag');
    else if (missedProperName) courseExclusionReasons.push('proper-name-semantic-audit');
    if (group.rows.length > 1) {
      collapsedGroups.push({
        normalizedLemma: group.normalizedLemma,
        partOfSpeech: group.partOfSpeech,
        selectedLevel: level,
        firstOccurrenceLevel,
        documentCount,
        assignmentMethod: assignment.method,
        tiedMaximumLevels: assignment.tiedMaximumLevels,
        sourceRows: group.rows.map(sourceRecord),
      });
    }
    const key = group.key;
    const lexicalEntryIds = [...new Set(matchesWithSenses.map((entry) => entry.lexicalEntryId))].sort();
    const entry = {
      id: catalogId(key),
      term: canonicalTerm,
      normalizedTerm: canonicalTerm,
      sourceNormalizedTerm: group.normalizedLemma,
      orthographyNormalization: headwordNormalization ? {
        sourceTerm: group.normalizedLemma,
        canonicalTerm,
        rule: headwordNormalization.rule,
      } : null,
      level,
      partOfSpeech: group.partOfSpeech,
      source: 'elelex',
      sourceVersion: 'last-modified-2020-12-04',
      sourceRows: group.rows.map((row) => row.sourceRow),
      sourceTags,
      evidenceTier,
      isMultiwordExpression,
      filters: {
        isLexicalTerm,
        isProperName,
        properNameMethod: isSourceTaggedProperName
          ? 'source-native-freeling-tag'
          : missedProperName
            ? 'omw-wordnet-semantic-audit'
            : null,
        multiPosPolicy: 'no-filter',
      },
      courseEligibility: {
        included: courseExclusionReasons.length === 0,
        exclusionReasons: courseExclusionReasons,
      },
      levelAssignment: {
        documentThreshold,
        documentCount,
        method: assignment.method,
        tiedMaximumLevels: assignment.tiedMaximumLevels,
        firstOccurrenceLevel,
      },
      omw: {
        source: 'omw-es:2.0',
        partOfSpeech: omwPartOfSpeech,
        joinNormalizedTerms: [group.normalizedLemma],
        lexicalEntryIds,
        senseIds,
      },
    };
    joinedEntriesBeforeLexicalFilter.push(entry);
    if (!isLexicalTerm) {
      nonlexicalGroups.push({
        normalizedLemma: group.normalizedLemma,
        partOfSpeech: group.partOfSpeech,
        reason: 'nonlexical-term-shape',
        sourceRows: group.rows.map(sourceRecord),
      });
    }
    if (isProperName) {
      properNameGroups.push({
        normalizedLemma: group.normalizedLemma,
        partOfSpeech: group.partOfSpeech,
        evidenceTier,
        level,
        sourceTags,
        method: isSourceTaggedProperName ? 'source-native-freeling-tag' : 'omw-wordnet-semantic-audit',
        auditEvidence: missedProperName,
        sourceRows: group.rows.map(sourceRecord),
      });
    }
    if (courseExclusionReasons.length === 0) includedSourceRows += group.rows.length;
    entries.push(entry);
  }

  entries.sort((left, right) => {
    const byLevel = (LEVEL_INDEX.get(left.level) ?? ELELEX_LEVELS.length) - (LEVEL_INDEX.get(right.level) ?? ELELEX_LEVELS.length);
    const byTerm = left.term.localeCompare(right.term, 'es', { sensitivity: 'base' });
    return byLevel || byTerm || left.partOfSpeech.localeCompare(right.partOfSpeech, 'en');
  });
  return {
    entries,
    joinedEntriesBeforeLexicalFilter,
    unsupportedRows,
    unmatchedGroups,
    nonlexicalGroups,
    properNameGroups,
    collapsedGroups,
    joinedSourceRowsBeforeLexicalFilter,
    includedSourceRows,
    candidateGroups: groups.size,
  };
}

export function runSpanishCefrBuild(argv) {
  const options = parseArgs(argv);
  const elelex = readFileSync(options.elelexPath);
  const elelexSha256 = sha256(elelex);
  if (elelexSha256 !== ELELEX_SHA256) {
    throw new Error(`ELELex SHA-256 mismatch: expected ${ELELEX_SHA256}, received ${elelexSha256}.`);
  }
  const elelexRows = parseElelex(elelex.toString('utf8'));
  const spanishOmw = parseOmw(readVerifiedOmw(options.omwArchivePath), 'es');
  const result = buildSpanishCefrCatalog(elelexRows, spanishOmw, { documentThreshold: options.documentThreshold });
  const attestedEntries = result.entries.filter((entry) => entry.evidenceTier === 'attested');
  const unattestedEntries = result.entries.filter((entry) => entry.evidenceTier === 'unattested');
  const courseEntries = result.entries.filter((entry) => entry.courseEligibility.included);
  const attestedLevelDistribution = countLevels(attestedEntries);
  const courseLevelDistribution = countLevels(courseEntries);
  const nonlexicalAttested = result.nonlexicalGroups.filter((group) => {
    const documentCount = Object.fromEntries(ELELEX_LEVELS.map((level) => [
      level,
      group.sourceRows.reduce((total, row) => total + row.documentCount[level], 0),
    ]));
    return assignLevelFromDocumentCounts(documentCount, options.documentThreshold).level !== null;
  });
  const properNameAttested = result.properNameGroups.filter((group) => group.evidenceTier === 'attested');
  const multiwordEntries = result.entries.filter((entry) => entry.isMultiwordExpression);
  const attestedMultiwordEntries = multiwordEntries.filter((entry) => entry.evidenceTier === 'attested');
  const includedMultiwordEntries = multiwordEntries.filter((entry) => entry.courseEligibility.included);
  const catalog = {
    schemaVersion: 2,
    courseId: 'es-sk',
    title: 'Frozen ELELex-derived Spanish CEFR membership',
    levels: ELELEX_LEVELS,
    counts: {
      frozenMembership: result.entries.length,
      evidenceTiers: { attested: attestedEntries.length, unattested: unattestedEntries.length },
      assignedLevels: attestedLevelDistribution,
    },
    entries: result.entries,
  };
  const catalogSha256 = sha256(canonicalJson(catalog));
  const courseCatalog = {
    schemaVersion: 1,
    courseId: 'es-sk',
    title: 'Spanish CEFR v1 course catalog',
    levels: ELELEX_LEVELS,
    evidenceThreshold: options.documentThreshold,
    sourceCatalogSha256: catalogSha256,
    counts: courseLevelDistribution,
    entries: courseEntries,
  };
  const courseCatalogSha256 = sha256(canonicalJson(courseCatalog));
  const courseOrder = buildCourseOrderSidecar(courseCatalog, courseCatalogSha256);
  const courseOrderSha256 = sha256(canonicalJson(courseOrder));
  const manifest = {
    schemaVersion: 2,
    notHumanReview: true,
    courseId: 'es-sk',
    generatedAt: new Date().toISOString(),
    catalogPath: 'assets/catalog/spanish/cefr-catalog.json',
    catalogSha256,
    courseCatalogPath: 'assets/catalog/spanish/cefr-course-catalog.json',
    courseCatalogSha256,
    courseOrderPath: 'assets/catalog/spanish/cefr-course-order.json',
    courseOrderSha256,
    attribution: ATTRIBUTION,
    levelPolicy: {
      source: 'ELELex only',
      publishedLevels: ELELEX_LEVELS,
      unavailableLevels: ['C2'],
      c2Policy: 'not-available; no entries are synthesized from the C1 tail',
      assignmentRule: 'Aggregate nb_doc independently at each CEFR level across all ELELex rows for a normalized lemma/POS. Mark the entry attested and assign the first level whose aggregate reaches the document threshold. Otherwise mark it unattested and assign no level.',
      documentThreshold: options.documentThreshold,
      unattestedLevel: null,
      fallbackAssignment: false,
      duplicateResolution: 'When multiple ELELex rows normalize to the same lemma and mapped POS, aggregate their per-level document counts before applying the same threshold rule; preserve every source row.',
      modelRescoring: false,
      cutoff: null,
      comparison: {
        firstOccurrence: firstOccurrenceDistribution(result.entries),
        attestedThreshold: attestedLevelDistribution,
        v1CourseAfterFilters: courseLevelDistribution,
      },
    },
    sequencingPolicy: courseOrder.policy,
    knownDivergences: [{
      id: 'astra-a1-level-breadth-2026-09-08',
      notHumanReview: true,
      scope: 'Blinded 200-entry AI cross-review of the immutable 1,707-entry A1 learner-content run.',
      model: { id: 'gpt-6-astra', reasoningEffort: 'medium' },
      sourceContentSha256: '5383a7a98cd218c707c850bdf88f20b943522c0782f4389418acc6cb304f3f1a',
      counts: { sample: 200, wrongSense: 0, materialDefinition: 14, materialExample: 1, wrongLevel: 82 },
      interpretation: 'The level findings are a known divergence between ELELex document-count level semantics and uncalibrated model pedagogical intuition. ELELex remains authoritative; no level assignment is changed.',
      resolution: 'Handle breadth through deterministic within-level ordering, not re-leveling or A1 sub-bands.',
    }],
    futureQualityTargeting: {
      notHumanReview: true,
      observation: 'Material-definition disagreements clustered in concrete modern everyday vocabulary, especially food, clothing, sport, and leisure; seven named cases were sushi, camiseta, pollo, bañador, partido, senderismo, and cava.',
      action: 'For A2-C1, supplement broad sampling with deterministic targeted QA in these domains instead of relying on a purely random sample.',
      limitation: 'This is a targeting signal from 14 AI-flagged A1 definitions, not a measured domain error rate.',
    },
    courseFilters: {
      attestation: `Require at least ${options.documentThreshold} ELELex documents at one published level.`,
      lexicalTermShape: 'Require at least two Unicode letters and allow only letters, combining marks, apostrophes, spaces, and hyphens.',
      properNames: 'Exclude entries with any source-native FreeLing NP0 or NP* tag plus the six pinned OMW/WordNet-backed person/place-name audit exclusions.',
      multiwordExpressions: 'Include attested multiword lexical units unless another course filter excludes them.',
      multiPosEntries: 'No filter. Each frozen lemma/POS entry is evaluated independently.',
    },
    regionalVariantPolicy: {
      status: 'sense-grouping-approved; regional-labelling-deferred',
      interimBehavior: 'Keep regional variants as independent course entries with their ELELex-derived levels and no structural linkage.',
      senseGrouping: {
        status: 'approved-for-section-4',
        evidence: 'Group entries only when their selected OMW senses resolve to the same WordNet synset/ILI.',
        groupingScope: 'sense-level',
        globalCanonicalEntryId: false,
        learningBehavior: 'Teach a shared selected-sense concept once and expose every member form for recognition and search.',
        externalLicenseRequired: false,
      },
      regionalLabelling: {
        status: 'deferred-pending-licensed-regional-source',
        primaryForm: 'Select a locale-preferred primary form at presentation time only after regional evidence is licensed.',
        deferredSources: ['GEOLEXI', 'Wiktionary/Wiktextract'],
      },
      invariants: 'Regional handling must not change ELELex membership or CEFR levels.',
    },
    headwordOrthography: {
      policy: 'Apply approved modern display spellings after the source-form OMW join. Preserve stable membership IDs, source forms, source rows, and all source senses.',
      normalizations: [...HEADWORD_NORMALIZATIONS.entries()].map(([key, value]) => {
        const [sourceTerm, partOfSpeech] = key.split('\u0000');
        return { sourceTerm, partOfSpeech, ...value };
      }),
    },
    sources: [
      {
        id: 'elelex',
        assetPath: 'assets/catalog/sources/elelex-freeling-2020-12-04.tsv',
        downloadUrl: ELELEX_URL,
        revision: ELELEX_REVISION,
        sha256: ELELEX_SHA256,
        publishedLicense: 'CC BY-NC-SA 4.0',
        permissionEvidencePath: 'docs/legal/UCLOUVAIN_ELELEX_PERMISSION.md',
        commercialPermission: 'Written permission supersedes the NonCommercial restriction for the authorized Wordfold uses.',
        shareAlikeStatus: 'The permission does not address ShareAlike; clarification is pending.',
        attribution: ATTRIBUTION,
      },
      {
        id: 'omw-es:2.0',
        downloadUrl: OMW_URL,
        version: '2.0',
        sha256: OMW_SHA256,
        license: 'CC BY 3.0',
        attribution: 'Multilingual Central Repository 3.0 (release 2016), González-Agirre, Laparra and Rigau (2012), packaged by Open Multilingual Wordnet 2.0.',
      },
    ],
    transformations: [
      'Replace ELELex underscores with spaces, normalize lemmas with NFKC, collapse whitespace, and lowercase with the Spanish locale.',
      'Map only ELELex-published FreeLing adjective, noun, adverb, and verb tags to WordNet-compatible parts of speech; same-category composite tags are accepted.',
      'Join on normalized lemma plus compatible OMW Spanish part of speech and require at least one OMW sense.',
      'Apply approved modern headword spellings only after the source-form OMW join; retain the original normalized source term and every OMW sense alias.',
      `Aggregate ELELex per-level document counts across duplicate lemma/POS rows; mark entries attested and assign the first level whose aggregate reaches ${options.documentThreshold} documents.`,
      'Retain unattested entries in the frozen membership with a null level and exclude them from course and generation inputs; do not apply a fallback level.',
      'Flag normalized terms with fewer than two Unicode letters or characters outside letters, combining marks, apostrophes, spaces, and hyphens, retaining them frozen but excluding them from the course.',
      'Exclude source-native FreeLing NP0 and NP* proper-name entries and six audited person/place-name misses from the course while retaining them frozen.',
      'Include source-backed multiword lexical units under the same attestation and course filters as single words.',
      'Apply no multi-POS filter.',
      'Apply no frequency, size, or level-distribution cutoff.',
    ],
    counts: {
      elelexSourceRows: elelexRows.length,
      unsupportedPosSourceRows: result.unsupportedRows.length,
      supportedUniqueLemmaPosCandidates: result.candidateGroups,
      joinedElelexSourceRows: result.joinedSourceRowsBeforeLexicalFilter,
      frozenUniqueLemmaPosEntries: result.entries.length,
      excludedNoOmwUniqueLemmaPosGroups: result.unmatchedGroups.length,
      collapsedDuplicateLemmaPosGroups: result.collapsedGroups.length,
      evidenceTiers: { attested: attestedEntries.length, unattested: unattestedEntries.length },
      attestedLevelDistribution,
      courseFilters: {
        nonlexicalFrozenEntries: result.nonlexicalGroups.length,
        nonlexicalAttestedEntries: nonlexicalAttested.length,
        properNameFrozenEntries: result.properNameGroups.length,
        properNameAttestedEntries: properNameAttested.length,
        multiwordFrozenEntries: multiwordEntries.length,
        multiwordAttestedEntries: attestedMultiwordEntries.length,
        multiwordIncludedEntries: includedMultiwordEntries.length,
        multiPosEntriesRemoved: 0,
      },
      courseEntries: courseEntries.length,
      courseLevelDistribution,
    },
    exclusions: {
      unsupportedPosSourceRows: result.unsupportedRows,
      noCompatibleOmwGroups: result.unmatchedGroups,
    },
    courseExclusions: {
      unattestedEntryIds: unattestedEntries.map((entry) => entry.id),
      nonlexicalGroups: result.nonlexicalGroups,
      properNameGroups: result.properNameGroups,
    },
    duplicateResolutions: result.collapsedGroups,
  };

  writeFileSync(options.catalogPath, canonicalJson(catalog));
  writeFileSync(options.courseCatalogPath, canonicalJson(courseCatalog));
  writeFileSync(options.courseOrderPath, canonicalJson(courseOrder));
  writeFileSync(options.manifestPath, canonicalJson(manifest));
  console.log(`ELELex source rows: ${elelexRows.length}`);
  console.log(`Joined source rows: ${result.joinedSourceRowsBeforeLexicalFilter}`);
  console.log(`Frozen unique lemma/POS entries: ${result.entries.length}`);
  console.log(`Unsupported POS rows: ${result.unsupportedRows.length}`);
  console.log(`No compatible OMW groups: ${result.unmatchedGroups.length}`);
  console.log(`Collapsed duplicate lemma/POS groups: ${result.collapsedGroups.length}`);
  console.log(`Evidence tiers: attested=${attestedEntries.length}, unattested=${unattestedEntries.length}`);
  console.log(`Course filters: nonlexical attested=${nonlexicalAttested.length}, proper-name attested=${properNameAttested.length}`);
  console.log(`Multiwords: frozen=${multiwordEntries.length}, attested=${attestedMultiwordEntries.length}, included=${includedMultiwordEntries.length}`);
  console.log(`Course entries: ${courseEntries.length}`);
  console.log(`Course level distribution: ${ELELEX_LEVELS.map((level) => `${level}=${courseLevelDistribution[level]}`).join(', ')}, C2=0`);
  console.log(`Frozen catalog SHA-256: ${catalogSha256}`);
  console.log(`Course catalog SHA-256: ${courseCatalogSha256}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runSpanishCefrBuild(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
