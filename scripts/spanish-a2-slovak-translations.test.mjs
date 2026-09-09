import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTranslationGroups, validateOutput } from './spanish-a2-slovak-translations.mjs';

test('groups the immutable A2 learner run by selected ILI without dropping entries', () => {
  const result = buildTranslationGroups('.artifacts/spanish-a2-learner-content/full/manifest.json');
  assert.equal(result.generated.length, 1847);
  assert.equal(result.groups.length, 1786);
  assert.equal(result.groups.filter((group) => group.members.length > 1).length, 61);
  assert.equal(result.groups.filter((group) => group.sharedHintRisk.flagged).length, 23);
});

test('requires the needsReview fallback for a flagged false-positive candidate', () => {
  const input = [{
    groupId: 'es-sk:a2:test',
    sharedHintRisk: { flagged: true },
    members: [
      { entryId: 'one' },
      { entryId: 'two' },
    ],
  }];
  const valid = [{
    groupId: 'es-sk:a2:test',
    notHumanReview: true,
    slovakHint: 'auto',
    memberOverrides: [],
    sharedHintRiskAssessment: 'false-positive-candidate',
    confidence: 'high',
    needsReview: true,
    reviewNote: 'gate-false-positive-candidate: oba španielske členy majú rovnaký prirodzený slovenský ekvivalent',
  }];
  assert.doesNotThrow(() => validateOutput(input, valid));
  assert.throws(() => validateOutput(input, [{ ...valid[0], needsReview: false, reviewNote: '' }]), /needsReview fallback/);
});
