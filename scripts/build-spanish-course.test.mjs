import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildSpanishCourse } from './build-spanish-course.mjs';

test('rebuilds A1–C1 from complete translations, preserving A1 and withholding flagged concepts', () => {
  const catalog = buildSpanishCourse();
  assert.deepEqual(catalog, JSON.parse(readFileSync('assets/catalog/spanish/course.json', 'utf8')));
  const a1 = JSON.parse(readFileSync('assets/catalog/spanish/a1-course.json', 'utf8'));
  assert.deepEqual(catalog.concepts.filter((concept) => concept.level === 'A1'), a1.concepts);
  assert.deepEqual(Object.fromEntries(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => [
    level, catalog.concepts.filter((concept) => concept.level === level).length,
  ])), { A1: 1599, A2: 1763, B1: 1272, B2: 723, C1: 531, C2: 0 });
  assert.equal(catalog.excludedConcepts.length, 74);
  const bundledIds = new Set(catalog.concepts.map((concept) => concept.id));
  assert(catalog.excludedConcepts.every((concept) => !bundledIds.has(concept.id)));
  const externalQa = JSON.parse(readFileSync('assets/catalog/spanish/external-qa-adjudications.json', 'utf8'));
  const staleIds = new Set(externalQa.entries.filter((entry) => entry.level === 'A2' && entry.staleSlovakHint).map((entry) => entry.entryId));
  assert.equal(staleIds.size, 5);
  assert(catalog.concepts.every((concept) => concept.members.every((member) => !staleIds.has(member.entryId))));
  assert.equal(catalog.counts.ownerPendingConcepts, 0);
  const hispano = catalog.concepts.flatMap((concept) => concept.members).find((member) => member.entryId === 'es-cefr:df21f1cbc03a1087');
  assert.equal(hispano.definition, 'Persona de un país de habla española o relacionada con su cultura.');
  assert.equal(hispano.slovakHint, 'Hispánec');
});
