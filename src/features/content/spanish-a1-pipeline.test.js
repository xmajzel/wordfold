/* global __dirname, beforeAll, describe, expect, it */

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const script = resolve(root, 'scripts/spanish-a1-pipeline.mjs');
const pinnedOmwSha256 = 'd8450d42885cd51f3db39fe64219a7a003eeb432b4caa00428285fe6ab224303';
const categories = {
  '1': { label: 'Individuo: dimensión física', count: 30 },
  '2': { label: 'Individuo: dimensión perceptiva y anímica', count: 25 },
  '3': { label: 'Identidad personal', count: 35 },
  '4': { label: 'Relaciones personales', count: 30 },
  '5': { label: 'Alimentación', count: 50 },
  '6': { label: 'Educación', count: 25 },
  '7': { label: 'Trabajo', count: 20 },
  '8': { label: 'Ocio', count: 25 },
  '9': { label: 'Información y medios de comunicación', count: 15 },
  '10': { label: 'Vivienda', count: 35 },
  '11': { label: 'Servicios', count: 20 },
  '12': { label: 'Compras, tiendas y establecimientos', count: 35 },
  '13': { label: 'Salud e higiene', count: 25 },
  '14': { label: 'Viajes, alojamiento y transporte', count: 40 },
  '15': { label: 'Economía e industria', count: 10 },
  '16': { label: 'Ciencia y tecnología', count: 10 },
  '17': { label: 'Gobierno, política y sociedad', count: 5 },
  '18': { label: 'Actividades artísticas', count: 15 },
  '19': { label: 'Religión y filosofía', count: 5 },
  '20': { label: 'Geografía y naturaleza', count: 45 },
};

function sourceManifest() {
  return {
    schemaVersion: 1,
    sources: [
      {
        id: 'pcic-framework-permission',
        version: 'permission-2026-08-27',
        url: 'https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/indice.htm',
        sha256: 'a'.repeat(64),
        license: 'Written commercial framework-reference permission dated 2026-08-27',
        attribution: 'Spanish learning content structured according to the PCIC, A1-C2.',
        redistributionScope: 'Framework categories and classifications only; no protected PCIC learner text.',
        transformations: ['Use classifications as Wordfold-authored coverage buckets.'],
      },
      {
        id: 'omw-es',
        version: '2.0',
        url: 'https://github.com/omwn/omw-data/releases/download/v2.0/omw-es-2.0.tar.xz',
        sha256: pinnedOmwSha256,
        license: 'Creative Commons Attribution 3.0 Unported (CC BY 3.0)',
        attribution: 'MCR 3.0 Spanish, packaged by Open Multilingual Wordnet 2.0.',
        redistributionScope: 'Spanish lemma, POS, synset, ILI, and confidence evidence; English MCR data excluded.',
        transformations: ['Extract Spanish lexical identities used by selected Wordfold senses.'],
      },
      {
        id: 'wordfold-original-spanish-a1',
        version: '1',
        url: 'docs/SPANISH_CATALOG_EDITORIAL_POLICY.md',
        sha256: 'c'.repeat(64),
        license: 'Wordfold original editorial content',
        attribution: 'Wordfold Spanish editorial policy.',
        redistributionScope: 'Original Wordfold learner-facing content.',
        transformations: ['Author and independently review unmatched lexical entries.'],
      },
    ],
  };
}

function candidateDataset() {
  const entries = [];
  let sequence = 0;
  for (const [categoryId, quota] of Object.entries(categories)) {
    for (let offset = 0; offset < quota.count; offset += 1) {
      sequence += 1;
      const serial = String(sequence).padStart(3, '0');
      const term = `término${serial}`;
      entries.push({
        id: `es-sk:a1:entry-${serial}`,
        catalogSenseId: `es-sk:a1:sense-${serial}`,
        term,
        normalizedTerm: term,
        level: 'A1',
        partOfSpeech: 'NOUN',
        displayPartOfSpeech: 'sustantivo',
        gender: 'masculine',
        alternativeForms: [],
        isReflexiveVerb: false,
        isMultiwordExpression: false,
        definition: `Concepto cotidiano número ${sequence} explicado claramente.`,
        example: `Hoy uso ${term} de forma sencilla.`,
        exampleSurfaceForm: term,
        translation: `význam${serial}`,
        pcicClassification: { id: categoryId, label: quota.label },
        secondaryClassifications: [],
        levelRationale: `Concrete early-use A1 concept assigned independently to category ${categoryId}.`,
        lexicalEvidence: null,
        originalContent: true,
        originalContentDeclaration: 'Original Wordfold learner content; no PCIC learner-facing text copied.',
        authoringBatch: `batch-${Math.floor((sequence - 1) / 100) + 1}`,
        sourceVersion: 'wordfold-spanish-a1-pilot-v1',
        publicationStatus: 'draft',
      });
    }
  }
  return {
    schemaVersion: 1,
    courseId: 'es-sk',
    level: 'A1',
    publicationStatus: 'draft',
    targetEntries: 500,
    categoryQuotas: categories,
    entries,
  };
}

function lexicalEvidenceSidecar(candidates) {
  return {
    schemaVersion: 1,
    courseId: 'es-sk',
    level: 'A1',
    publicationStatus: 'draft',
    candidatesSha256: createHash('sha256')
      .update(`${JSON.stringify(candidates, null, 2)}\n`)
      .digest('hex'),
    source: {
      id: 'omw-es',
      version: '2.0',
      archiveSha256: pinnedOmwSha256,
      license: 'Creative Commons Attribution 3.0 Unported (CC BY 3.0)',
      attribution: 'MCR 3.0 Spanish, packaged by Open Multilingual Wordnet 2.0.',
    },
    coverage: {
      entries: candidates.entries.length,
      exactLemmaAndPosMatches: candidates.entries.length,
      exactLemmaAndPosRatio: 1,
      targetRatio: 0.8,
    },
    entries: candidates.entries.map((entry, index) => ({
      candidateId: entry.id,
      catalogSenseId: entry.catalogSenseId,
      term: entry.term,
      normalizedTerm: entry.normalizedTerm,
      candidatePartOfSpeech: entry.partOfSpeech,
      sourceId: 'omw-es',
      sourceVersion: '2.0',
      selectedSenseId: null,
      candidateSenses: [{
        lexicalEntryId: `omw-es-entry-${index + 1}`,
        writtenForm: entry.term,
        partOfSpeech: 'n',
        senseId: `omw-es-sense-${index + 1}`,
        synsetId: `omw-es-${index + 1}-n`,
      }],
      requiresSpanishSenseSelection: false,
      exceptionRationale: null,
    })),
  };
}

function run(arguments_) {
  return spawnSync(process.execPath, [script, ...arguments_], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function approveReview(template, reviewerId, qualification) {
  return {
    ...template,
    reviewerId,
    qualification,
    attestation: 'I independently reviewed every assigned candidate against the supplied rubric.',
    reviewedAt: '2026-08-28',
    decisions: template.decisions.map((decision, index) => {
      const offeredSenses = template.subjects[index].lexicalEvidence?.candidateSenses ?? [];
      return {
        ...decision,
        decision: 'approved',
        ...(template.reviewKind === 'spanish' ? {
          selectedSenseId: offeredSenses[0]?.senseId ?? null,
          originalEditorialExceptionApproved: offeredSenses.length === 0,
        } : {}),
      };
    }),
  };
}

describe('deterministic Spanish A1 draft pipeline', () => {
  let directory;
  let sourcesPath;
  let candidatesPath;
  let evidencePath;
  let spanishTemplatePath;
  let slovakTemplatePath;
  let approvedSpanish;
  let approvedSlovak;
  let adjudications;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'wordfold-spanish-a1-pipeline-'));
    sourcesPath = join(directory, 'sources.json');
    candidatesPath = join(directory, 'candidates.json');
    spanishTemplatePath = join(directory, 'reviews', 'spanish.json');
    slovakTemplatePath = join(directory, 'reviews', 'slovak.json');
    writeJson(sourcesPath, sourceManifest());
    const candidates = candidateDataset();
    evidencePath = join(directory, 'a1-lexical-evidence.json');
    writeJson(candidatesPath, candidates);
    writeJson(evidencePath, lexicalEvidenceSidecar(candidates));

    const prepared = run([
      'prepare-reviews', '--sources', sourcesPath, '--candidates', candidatesPath,
      '--evidence', evidencePath,
      '--spanish-output', spanishTemplatePath, '--slovak-output', slovakTemplatePath,
    ]);
    if (prepared.status !== 0) throw new Error(prepared.stderr);
    const spanishTemplate = JSON.parse(readFileSync(spanishTemplatePath, 'utf8'));
    const slovakTemplate = JSON.parse(readFileSync(slovakTemplatePath, 'utf8'));
    approvedSpanish = approveReview(spanishTemplate, 'reviewer-spanish', 'Qualified native Spanish editor');
    approvedSlovak = approveReview(slovakTemplate, 'reviewer-slovak', 'Qualified native Slovak editor');
    adjudications = {
      schemaVersion: 1,
      candidateSha256: spanishTemplate.candidateSha256,
      adjudications: [],
    };
  });

  it('validates exactly 500 quota-bound candidates and prepares isolated hash-bound reviews', () => {
    const validated = run(['validate', '--sources', sourcesPath, '--candidates', candidatesPath, '--evidence', evidencePath]);
    const spanish = JSON.parse(readFileSync(spanishTemplatePath, 'utf8'));
    const slovak = JSON.parse(readFileSync(slovakTemplatePath, 'utf8'));

    expect(validated.status).toBe(0);
    expect(validated.stdout).toContain('Validated 500 draft Spanish A1 candidates');
    expect(spanish.candidateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(slovak.candidateSha256).toBe(spanish.candidateSha256);
    expect(spanish.reviewKind).toBe('spanish');
    expect(slovak.reviewKind).toBe('slovak');
    expect(spanish.subjects[0]).not.toHaveProperty('translation');
    expect(slovak.subjects[0]).toHaveProperty('translation');
    expect(spanish.decisions.every((decision) => decision.decision === 'pending')).toBe(true);
    expect(slovak.decisions.every((decision) => decision.decision === 'pending')).toBe(true);
  });

  it('refuses invalid source hashes and incorrect candidate totals or quotas', () => {
    const invalidSources = sourceManifest();
    invalidSources.sources[1].sha256 = 'b'.repeat(64);
    const invalidSourcesPath = join(directory, 'invalid-sources.json');
    writeJson(invalidSourcesPath, invalidSources);
    const sourceResult = run(['validate', '--sources', invalidSourcesPath, '--candidates', candidatesPath]);
    expect(sourceResult.status).toBe(1);
    expect(sourceResult.stderr).toContain('does not match the pinned release');

    const invalidCandidates = candidateDataset();
    invalidCandidates.entries.pop();
    const invalidCandidatesPath = join(directory, 'invalid-candidates.json');
    writeJson(invalidCandidatesPath, invalidCandidates);
    const candidateResult = run(['validate', '--sources', sourcesPath, '--candidates', invalidCandidatesPath]);
    expect(candidateResult.status).toBe(1);
    expect(candidateResult.stderr).toContain('exactly 500 candidates');

    const invalidQuotas = candidateDataset();
    invalidQuotas.entries[0].pcicClassification = { id: '2', label: categories['2'].label };
    const invalidQuotasPath = join(directory, 'invalid-quotas.json');
    writeJson(invalidQuotasPath, invalidQuotas);
    const invalidQuotasEvidencePath = join(directory, 'invalid-quotas-evidence.json');
    writeJson(invalidQuotasEvidencePath, lexicalEvidenceSidecar(invalidQuotas));
    const quotaResult = run([
      'validate', '--sources', sourcesPath, '--candidates', invalidQuotasPath,
      '--evidence', invalidQuotasEvidencePath,
    ]);
    expect(quotaResult.status).toBe(1);
    expect(quotaResult.stderr).toContain('Category 1 must contain exactly 30 candidates');
  });

  it('compiles only a complete independently approved review set', () => {
    const spanishPath = join(directory, 'approved-spanish.json');
    const slovakPath = join(directory, 'approved-slovak.json');
    const adjudicationsPath = join(directory, 'adjudications.json');
    const outputPath = join(directory, 'compiled', 'reviewed-a1.json');
    writeJson(spanishPath, approvedSpanish);
    writeJson(slovakPath, approvedSlovak);
    writeJson(adjudicationsPath, adjudications);

    const result = run([
      'compile', '--sources', sourcesPath, '--candidates', candidatesPath,
      '--evidence', evidencePath,
      '--spanish-review', spanishPath, '--slovak-review', slovakPath,
      '--adjudications', adjudicationsPath, '--output', outputPath,
    ]);
    const compiled = JSON.parse(readFileSync(outputPath, 'utf8'));

    expect(result.status).toBe(0);
    expect(compiled.entries).toHaveLength(500);
    expect(compiled.publicationStatus).toBe('reviewed-draft');
    expect(compiled.releaseEligibility).toBe('promotion-candidate');
    expect(compiled.evidence.lexicalEvidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(compiled.entries.every((entry) => entry.lexicalEvidence?.senseId)).toBe(true);
    expect(compiled.entries.every((entry) => entry.learnerContentReviewStatus === 'approved')).toBe(true);
    expect(compiled.entries.every((entry) => entry.hintReviewStatus === 'approved')).toBe(true);
  });

  it('requires a current evidence sidecar when candidate lexical evidence is null', () => {
    const missing = run(['validate', '--sources', sourcesPath, '--candidates', candidatesPath]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('lexicalEvidence may be null only with a matching evidence sidecar');

    const staleEvidence = lexicalEvidenceSidecar(candidateDataset());
    staleEvidence.candidatesSha256 = '0'.repeat(64);
    const staleEvidencePath = join(directory, 'stale-evidence.json');
    writeJson(staleEvidencePath, staleEvidence);
    const stale = run([
      'validate', '--sources', sourcesPath, '--candidates', candidatesPath,
      '--evidence', staleEvidencePath,
    ]);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('stale candidate hash');
  });

  it('refuses Spanish approval without an offered OMW sense selection', () => {
    const spanishPath = join(directory, 'missing-sense-spanish.json');
    const slovakPath = join(directory, 'missing-sense-slovak.json');
    const adjudicationsPath = join(directory, 'missing-sense-adjudications.json');
    const invalidSpanish = {
      ...approvedSpanish,
      decisions: approvedSpanish.decisions.map((decision, index) => index === 0
        ? { ...decision, selectedSenseId: null, originalEditorialExceptionApproved: false }
        : decision),
    };
    writeJson(spanishPath, invalidSpanish);
    writeJson(slovakPath, approvedSlovak);
    writeJson(adjudicationsPath, adjudications);

    const result = run([
      'compile', '--sources', sourcesPath, '--candidates', candidatesPath,
      '--evidence', evidencePath,
      '--spanish-review', spanishPath, '--slovak-review', slovakPath,
      '--adjudications', adjudicationsPath, '--output', join(directory, 'missing-sense.json'),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must select one offered OMW sense');
  });

  it('compiles explicitly approved original-editorial exceptions at the 80% evidence floor', () => {
    const candidates = candidateDataset();
    const evidence = lexicalEvidenceSidecar(candidates);
    for (const record of evidence.entries.slice(400)) {
      record.sourceId = 'wordfold-original-spanish-a1';
      record.sourceVersion = '1';
      record.candidateSenses = [];
      record.requiresSpanishSenseSelection = false;
      record.exceptionRationale = 'No exact OMW lemma and POS match; original editorial sense approved.';
    }
    evidence.coverage.exactLemmaAndPosMatches = 400;
    evidence.coverage.exactLemmaAndPosRatio = 0.8;
    const exceptionEvidencePath = join(directory, 'exception-evidence.json');
    const spanishTemplatePathForException = join(directory, 'exception-spanish-template.json');
    const slovakTemplatePathForException = join(directory, 'exception-slovak-template.json');
    writeJson(exceptionEvidencePath, evidence);
    const prepared = run([
      'prepare-reviews', '--sources', sourcesPath, '--candidates', candidatesPath,
      '--evidence', exceptionEvidencePath,
      '--spanish-output', spanishTemplatePathForException,
      '--slovak-output', slovakTemplatePathForException,
    ]);
    expect(prepared.status).toBe(0);
    const spanish = approveReview(
      JSON.parse(readFileSync(spanishTemplatePathForException, 'utf8')),
      'reviewer-spanish-exception',
      'Qualified native Spanish editor',
    );
    const slovak = approveReview(
      JSON.parse(readFileSync(slovakTemplatePathForException, 'utf8')),
      'reviewer-slovak-exception',
      'Qualified native Slovak editor',
    );
    const spanishPath = join(directory, 'exception-spanish.json');
    const slovakPath = join(directory, 'exception-slovak.json');
    const exceptionAdjudicationsPath = join(directory, 'exception-adjudications.json');
    const outputPath = join(directory, 'exception-compiled.json');
    writeJson(spanishPath, spanish);
    writeJson(slovakPath, slovak);
    writeJson(exceptionAdjudicationsPath, adjudications);
    const result = run([
      'compile', '--sources', sourcesPath, '--candidates', candidatesPath,
      '--evidence', exceptionEvidencePath,
      '--spanish-review', spanishPath, '--slovak-review', slovakPath,
      '--adjudications', exceptionAdjudicationsPath, '--output', outputPath,
    ]);
    expect(result.status).toBe(0);
    const compiled = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(compiled.entries.filter((entry) => entry.lexicalEvidence.type === 'original-editorial')).toHaveLength(100);
  });

  it.each([
    ['stale', (review) => ({ ...review, candidateSha256: '0'.repeat(64) }), 'stale candidate hash'],
    ['incomplete', (review) => ({ ...review, decisions: review.decisions.slice(1) }), 'review is incomplete'],
    ['rejected', (review) => ({
      ...review,
      decisions: review.decisions.map((decision, index) => index === 0
        ? { ...decision, decision: 'rejected', notes: 'The selected sense is unsuitable.' }
        : decision),
    }), 'contains rejected decisions'],
    ['changes-requested', (review) => ({
      ...review,
      decisions: review.decisions.map((decision, index) => index === 0
        ? { ...decision, decision: 'changes-requested', notes: 'Rewrite and renew approval.' }
        : decision),
    }), 'requested changes requiring adjudication and renewed approval'],
  ])('refuses a %s Spanish review', (_label, mutate, expectedError) => {
    const spanishPath = join(directory, `refusal-${_label}-spanish.json`);
    const slovakPath = join(directory, `refusal-${_label}-slovak.json`);
    const adjudicationsPath = join(directory, `refusal-${_label}-adjudications.json`);
    writeJson(spanishPath, mutate(approvedSpanish));
    writeJson(slovakPath, approvedSlovak);
    writeJson(adjudicationsPath, adjudications);

    const result = run([
      'compile', '--sources', sourcesPath, '--candidates', candidatesPath,
      '--evidence', evidencePath,
      '--spanish-review', spanishPath, '--slovak-review', slovakPath,
      '--adjudications', adjudicationsPath, '--output', join(directory, `refusal-${_label}.json`),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(expectedError);
  });

  it('refuses the same person for Spanish and Slovak review', () => {
    const spanishPath = join(directory, 'same-reviewer-spanish.json');
    const slovakPath = join(directory, 'same-reviewer-slovak.json');
    const adjudicationsPath = join(directory, 'same-reviewer-adjudications.json');
    writeJson(spanishPath, approvedSpanish);
    writeJson(slovakPath, { ...approvedSlovak, reviewerId: approvedSpanish.reviewerId });
    writeJson(adjudicationsPath, adjudications);

    const result = run([
      'compile', '--sources', sourcesPath, '--candidates', candidatesPath,
      '--evidence', evidencePath,
      '--spanish-review', spanishPath, '--slovak-review', slovakPath,
      '--adjudications', adjudicationsPath, '--output', join(directory, 'same-reviewer.json'),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('reviewers must be distinct people');
  });

  it('refuses unresolved adjudications', () => {
    const spanishPath = join(directory, 'unresolved-spanish.json');
    const slovakPath = join(directory, 'unresolved-slovak.json');
    const adjudicationsPath = join(directory, 'unresolved-adjudications.json');
    const unresolved = {
      ...adjudications,
      adjudications: [{
        id: 'adj-001',
        entryId: approvedSpanish.decisions[0].entryId,
        catalogSenseId: approvedSpanish.decisions[0].catalogSenseId,
        reviewKind: 'spanish',
        field: 'definition',
        before: 'Old draft value',
        after: 'Proposed new value',
        reason: 'Reviewer requested a clearer definition.',
        adjudicatorId: 'editorial-lead',
        decidedAt: '2026-08-28',
        status: 'pending',
      }],
    };
    writeJson(spanishPath, approvedSpanish);
    writeJson(slovakPath, approvedSlovak);
    writeJson(adjudicationsPath, unresolved);

    const result = run([
      'compile', '--sources', sourcesPath, '--candidates', candidatesPath,
      '--evidence', evidencePath,
      '--spanish-review', spanishPath, '--slovak-review', slovakPath,
      '--adjudications', adjudicationsPath, '--output', join(directory, 'unresolved.json'),
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unresolved adjudication');
  });
});
