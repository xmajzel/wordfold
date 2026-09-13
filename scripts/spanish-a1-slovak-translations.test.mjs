import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeSharedHintRisk,
  buildTranslationGroups,
  selectPilotGroups,
  summarizeSharedHintRisk,
  validateOutput,
} from './spanish-a1-slovak-translations.mjs';

function group(index, partOfSpeech = 'noun', memberCount = 1) {
  return {
    groupId: `group-${String(index).padStart(4, '0')}`,
    partOfSpeech,
    members: Array.from({ length: memberCount }, (_, memberIndex) => ({ entryId: `entry-${index}-${memberIndex}` })),
  };
}

test('selects a deterministic 100-group sample across singleton/shared and POS strata', () => {
  const groups = [
    ...Array.from({ length: 1200 }, (_, index) => group(index, 'noun')),
    ...Array.from({ length: 320 }, (_, index) => group(1200 + index, 'verb')),
    ...Array.from({ length: 40 }, (_, index) => group(1520 + index, 'noun', 2)),
    ...Array.from({ length: 40 }, (_, index) => group(1560 + index, 'adjective', 2)),
  ];
  const first = selectPilotGroups(groups, 'seed');
  const second = selectPilotGroups([...groups].reverse(), 'seed');
  assert.deepEqual(first, second);
  assert.equal(first.selected.length, 100);
  assert.equal(new Set(first.selected.map((item) => item.groupId)).size, 100);
  assert.equal(first.selected.filter((item) => item.members.length > 1).length, 5);
});

test('builds 1,600 ILI groups, applies repairs, and excludes pending release decisions', () => {
  const result = buildTranslationGroups(
    '.artifacts/spanish-a1-learner-content/full/manifest.json',
    'assets/catalog/spanish/a1-learner-content-adjudications.json',
    'assets/catalog/spanish/a1-ai-cross-review-adjudications.json',
  );
  assert.equal(result.groups.length, 1600);
  assert.equal(result.groups.filter((item) => item.members.length > 1).length, 80);
  const members = result.groups.flatMap((item) => item.members);
  assert.equal(members.length, 1689);
  assert.equal(members.find((item) => item.term === 'pollo').definition, 'Carne de un ave doméstica criada como alimento.');
  assert.equal(members.some((item) => item.term === 'santería'), false);
});

test('flags 34 shared groups at the approved inclusive 0.40 threshold', () => {
  const result = buildTranslationGroups(
    '.artifacts/spanish-a1-learner-content/full/manifest.json',
    'assets/catalog/spanish/a1-learner-content-adjudications.json',
    'assets/catalog/spanish/a1-ai-cross-review-adjudications.json',
  );
  const summary = summarizeSharedHintRisk(result.groups);
  assert.equal(summary.sharedGroups, 80);
  assert.equal(summary.flaggedGroups, 34);
  assert.equal(summary.distribution.histogram.reduce((sum, bin) => sum + bin.count, 0), 80);
  const occasion = result.groups.find((item) => item.members.some((member) => member.term === 'ocasión'));
  assert.equal(occasion.sharedHintRisk.flagged, true);
  assert.equal(occasion.sharedHintRisk.minimumPairwiseScore, 0.2);
});

test('requires an override or needsReview rationale for a flagged shared group', () => {
  const input = [{
    groupId: 'shared-risk',
    members: [{ entryId: 'one' }, { entryId: 'two' }],
    sharedHintRisk: { flagged: true },
  }];
  const base = {
    groupId: 'shared-risk',
    notHumanReview: true,
    slovakHint: 'raz',
    memberOverrides: [],
    confidence: 'medium',
    needsReview: false,
    reviewNote: '',
  };
  assert.throws(() => validateOutput(input, [base]), /requires a member override or needsReview rationale/);
  assert.doesNotThrow(() => validateOutput(input, [{ ...base, needsReview: true, reviewNote: 'Member lexicalization may require a different Slovak hint.' }]));
  assert.doesNotThrow(() => validateOutput(input, [{
    ...base,
    memberOverrides: [{ entryId: 'two', slovakHint: 'príležitosť', rationale: 'The member lexicalizes opportunity in Slovak.' }],
  }]));
});

test('does not apply shared-hint divergence scoring to singleton groups', () => {
  const risk = analyzeSharedHintRisk({ members: [{ entryId: 'one', definition: 'Una definición.' }] });
  assert.equal(risk.applies, false);
  assert.equal(risk.flagged, false);
  assert.equal(risk.minimumPairwiseScore, null);
});
