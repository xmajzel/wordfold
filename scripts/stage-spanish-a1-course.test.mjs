import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { buildStagedSpanishA1, stageCourse } from './stage-spanish-a1-course.mjs';

test('stages the current frozen A1 membership as shared-sense concepts', () => {
  const catalog = buildStagedSpanishA1();
  assert.deepEqual(catalog.counts, {
    concepts: 1599,
    terms: 1687,
    ownerReviewedConcepts: 82,
    ownerVerdictRequiredConcepts: 47,
    ownerResolvedRequiredConcepts: 47,
    ownerPendingConcepts: 0,
  });
  assert.equal(catalog.status, 'production');
  assert.equal(catalog.levels.A1, 'available');
  assert.equal(catalog.distributionBlocker, undefined);
  assert.equal(catalog.pronunciationEnabled, false);
  assert.equal(catalog.concepts.every((concept, index) => concept.courseOrder === index + 1), true);
  assert.equal(catalog.concepts.some((concept) => concept.members.some((member) => member.entryId === 'es-cefr:4816e47d42b7fc7e')), false);

  const catalogManifest = JSON.parse(readFileSync(resolve('assets/catalog/spanish/cefr-catalog-manifest.json'), 'utf8'));
  assert.deepEqual(catalogManifest.productionReviewPolicy.distributionGate, {
    status: 'cleared-for-a1-only-release',
    requiredFlaggedConcepts: 47,
    resolvedRequiredConcepts: 47,
    pendingRequiredConcepts: 0,
    laterLevelPendingRows: 70,
    laterLevelRowsGateA1: false,
  });
  assert.deepEqual(
    catalogManifest.productionReviewPolicy.slovakReviewProgress.definitiveCorrectSlovakVerdicts
      .map(({ reviewItemId, verdictProvenance }) => [reviewItemId, verdictProvenance]),
    [
      ['SK-A1-F-0234', 'ai-assisted-owner-accepted'],
      ['SK-A1-F-0479', 'ai-assisted-owner-accepted'],
      ['SK-A1-F-1161', 'ai-assisted-owner-accepted'],
    ],
  );

  const bird = catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i43203');
  assert.equal(bird.sharedSlovakHint, 'vták');
  assert.deepEqual(bird.members.map((member) => member.slovakHint), ['vták', 'vták']);

  const livingRoom = catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i55760');
  assert.equal(livingRoom.sharedSlovakHint, 'obývačka');
  assert.deepEqual(livingRoom.members.map((member) => member.slovakHint), ['obývačka', 'obývačka']);

  const occasion = catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i75105');
  assert.equal(occasion.members.find((member) => member.term === 'ocasión').slovakHint, 'príležitosť');

  const definitive = ['es-sk:a1:i57211', 'es-sk:a1:i30762', 'es-sk:a1:i23086']
    .map((id) => catalog.concepts.find((concept) => concept.id === id));
  assert.equal(definitive.every((concept) => concept.review.slovakOwnerVerdictProvenance === 'ai-assisted-owner-accepted'), true);
  assert.equal(definitive.every((concept) => concept.review.slovakOwnerVerdictRequired === true), true);

  assert.equal(catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i40019').members[0].slovakHint, 'turizmus');
  assert.equal(catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i88647').members[0].slovakHint, 'výrobca čižiem');
  assert.equal(catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i50578').members.find((member) => member.term === 'pila').slovakHint, 'malá batéria');
  assert.equal(catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i4736').members[0].slovakHint, 'samostatne zárobkovo činný');
  assert.equal(catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i77287').members[0].slovakHint, 'klobása');
  assert.equal(catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i67293').members[0].slovakHint, 'meditácia');
  assert.equal(catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i87952').members[0].slovakHint, 'Američan');

  const only = catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i18177');
  assert.equal(only.members.filter((member) => member.term === 'solo').length, 1);
  assert.deepEqual(only.members.find((member) => member.term === 'solo').provenanceAliases[0].sourceRows, [12614, 12904]);
});

test('refuses to write a staged course outside ignored artifacts', () => {
  assert.throws(() => stageCourse('/private/tmp/spanish-a1-distributable'), /must stay under ignored \.artifacts/);
});

test('can reconstruct the pre-verdict hints for the frozen correspondence-QA input', () => {
  const catalog = buildStagedSpanishA1({ applyAiAssistedVerdicts: false });
  const turismo = catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i40019');
  assert.equal(turismo.members[0].slovakHint, 'turistika');
  assert.equal(turismo.review.slovakOwnerVerdict, 'owner-override');
  assert.equal(turismo.review.slovakOwnerVerdictProvenance, 'ai-assisted-owner-accepted');
});

test('writes a distribution-allowed release candidate after the narrowed gate clears', () => {
  const outputDirectory = mkdtempSync(resolve('.artifacts/spanish-a1-release-candidate-test-'));
  try {
    const manifest = stageCourse(outputDirectory);
    const catalog = JSON.parse(readFileSync(resolve(outputDirectory, 'catalog.json'), 'utf8'));
    assert.equal(manifest.status, 'release-candidate-staging');
    assert.equal(manifest.distributionAllowed, true);
    assert.deepEqual(manifest.blockers, []);
    assert.equal(catalog.status, 'production');
    assert.equal(catalog.levels.A1, 'available');
    assert.equal(catalog.pronunciationEnabled, false);
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
