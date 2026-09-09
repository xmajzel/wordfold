import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStagedSpanishA1, stageCourse } from './stage-spanish-a1-course.mjs';

test('stages the current frozen A1 membership as shared-sense concepts', () => {
  const catalog = buildStagedSpanishA1();
  assert.deepEqual(catalog.counts, {
    concepts: 1599,
    terms: 1687,
    ownerReviewedConcepts: 35,
    ownerPendingConcepts: 1564,
  });
  assert.equal(catalog.status, 'non-distributable-staging');
  assert.equal(catalog.pronunciationEnabled, false);
  assert.equal(catalog.concepts.every((concept, index) => concept.courseOrder === index + 1), true);
  assert.equal(catalog.concepts.some((concept) => concept.members.some((member) => member.entryId === 'es-cefr:4816e47d42b7fc7e')), false);

  const bird = catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i43203');
  assert.equal(bird.sharedSlovakHint, 'vták');
  assert.deepEqual(bird.members.map((member) => member.slovakHint), ['vták', 'vták']);

  const livingRoom = catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i55760');
  assert.equal(livingRoom.sharedSlovakHint, 'obývačka');
  assert.deepEqual(livingRoom.members.map((member) => member.slovakHint), ['obývačka', 'obývačka']);

  const occasion = catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i75105');
  assert.equal(occasion.members.find((member) => member.term === 'ocasión').slovakHint, 'príležitosť');

  const only = catalog.concepts.find((concept) => concept.id === 'es-sk:a1:i18177');
  assert.equal(only.members.filter((member) => member.term === 'solo').length, 1);
  assert.deepEqual(only.members.find((member) => member.term === 'solo').provenanceAliases[0].sourceRows, [12614, 12904]);
});

test('refuses to write a staged course outside ignored artifacts', () => {
  assert.throws(() => stageCourse('/private/tmp/spanish-a1-distributable'), /must stay under ignored \.artifacts/);
});
