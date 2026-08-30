import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const OMW_ES_2_SHA256 = 'd8450d42885cd51f3db39fe64219a7a003eeb432b4caa00428285fe6ab224303';

export const SPANISH_A1_CATEGORY_QUOTAS = Object.freeze({
  '1': Object.freeze({ label: 'Individuo: dimensión física', count: 30 }),
  '2': Object.freeze({ label: 'Individuo: dimensión perceptiva y anímica', count: 25 }),
  '3': Object.freeze({ label: 'Identidad personal', count: 35 }),
  '4': Object.freeze({ label: 'Relaciones personales', count: 30 }),
  '5': Object.freeze({ label: 'Alimentación', count: 50 }),
  '6': Object.freeze({ label: 'Educación', count: 25 }),
  '7': Object.freeze({ label: 'Trabajo', count: 20 }),
  '8': Object.freeze({ label: 'Ocio', count: 25 }),
  '9': Object.freeze({ label: 'Información y medios de comunicación', count: 15 }),
  '10': Object.freeze({ label: 'Vivienda', count: 35 }),
  '11': Object.freeze({ label: 'Servicios', count: 20 }),
  '12': Object.freeze({ label: 'Compras, tiendas y establecimientos', count: 35 }),
  '13': Object.freeze({ label: 'Salud e higiene', count: 25 }),
  '14': Object.freeze({ label: 'Viajes, alojamiento y transporte', count: 40 }),
  '15': Object.freeze({ label: 'Economía e industria', count: 10 }),
  '16': Object.freeze({ label: 'Ciencia y tecnología', count: 10 }),
  '17': Object.freeze({ label: 'Gobierno, política y sociedad', count: 5 }),
  '18': Object.freeze({ label: 'Actividades artísticas', count: 15 }),
  '19': Object.freeze({ label: 'Religión y filosofía', count: 5 }),
  '20': Object.freeze({ label: 'Geografía y naturaleza', count: 45 }),
});

const allowedPartsOfSpeech = new Set([
  'ADJ', 'ADP', 'ADV', 'AUX', 'CCONJ', 'DET', 'INTJ', 'NOUN', 'NUM', 'PART',
  'PRON', 'PROPN', 'SCONJ', 'VERB', 'X',
]);
const genderedPartsOfSpeech = new Set(['ADJ', 'NOUN', 'PROPN']);
const allowedGenders = new Set(['common', 'feminine', 'invariant', 'masculine', 'not-applicable']);
const reviewKinds = new Set(['slovak', 'spanish']);
const reviewDecisions = new Set(['approved', 'changes-requested', 'pending', 'rejected']);
const forbiddenLearnerText = /(?:https?:\/\/|www\.|<[^>]*>|```|[\u0000-\u001f\u007f])/iu;
const sha256Pattern = /^[a-f0-9]{64}$/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Payload(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function sha256PrettyPayload(value) {
  return createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex');
}

export function normalizeSpanishTerm(value) {
  assert(typeof value === 'string', 'Spanish term must be a string.');
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es');
}

function wordCount(value) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function validateDate(value, label) {
  assert(nonEmptyString(value) && !Number.isNaN(Date.parse(value)), `${label} must be an ISO date or date-time.`);
}

function findOmwSource(manifest) {
  return manifest.sources.find((source) => source.id === 'omw-es' || source.id === 'omw-es:2.0');
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function writeJson(path, value) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
  return absolutePath;
}

export function validateSourceManifest(manifest) {
  assert(isPlainObject(manifest), 'Source manifest must be an object.');
  assert(manifest.schemaVersion === 1, 'Source manifest schemaVersion must be 1.');
  assert(Array.isArray(manifest.sources) && manifest.sources.length >= 2, 'Source manifest must contain at least PCIC and OMW sources.');

  const sourceIds = new Set();
  for (const [index, source] of manifest.sources.entries()) {
    const label = `Source ${index + 1}`;
    assert(isPlainObject(source), `${label} must be an object.`);
    for (const key of ['id', 'version', 'url', 'sha256', 'license', 'attribution', 'redistributionScope']) {
      assert(nonEmptyString(source[key]), `${label} ${key} is required.`);
    }
    const isHttpsUrl = /^https:\/\//u.test(source.url);
    const isSafeWordfoldDoc = source.id.startsWith('wordfold-')
      && /^docs\/(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u.test(source.url);
    assert(isHttpsUrl || isSafeWordfoldDoc, `${label} url must use HTTPS or a safe repo-relative docs/ path for a Wordfold source.`);
    assert(sha256Pattern.test(source.sha256), `${label} sha256 must be a lowercase 64-character SHA-256.`);
    assert(Array.isArray(source.transformations) && source.transformations.length > 0, `${label} transformations must be a non-empty array.`);
    assert(source.transformations.every(nonEmptyString), `${label} transformations must contain only non-empty strings.`);
    assert(!sourceIds.has(source.id), `${source.id}: duplicate source ID.`);
    sourceIds.add(source.id);
  }

  const pcicSource = manifest.sources.find((source) => /pcic|plan-curricular/iu.test(source.id));
  assert(pcicSource, 'Source manifest must record the PCIC framework permission.');
  assert(/permission|framework|reference/iu.test(`${pcicSource.license} ${pcicSource.redistributionScope}`), 'PCIC source must describe its permission/framework-only scope.');

  const omwSource = findOmwSource(manifest);
  assert(omwSource, 'Source manifest must contain the omw-es version 2.0 source.');
  assert(omwSource.version === '2.0', 'OMW Spanish source version must be 2.0.');
  assert(omwSource.url === 'https://github.com/omwn/omw-data/releases/download/v2.0/omw-es-2.0.tar.xz', 'OMW Spanish release URL is not the pinned v2.0 asset.');
  assert(omwSource.sha256 === OMW_ES_2_SHA256, 'OMW Spanish archive SHA-256 does not match the pinned release.');
  assert(/(?:CC BY 3\.0|Creative Commons Attribution 3\.0)/iu.test(omwSource.license), 'OMW Spanish license must be recorded as CC BY 3.0.');

  return {
    sourceManifestSha256: sha256Payload(manifest),
    sourceIds,
    omwSourceId: omwSource.id,
  };
}

function validateCategoryQuotas(categoryQuotas) {
  assert(isPlainObject(categoryQuotas), 'categoryQuotas must be an object keyed by PCIC classification ID.');
  const expectedIds = Object.keys(SPANISH_A1_CATEGORY_QUOTAS);
  assert(Object.keys(categoryQuotas).length === expectedIds.length, 'categoryQuotas must contain exactly the 20 approved classifications.');
  for (const id of expectedIds) {
    const expected = SPANISH_A1_CATEGORY_QUOTAS[id];
    const actual = categoryQuotas[id];
    assert(isPlainObject(actual), `Category quota ${id} is missing.`);
    assert(actual.label === expected.label, `Category quota ${id} label must be “${expected.label}”.`);
    assert(actual.count === expected.count, `Category quota ${id} must be exactly ${expected.count}.`);
  }
  const total = Object.values(categoryQuotas).reduce((sum, quota) => sum + quota.count, 0);
  assert(total === 500, `Category quota total must be exactly 500; received ${total}.`);
}

function validateAlternativeForms(forms, label) {
  assert(Array.isArray(forms), `${label} alternativeForms must be an array.`);
  for (const form of forms) {
    assert(isPlainObject(form) && nonEmptyString(form.form) && nonEmptyString(form.type), `${label} alternative forms require form and type.`);
    assert(!forbiddenLearnerText.test(form.form), `${label} alternative form contains forbidden text.`);
  }
}

function evidenceIdentity(evidence) {
  if (evidence.type === 'omw') return `${evidence.synsetId}|${evidence.senseId}`;
  return `original-editorial|${evidence.rationale}`;
}

function omwPartOfSpeech(partOfSpeech) {
  return ({ ADJ: 'a', ADV: 'r', NOUN: 'n', VERB: 'v' })[partOfSpeech] ?? null;
}

export function validateLexicalEvidenceSidecar(sidecar, dataset, sourceManifest) {
  assert(isPlainObject(sidecar), 'Lexical evidence sidecar must be an object.');
  assert(sidecar.schemaVersion === 1, 'Lexical evidence schemaVersion must be 1.');
  assert(sidecar.courseId === 'es-sk' && sidecar.level === 'A1', 'Lexical evidence course/level is invalid.');
  assert(sidecar.publicationStatus === 'draft', 'Lexical evidence must remain draft.');
  const candidateHashes = new Set([sha256Payload(dataset), sha256PrettyPayload(dataset)]);
  assert(candidateHashes.has(sidecar.candidatesSha256), 'Lexical evidence has a stale candidate hash.');
  const { omwSourceId, sourceIds } = validateSourceManifest(sourceManifest);
  const originalSource = sourceManifest.sources.find((source) => source.id === 'wordfold-original-spanish-a1');
  assert(isPlainObject(sidecar.source), 'Lexical evidence source metadata is required.');
  assert(sidecar.source.id === omwSourceId, 'Lexical evidence source ID does not match the source manifest.');
  assert(sidecar.source.version === '2.0', 'Lexical evidence source version must be 2.0.');
  assert(sidecar.source.archiveSha256 === OMW_ES_2_SHA256, 'Lexical evidence archive SHA-256 is not pinned to OMW Spanish 2.0.');
  assert(nonEmptyString(sidecar.source.license) && nonEmptyString(sidecar.source.attribution), 'Lexical evidence license and attribution are required.');
  assert(Array.isArray(sidecar.entries), 'Lexical evidence entries must be an array.');
  assert(sidecar.entries.length === dataset.entries.length, `Lexical evidence must contain exactly ${dataset.entries.length} records.`);

  const candidatesById = new Map(dataset.entries.map((entry) => [entry.id, entry]));
  const recordsByCandidateId = new Map();
  let exactMatches = 0;
  for (const record of sidecar.entries) {
    assert(isPlainObject(record), 'Lexical evidence record must be an object.');
    const candidate = candidatesById.get(record.candidateId);
    assert(candidate && candidate.catalogSenseId === record.catalogSenseId, `${record.candidateId ?? 'unknown'}: lexical evidence identity does not match a candidate.`);
    assert(!recordsByCandidateId.has(record.candidateId), `${record.candidateId}: duplicate lexical evidence record.`);
    assert(record.term === candidate.term && record.normalizedTerm === candidate.normalizedTerm, `${record.candidateId}: lexical evidence term identity changed.`);
    assert(record.candidatePartOfSpeech === candidate.partOfSpeech || String(record.candidatePartOfSpeech).toUpperCase() === candidate.partOfSpeech, `${record.candidateId}: lexical evidence POS changed.`);
    assert(Array.isArray(record.candidateSenses), `${record.candidateId}: candidateSenses must be an array.`);
    const expectedOmwPos = omwPartOfSpeech(candidate.partOfSpeech);
    const senseIds = new Set();
    for (const sense of record.candidateSenses) {
      assert(isPlainObject(sense), `${record.candidateId}: offered OMW sense must be an object.`);
      for (const key of ['lexicalEntryId', 'writtenForm', 'partOfSpeech', 'senseId', 'synsetId']) {
        assert(nonEmptyString(sense[key]), `${record.candidateId}: offered OMW sense ${key} is required.`);
      }
      assert(normalizeSpanishTerm(sense.writtenForm) === candidate.normalizedTerm, `${record.candidateId}: offered OMW lemma is not an exact normalized match.`);
      assert(expectedOmwPos && sense.partOfSpeech === expectedOmwPos, `${record.candidateId}: offered OMW POS is not compatible.`);
      assert(!senseIds.has(sense.senseId), `${record.candidateId}: duplicate offered OMW sense.`);
      senseIds.add(sense.senseId);
    }
    if (record.candidateSenses.length > 0) {
      exactMatches += 1;
      assert(record.sourceId === omwSourceId && record.sourceVersion === '2.0', `${record.candidateId}: matched evidence must reference pinned OMW Spanish 2.0.`);
    } else {
      assert(
        record.sourceId === 'wordfold-original-spanish-a1' && sourceIds.has(record.sourceId),
        `${record.candidateId}: unmatched evidence must use the manifest's original-editorial source.`,
      );
      assert(originalSource && record.sourceVersion === originalSource.version, `${record.candidateId}: original-editorial source version does not match the manifest.`);
      assert(nonEmptyString(record.exceptionRationale), `${record.candidateId}: unmatched evidence requires an editorial exception rationale.`);
    }
    assert(record.selectedSenseId === null || senseIds.has(record.selectedSenseId), `${record.candidateId}: selectedSenseId is not one of the offered OMW senses.`);
    assert(record.requiresSpanishSenseSelection === (record.candidateSenses.length > 1), `${record.candidateId}: sense-selection flag is inconsistent.`);
    recordsByCandidateId.set(record.candidateId, record);
  }

  assert(exactMatches >= 400, `At least 400 candidates must have exact OMW lemma/POS evidence; received ${exactMatches}.`);
  assert(isPlainObject(sidecar.coverage), 'Lexical evidence coverage metadata is required.');
  assert(sidecar.coverage.entries === dataset.entries.length, 'Lexical evidence coverage entry count is inconsistent.');
  assert(sidecar.coverage.exactLemmaAndPosMatches === exactMatches, 'Lexical evidence coverage match count is inconsistent.');
  assert(Math.abs(sidecar.coverage.exactLemmaAndPosRatio - (exactMatches / dataset.entries.length)) < Number.EPSILON, 'Lexical evidence coverage ratio is inconsistent.');
  assert(sidecar.coverage.targetRatio === 0.8, 'Lexical evidence target ratio must be 0.8.');

  return { exactMatches, recordsByCandidateId, sidecarSha256: sha256Payload(sidecar) };
}

function validateCandidateEntry(entry, index, sourceIds, omwSourceId, sidecarRecord) {
  const label = `Candidate ${index + 1}`;
  assert(isPlainObject(entry), `${label} must be an object.`);
  for (const key of [
    'id', 'catalogSenseId', 'term', 'normalizedTerm', 'displayPartOfSpeech', 'definition',
    'example', 'exampleSurfaceForm', 'translation', 'levelRationale', 'authoringBatch',
    'sourceVersion', 'originalContentDeclaration',
  ]) {
    assert(nonEmptyString(entry[key]), `${label} ${key} is required.`);
  }
  assert(entry.id.startsWith('es-sk:a1:'), `${label} id must begin with es-sk:a1:.`);
  assert(entry.catalogSenseId.startsWith('es-sk:a1:'), `${label} catalogSenseId must begin with es-sk:a1:.`);
  assert(entry.level === 'A1', `${label} level must be A1.`);
  assert(entry.publicationStatus === 'draft', `${label} publicationStatus must be draft.`);
  assert(entry.originalContent === true, `${label} originalContent must be true.`);
  assert(!/\b(?:copied|reproduced)\s+from\s+(?:the\s+)?pcic\b/iu.test(entry.originalContentDeclaration), `${label} original-content declaration is inconsistent.`);

  const expectedNormalizedTerm = normalizeSpanishTerm(entry.term);
  assert(entry.term === entry.term.normalize('NFC').trim(), `${label} term must be trimmed NFC text.`);
  assert(entry.normalizedTerm === expectedNormalizedTerm, `${label} normalizedTerm does not match deterministic Spanish normalization.`);
  assert(!forbiddenLearnerText.test(entry.term), `${label} term contains forbidden text.`);

  assert(allowedPartsOfSpeech.has(entry.partOfSpeech), `${label} partOfSpeech is not a controlled universal POS.`);
  assert(allowedGenders.has(entry.gender), `${label} gender is invalid.`);
  if (genderedPartsOfSpeech.has(entry.partOfSpeech)) {
    assert(entry.gender !== 'not-applicable', `${label} noun/adjective gender must be explicit.`);
  } else {
    assert(entry.gender === 'not-applicable', `${label} gender must be not-applicable for ${entry.partOfSpeech}.`);
  }
  assert(typeof entry.isReflexiveVerb === 'boolean', `${label} isReflexiveVerb must be boolean.`);
  assert(typeof entry.isMultiwordExpression === 'boolean', `${label} isMultiwordExpression must be boolean.`);
  assert(entry.isMultiwordExpression === /\s/u.test(entry.normalizedTerm), `${label} multiword-expression status does not match the term.`);
  if (entry.isReflexiveVerb) {
    assert(entry.partOfSpeech === 'VERB' && /se$/u.test(entry.normalizedTerm), `${label} reflexive verbs must be VERB lemmas ending in se.`);
  }
  if (entry.partOfSpeech === 'VERB' && /se$/u.test(entry.normalizedTerm)) {
    assert(entry.isReflexiveVerb, `${label} verb ending in se must declare reflexive identity.`);
  }
  validateAlternativeForms(entry.alternativeForms, label);

  for (const [key, minimum, maximum] of [
    ['definition', 3, 24],
    ['example', 4, 24],
    ['translation', 1, 12],
  ]) {
    const count = wordCount(entry[key]);
    assert(count >= minimum && count <= maximum, `${label} ${key} must contain ${minimum}-${maximum} words.`);
    assert(entry[key] === entry[key].normalize('NFC').trim(), `${label} ${key} must be trimmed NFC text.`);
    assert(!forbiddenLearnerText.test(entry[key]), `${label} ${key} contains URLs, markup, or control characters.`);
  }
  const normalizedDefinition = normalizeSpanishTerm(entry.definition).replace(/[.,;:!?¡¿()]/gu, ' ');
  const normalizedTermPattern = new RegExp(`(?:^|\\s)${entry.normalizedTerm.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|\\s)`, 'u');
  assert(!normalizedTermPattern.test(normalizedDefinition), `${label} definition is circular.`);
  assert(normalizeSpanishTerm(entry.example).includes(normalizeSpanishTerm(entry.exampleSurfaceForm)), `${label} example does not contain exampleSurfaceForm.`);

  assert(isPlainObject(entry.pcicClassification), `${label} pcicClassification is required.`);
  const category = SPANISH_A1_CATEGORY_QUOTAS[String(entry.pcicClassification.id)];
  assert(category && entry.pcicClassification.label === category.label, `${label} PCIC classification is invalid.`);
  assert(Array.isArray(entry.secondaryClassifications), `${label} secondaryClassifications must be an array.`);
  assert(entry.secondaryClassifications.every((id) => String(id) in SPANISH_A1_CATEGORY_QUOTAS), `${label} has an invalid secondary classification.`);
  assert(/^batch-[1-5]$/u.test(entry.authoringBatch), `${label} authoringBatch must be batch-1 through batch-5.`);

  if (entry.lexicalEvidence === null) {
    assert(sidecarRecord, `${label} lexicalEvidence may be null only with a matching evidence sidecar.`);
  } else if (isPlainObject(entry.lexicalEvidence) && entry.lexicalEvidence.type === 'omw') {
    const evidence = entry.lexicalEvidence;
    assert(evidence.sourceId === omwSourceId && sourceIds.has(evidence.sourceId), `${label} OMW evidence must reference the pinned source.`);
    assert(evidence.sourceVersion === '2.0', `${label} OMW evidence sourceVersion must be 2.0.`);
    for (const key of ['lemma', 'senseId', 'synsetId']) assert(nonEmptyString(evidence[key]), `${label} OMW ${key} is required.`);
    assert(Number.isInteger(evidence.confidence) && evidence.confidence >= 50 && evidence.confidence <= 99, `${label} OMW confidence must be an integer from 50 to 99.`);
  } else if (isPlainObject(entry.lexicalEvidence) && entry.lexicalEvidence.type === 'original-editorial') {
    assert(entry.lexicalEvidence.sourceId === 'wordfold-original-spanish-a1' && sourceIds.has(entry.lexicalEvidence.sourceId), `${label} original-editorial evidence must reference the manifest source.`);
    assert(nonEmptyString(entry.lexicalEvidence.sourceVersion), `${label} original-editorial sourceVersion is required.`);
    assert(nonEmptyString(entry.lexicalEvidence.rationale), `${label} original-editorial evidence requires a rationale.`);
    assert(!Object.hasOwn(entry.lexicalEvidence, 'synsetId') && !Object.hasOwn(entry.lexicalEvidence, 'iliId'), `${label} original-editorial evidence must not invent WordNet identities.`);
  } else {
    throw new Error(`${label} lexicalEvidence must be null with a matching sidecar, omw, or original-editorial.`);
  }
}

export function validateCandidateDataset(dataset, sourceManifest, lexicalEvidence = null) {
  const { sourceIds, omwSourceId } = validateSourceManifest(sourceManifest);
  assert(isPlainObject(dataset), 'Candidate dataset must be an object.');
  assert(dataset.schemaVersion === 1, 'Candidate schemaVersion must be 1.');
  assert(dataset.courseId === 'es-sk', 'Candidate courseId must be es-sk.');
  assert(dataset.level === 'A1', 'Candidate dataset level must be A1.');
  assert(dataset.publicationStatus === 'draft', 'Candidate dataset must remain draft.');
  assert(dataset.targetEntries === 500, 'Candidate targetEntries must be exactly 500.');
  validateCategoryQuotas(dataset.categoryQuotas);
  assert(Array.isArray(dataset.entries), 'Candidate entries must be an array.');
  assert(dataset.entries.length === 500, `Candidate dataset must contain exactly 500 candidates; received ${dataset.entries.length}.`);
  const sidecarValidation = lexicalEvidence
    ? validateLexicalEvidenceSidecar(lexicalEvidence, dataset, sourceManifest)
    : null;

  const ids = new Set();
  const senseIds = new Set();
  const definitions = new Set();
  const examples = new Set();
  const categoryCounts = Object.fromEntries(Object.keys(SPANISH_A1_CATEGORY_QUOTAS).map((id) => [id, 0]));
  const batchCounts = Object.fromEntries([1, 2, 3, 4, 5].map((batch) => [`batch-${batch}`, 0]));
  const homographs = new Map();
  let omwGroundedEntries = 0;

  for (const [index, entry] of dataset.entries.entries()) {
    const sidecarRecord = sidecarValidation?.recordsByCandidateId.get(entry.id) ?? null;
    validateCandidateEntry(entry, index, sourceIds, omwSourceId, sidecarRecord);
    assert(!ids.has(entry.id), `${entry.id}: duplicate candidate ID.`);
    assert(!senseIds.has(entry.catalogSenseId), `${entry.catalogSenseId}: duplicate catalog sense ID.`);
    ids.add(entry.id);
    senseIds.add(entry.catalogSenseId);

    const normalizedDefinition = normalizeSpanishTerm(entry.definition);
    const normalizedExample = normalizeSpanishTerm(entry.example);
    assert(!definitions.has(normalizedDefinition), `${entry.id}: duplicate definition.`);
    assert(!examples.has(normalizedExample), `${entry.id}: duplicate example.`);
    definitions.add(normalizedDefinition);
    examples.add(normalizedExample);

    const categoryId = String(entry.pcicClassification.id);
    categoryCounts[categoryId] += 1;
    batchCounts[entry.authoringBatch] += 1;
    if (entry.lexicalEvidence?.type === 'omw' || (sidecarRecord?.candidateSenses.length ?? 0) > 0) omwGroundedEntries += 1;

    const sameTerm = homographs.get(entry.normalizedTerm) ?? [];
    for (const previous of sameTerm) {
      if (previous.partOfSpeech === entry.partOfSpeech && previous.lexicalEvidence && entry.lexicalEvidence) {
        assert(evidenceIdentity(previous.lexicalEvidence) !== evidenceIdentity(entry.lexicalEvidence), `${entry.normalizedTerm}: homographs must have distinct POS or sense evidence.`);
      }
    }
    sameTerm.push(entry);
    homographs.set(entry.normalizedTerm, sameTerm);
  }

  for (const [id, expected] of Object.entries(SPANISH_A1_CATEGORY_QUOTAS)) {
    assert(categoryCounts[id] === expected.count, `Category ${id} must contain exactly ${expected.count} candidates; received ${categoryCounts[id]}.`);
  }
  for (const [batch, count] of Object.entries(batchCounts)) {
    assert(count === 100, `${batch} must contain exactly 100 candidates; received ${count}.`);
  }
  assert(omwGroundedEntries >= 400, `At least 400 candidates must have OMW grounding; received ${omwGroundedEntries}.`);

  return {
    candidateSha256: sha256Payload(dataset),
    entries: dataset.entries.length,
    omwGroundedEntries,
    originalEditorialEntries: dataset.entries.length - omwGroundedEntries,
    lexicalEvidenceSha256: sidecarValidation?.sidecarSha256 ?? null,
    categoryCounts,
    batchCounts,
  };
}

function evidenceForEntry(entry, sidecarValidation) {
  if (entry.lexicalEvidence) return entry.lexicalEvidence;
  return sidecarValidation?.recordsByCandidateId.get(entry.id) ?? null;
}

function offeredSenseIds(entry, sidecarValidation) {
  const evidence = evidenceForEntry(entry, sidecarValidation);
  if (evidence?.type === 'omw') return [evidence.senseId];
  return Array.isArray(evidence?.candidateSenses) ? evidence.candidateSenses.map((sense) => sense.senseId) : [];
}

function reviewSubjects(dataset, kind, sidecarValidation) {
  return dataset.entries.map((entry) => {
    const common = {
      entryId: entry.id,
      catalogSenseId: entry.catalogSenseId,
      term: entry.term,
      partOfSpeech: entry.partOfSpeech,
      displayPartOfSpeech: entry.displayPartOfSpeech,
      definition: entry.definition,
      example: entry.example,
      pcicClassification: entry.pcicClassification,
    };
    return kind === 'spanish'
      ? {
          ...common,
          level: entry.level,
          levelRationale: entry.levelRationale,
          lexicalEvidence: evidenceForEntry(entry, sidecarValidation),
        }
      : { ...common, translation: entry.translation };
  });
}

export function createReviewTemplate(dataset, kind, lexicalEvidence = null, sourceManifest = null) {
  assert(reviewKinds.has(kind), 'Review kind must be spanish or slovak.');
  const candidateSha256 = sha256Payload(dataset);
  const sidecarValidation = lexicalEvidence
    ? validateLexicalEvidenceSidecar(lexicalEvidence, dataset, sourceManifest)
    : null;
  return {
    schemaVersion: 1,
    courseId: 'es-sk',
    level: 'A1',
    reviewKind: kind,
    candidateSha256,
    reviewerId: '',
    qualification: '',
    attestation: '',
    reviewedAt: '',
    lexicalEvidenceSha256: sidecarValidation?.sidecarSha256 ?? null,
    subjects: reviewSubjects(dataset, kind, sidecarValidation),
    decisions: dataset.entries.map((entry) => ({
      entryId: entry.id,
      catalogSenseId: entry.catalogSenseId,
      decision: 'pending',
      notes: '',
      ...(kind === 'spanish' ? {
        selectedSenseId: null,
        originalEditorialExceptionApproved: false,
      } : {}),
    })),
  };
}

export function prepareReviewTemplates({ sourceManifest, candidates, lexicalEvidence = null, spanishOutputPath, slovakOutputPath }) {
  const validation = validateCandidateDataset(candidates, sourceManifest, lexicalEvidence);
  assert(nonEmptyString(spanishOutputPath) && nonEmptyString(slovakOutputPath), 'Both caller-selected review output paths are required.');
  assert(resolve(spanishOutputPath) !== resolve(slovakOutputPath), 'Spanish and Slovak review outputs must be separate files.');
  const spanish = createReviewTemplate(candidates, 'spanish', lexicalEvidence, sourceManifest);
  const slovak = createReviewTemplate(candidates, 'slovak', lexicalEvidence, sourceManifest);
  assert(spanish.candidateSha256 === validation.candidateSha256 && slovak.candidateSha256 === validation.candidateSha256, 'Review templates are not bound to the candidate payload.');
  return {
    candidateSha256: validation.candidateSha256,
    spanishOutputPath: writeJson(spanishOutputPath, spanish),
    slovakOutputPath: writeJson(slovakOutputPath, slovak),
  };
}

export function validateReview(review, dataset, expectedKind, options = {}) {
  const { allowTemplate = false, lexicalEvidence = null, sourceManifest = null } = options;
  const sidecarValidation = lexicalEvidence
    ? validateLexicalEvidenceSidecar(lexicalEvidence, dataset, sourceManifest)
    : null;
  assert(isPlainObject(review), `${expectedKind} review must be an object.`);
  assert(review.schemaVersion === 1, `${expectedKind} review schemaVersion must be 1.`);
  assert(review.courseId === 'es-sk' && review.level === 'A1', `${expectedKind} review course/level is invalid.`);
  assert(review.reviewKind === expectedKind, `Expected ${expectedKind} review, received ${review.reviewKind}.`);
  assert(review.candidateSha256 === sha256Payload(dataset), `${expectedKind} review has a stale candidate hash.`);
  assert(
    review.lexicalEvidenceSha256 === (sidecarValidation?.sidecarSha256 ?? null),
    `${expectedKind} review has a stale lexical-evidence hash.`,
  );

  if (allowTemplate) {
    for (const key of ['reviewerId', 'qualification', 'attestation', 'reviewedAt']) {
      assert(typeof review[key] === 'string', `${expectedKind} review ${key} must be a string.`);
    }
  } else {
    for (const key of ['reviewerId', 'qualification', 'attestation']) {
      assert(nonEmptyString(review[key]), `${expectedKind} review ${key} is required.`);
    }
    validateDate(review.reviewedAt, `${expectedKind} review reviewedAt`);
  }

  assert(Array.isArray(review.decisions), `${expectedKind} review decisions must be an array.`);
  assert(review.decisions.length === dataset.entries.length, `${expectedKind} review is incomplete: expected ${dataset.entries.length} decisions, received ${review.decisions.length}.`);
  const expectedBySense = new Map(dataset.entries.map((entry) => [entry.catalogSenseId, entry]));
  const seen = new Set();
  const counts = { approved: 0, 'changes-requested': 0, pending: 0, rejected: 0 };
  for (const decision of review.decisions) {
    assert(isPlainObject(decision), `${expectedKind} review decision must be an object.`);
    const expected = expectedBySense.get(decision.catalogSenseId);
    assert(expected && expected.id === decision.entryId, `${expectedKind} review contains an unknown or mismatched candidate sense.`);
    assert(!seen.has(decision.catalogSenseId), `${expectedKind} review contains a duplicate candidate sense.`);
    seen.add(decision.catalogSenseId);
    assert(reviewDecisions.has(decision.decision), `${expectedKind} review decision is invalid.`);
    assert(typeof decision.notes === 'string', `${expectedKind} review decision notes must be a string.`);
    if (decision.decision === 'changes-requested' || decision.decision === 'rejected') {
      assert(nonEmptyString(decision.notes), `${expectedKind} ${decision.decision} decisions require notes.`);
    }
    if (expectedKind === 'spanish') {
      assert(decision.selectedSenseId === null || nonEmptyString(decision.selectedSenseId), 'Spanish selectedSenseId must be a string or null.');
      assert(typeof decision.originalEditorialExceptionApproved === 'boolean', 'Spanish originalEditorialExceptionApproved must be a boolean.');
      const offered = offeredSenseIds(expected, sidecarValidation);
      if (decision.selectedSenseId !== null) {
        assert(offered.includes(decision.selectedSenseId), `${expected.id}: Spanish review selected a sense that was not offered.`);
      }
      if (!allowTemplate && decision.decision === 'approved') {
        const selectedOfferedSense = decision.selectedSenseId !== null;
        const approvedException = decision.originalEditorialExceptionApproved;
        assert(
          selectedOfferedSense !== approvedException,
          `${expected.id}: Spanish approval must select one offered OMW sense or explicitly approve an original-editorial exception.`,
        );
        if (approvedException) {
          const evidence = evidenceForEntry(expected, sidecarValidation);
          assert(offered.length === 0, `${expected.id}: original-editorial exception cannot replace an offered OMW sense.`);
          assert(
            evidence?.type === 'original-editorial' || nonEmptyString(evidence?.exceptionRationale),
            `${expected.id}: original-editorial exception has no evidence rationale.`,
          );
        }
      }
    }
    counts[decision.decision] += 1;
  }
  if (!allowTemplate) assert(counts.pending === 0, `${expectedKind} review is incomplete: pending decisions remain.`);
  return counts;
}

export function validateAdjudications(adjudications, dataset, options = {}) {
  const { allowUnresolved = false } = options;
  assert(isPlainObject(adjudications), 'Adjudications must be an object.');
  assert(adjudications.schemaVersion === 1, 'Adjudication schemaVersion must be 1.');
  assert(adjudications.candidateSha256 === sha256Payload(dataset), 'Adjudications have a stale candidate hash.');
  assert(Array.isArray(adjudications.adjudications), 'Adjudications must contain an adjudications array.');
  const candidatesBySense = new Map(dataset.entries.map((entry) => [entry.catalogSenseId, entry]));
  const ids = new Set();
  let unresolved = 0;
  for (const adjudication of adjudications.adjudications) {
    assert(isPlainObject(adjudication), 'Each adjudication must be an object.');
    for (const key of ['id', 'entryId', 'catalogSenseId', 'reviewKind', 'field', 'reason', 'adjudicatorId', 'decidedAt', 'status']) {
      assert(nonEmptyString(adjudication[key]), `Adjudication ${key} is required.`);
    }
    assert(!ids.has(adjudication.id), `${adjudication.id}: duplicate adjudication ID.`);
    ids.add(adjudication.id);
    const candidate = candidatesBySense.get(adjudication.catalogSenseId);
    assert(candidate && candidate.id === adjudication.entryId, `${adjudication.id}: unknown or mismatched candidate sense.`);
    assert(reviewKinds.has(adjudication.reviewKind), `${adjudication.id}: invalid review kind.`);
    assert(Object.hasOwn(adjudication, 'before') && Object.hasOwn(adjudication, 'after'), `${adjudication.id}: before and after values are required.`);
    validateDate(adjudication.decidedAt, `${adjudication.id} decidedAt`);
    assert(adjudication.status === 'resolved' || adjudication.status === 'pending', `${adjudication.id}: status must be resolved or pending.`);
    if (adjudication.status !== 'resolved') unresolved += 1;
  }
  if (!allowUnresolved) assert(unresolved === 0, `Compilation refused: ${unresolved} unresolved adjudication(s) remain.`);
  return { total: adjudications.adjudications.length, unresolved };
}

export function scoreReviews({ sourceManifest, candidates, lexicalEvidence = null, spanishReview, slovakReview, adjudications }) {
  validateCandidateDataset(candidates, sourceManifest, lexicalEvidence);
  const reviewOptions = { allowTemplate: true, lexicalEvidence, sourceManifest };
  const spanish = validateReview(spanishReview, candidates, 'spanish', reviewOptions);
  const slovak = validateReview(slovakReview, candidates, 'slovak', reviewOptions);
  const adjudication = adjudications
    ? validateAdjudications(adjudications, candidates, { allowUnresolved: true })
    : { total: 0, unresolved: 0 };
  const spanishReviewer = spanishReview.reviewerId.trim();
  const slovakReviewer = slovakReview.reviewerId.trim();
  return {
    candidateSha256: sha256Payload(candidates),
    entries: candidates.entries.length,
    spanish,
    slovak,
    reviewersDistinct: Boolean(spanishReviewer && slovakReviewer)
      && spanishReviewer.toLocaleLowerCase('en') !== slovakReviewer.toLocaleLowerCase('en'),
    adjudications: adjudication,
  };
}

function resolveLexicalEvidence(entry, decision, sidecarValidation) {
  if (entry.lexicalEvidence?.type === 'omw') {
    assert(decision.selectedSenseId === entry.lexicalEvidence.senseId, `${entry.id}: approved OMW sense does not match inline evidence.`);
    return entry.lexicalEvidence;
  }
  if (entry.lexicalEvidence?.type === 'original-editorial') return entry.lexicalEvidence;

  const record = sidecarValidation?.recordsByCandidateId.get(entry.id);
  assert(record, `${entry.id}: compilation found unresolved/null lexical evidence.`);
  if (decision.selectedSenseId !== null) {
    const selected = record.candidateSenses.find((sense) => sense.senseId === decision.selectedSenseId);
    assert(selected, `${entry.id}: compilation found an unoffered OMW sense selection.`);
    return {
      type: 'omw',
      sourceId: record.sourceId,
      sourceVersion: record.sourceVersion,
      lemma: selected.writtenForm,
      lexicalEntryId: selected.lexicalEntryId,
      senseId: selected.senseId,
      synsetId: selected.synsetId,
    };
  }
  assert(
    decision.originalEditorialExceptionApproved && nonEmptyString(record.exceptionRationale),
    `${entry.id}: compilation found unresolved/null lexical evidence.`,
  );
  return {
    type: 'original-editorial',
    sourceId: 'wordfold-original-spanish-a1',
    rationale: record.exceptionRationale,
    approvedBy: 'spanish-review',
  };
}

export function compileApprovedCatalog({ sourceManifest, candidates, lexicalEvidence = null, spanishReview, slovakReview, adjudications }) {
  const sourceValidation = validateSourceManifest(sourceManifest);
  const candidateValidation = validateCandidateDataset(candidates, sourceManifest, lexicalEvidence);
  const sidecarValidation = lexicalEvidence
    ? validateLexicalEvidenceSidecar(lexicalEvidence, candidates, sourceManifest)
    : null;
  const reviewOptions = { lexicalEvidence, sourceManifest };
  const spanish = validateReview(spanishReview, candidates, 'spanish', reviewOptions);
  const slovak = validateReview(slovakReview, candidates, 'slovak', reviewOptions);
  assert(
    spanishReview.reviewerId.trim().toLocaleLowerCase('en') !== slovakReview.reviewerId.trim().toLocaleLowerCase('en'),
    'Compilation refused: Spanish and Slovak reviewers must be distinct people.',
  );
  for (const [kind, counts] of [['Spanish', spanish], ['Slovak', slovak]]) {
    assert(counts.rejected === 0, `Compilation refused: ${kind} review contains rejected decisions.`);
    assert(counts['changes-requested'] === 0, `Compilation refused: ${kind} review contains requested changes requiring adjudication and renewed approval.`);
    assert(counts.pending === 0 && counts.approved === candidates.entries.length, `Compilation refused: ${kind} review is incomplete.`);
  }
  const adjudicationValidation = validateAdjudications(adjudications, candidates);
  const spanishDecisionsBySense = new Map(spanishReview.decisions.map((decision) => [decision.catalogSenseId, decision]));
  const resolvedEntries = candidates.entries.map((entry) => ({
    ...entry,
    lexicalEvidence: resolveLexicalEvidence(entry, spanishDecisionsBySense.get(entry.catalogSenseId), sidecarValidation),
    learnerContentReviewStatus: 'approved',
    hintReviewStatus: 'approved',
  }));
  const homographEvidence = new Map();
  for (const entry of resolvedEntries) {
    assert(entry.lexicalEvidence, `${entry.id}: compilation found unresolved/null lexical evidence.`);
    if (entry.lexicalEvidence.type !== 'omw') continue;
    const identity = `${entry.normalizedTerm}|${entry.partOfSpeech}|${entry.lexicalEvidence.senseId}`;
    assert(!homographEvidence.has(identity), `${entry.normalizedTerm}: approved homographs selected the same OMW sense.`);
    homographEvidence.set(identity, entry.id);
  }

  return {
    schemaVersion: 1,
    courseId: 'es-sk',
    level: 'A1',
    publicationStatus: 'reviewed-draft',
    releaseEligibility: 'promotion-candidate',
    entries: resolvedEntries,
    evidence: {
      sourceManifestSha256: sourceValidation.sourceManifestSha256,
      candidateSha256: candidateValidation.candidateSha256,
      lexicalEvidenceSha256: candidateValidation.lexicalEvidenceSha256,
      spanishReviewSha256: sha256Payload(spanishReview),
      slovakReviewSha256: sha256Payload(slovakReview),
      adjudicationsSha256: sha256Payload(adjudications),
      spanishReviewerId: spanishReview.reviewerId,
      slovakReviewerId: slovakReview.reviewerId,
      spanishReviewedAt: spanishReview.reviewedAt,
      slovakReviewedAt: slovakReview.reviewedAt,
      resolvedAdjudications: adjudicationValidation.total,
    },
  };
}

function parseOptions(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    assert(argument.startsWith('--'), `Unknown argument: ${argument}`);
    const key = argument.slice(2);
    const value = arguments_[index + 1];
    assert(value && !value.startsWith('--'), `${argument} requires a value.`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function requireOption(options, key) {
  assert(nonEmptyString(options[key]), `--${key} is required.`);
  return options[key];
}

export function runCli(argv) {
  const [command, ...arguments_] = argv;
  const options = parseOptions(arguments_);
  if (command === 'validate') {
    const sourceManifest = readJson(requireOption(options, 'sources'));
    const candidates = readJson(requireOption(options, 'candidates'));
    const lexicalEvidence = options.evidence ? readJson(options.evidence) : null;
    const result = validateCandidateDataset(candidates, sourceManifest, lexicalEvidence);
    process.stdout.write(`Validated ${result.entries} draft Spanish A1 candidates (${result.candidateSha256}).\n`);
    return;
  }
  if (command === 'prepare-reviews') {
    const result = prepareReviewTemplates({
      sourceManifest: readJson(requireOption(options, 'sources')),
      candidates: readJson(requireOption(options, 'candidates')),
      lexicalEvidence: options.evidence ? readJson(options.evidence) : null,
      spanishOutputPath: requireOption(options, 'spanish-output'),
      slovakOutputPath: requireOption(options, 'slovak-output'),
    });
    process.stdout.write(`Prepared independent review templates bound to ${result.candidateSha256}.\n`);
    process.stdout.write(`Spanish: ${result.spanishOutputPath}\nSlovak: ${result.slovakOutputPath}\n`);
    return;
  }
  if (command === 'score') {
    const score = scoreReviews({
      sourceManifest: readJson(requireOption(options, 'sources')),
      candidates: readJson(requireOption(options, 'candidates')),
      lexicalEvidence: options.evidence ? readJson(options.evidence) : null,
      spanishReview: readJson(requireOption(options, 'spanish-review')),
      slovakReview: readJson(requireOption(options, 'slovak-review')),
      adjudications: options.adjudications ? readJson(options.adjudications) : null,
    });
    process.stdout.write(`${JSON.stringify(score, null, 2)}\n`);
    return;
  }
  if (command === 'compile') {
    const compiled = compileApprovedCatalog({
      sourceManifest: readJson(requireOption(options, 'sources')),
      candidates: readJson(requireOption(options, 'candidates')),
      lexicalEvidence: options.evidence ? readJson(options.evidence) : null,
      spanishReview: readJson(requireOption(options, 'spanish-review')),
      slovakReview: readJson(requireOption(options, 'slovak-review')),
      adjudications: readJson(requireOption(options, 'adjudications')),
    });
    const outputPath = writeJson(requireOption(options, 'output'), compiled);
    process.stdout.write(`Compiled ${compiled.entries.length} fully approved entries to ${outputPath}.\n`);
    return;
  }
  throw new Error('Usage: spanish-a1-pipeline.mjs <validate|prepare-reviews|score|compile> [options]');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Spanish A1 pipeline error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
