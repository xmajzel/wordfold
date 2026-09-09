import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCourseOrderSidecar, orderWithinLevels } from './build-spanish-cefr-order.mjs';

function entry(id, term, level, partOfSpeech, count) {
  return {
    id,
    term,
    normalizedTerm: term,
    level,
    partOfSpeech,
    levelAssignment: { documentCount: { [level]: count } },
  };
}

test('orders within a level by document count without changing levels', () => {
  const entries = [
    entry('3', 'abstracto', 'A1', 'adjective', 2),
    entry('2', 'casa', 'A1', 'noun', 88),
    entry('1', 'comer', 'A1', 'verb', 69),
    entry('4', 'casa', 'A2', 'noun', 120),
  ];
  const ordered = orderWithinLevels(entries, ['A1', 'A2']);
  assert.deepEqual(ordered.map(({ id }) => id), ['2', '1', '3', '4']);
  assert.deepEqual(entries.map(({ level }) => level), ['A1', 'A1', 'A1', 'A2']);
});

test('sidecar records explicit ranks and an ordering-only policy', () => {
  const levels = ['A1', 'A2', 'B1', 'B2', 'C1'];
  const entries = levels.map((level, index) => entry(String(index), `term-${index}`, level, 'noun', index + 2));
  const sidecar = buildCourseOrderSidecar({
    schemaVersion: 1,
    courseId: 'es-sk',
    levels,
    counts: Object.fromEntries(levels.map((level) => [level, 1])),
    entries,
  }, 'catalog-hash');
  assert.equal(sidecar.notHumanReview, true);
  assert.equal(sidecar.policy.subBands, false);
  assert.equal(sidecar.levels.A1.orderedEntries[0].rank, 1);
  assert.equal(sidecar.levels.C1.orderedEntries[0].assignedLevelDocumentCount, 6);
});
