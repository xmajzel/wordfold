import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { buildTranslationGroups, validateOutput } from './spanish-a2-slovak-translations.mjs';

const laterLevels = ['A2', 'B1', 'B2', 'C1'];
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

// Assemble existing content only. Pending owner verdicts never become approvals.
export function buildSpanishCourseBase() {
  const a1 = readJson('assets/catalog/spanish/a1-course.json');
  const a1Release = readJson('assets/catalog/spanish/a1-course-release-manifest.json');
  assert.equal(hash(a1Release.catalog.path), a1Release.catalog.sha256);
  assert.equal(a1.status, 'production');
  const catalog = readJson('assets/catalog/spanish/cefr-course-catalog.json');
  const order = readJson('assets/catalog/spanish/cefr-course-order.json');
  assert.equal(hash('assets/catalog/spanish/cefr-course-catalog.json'), a1Release.sourceHashes.courseCatalog.sha256);
  assert.equal(hash('assets/catalog/spanish/cefr-course-order.json'), a1Release.sourceHashes.courseOrder.sha256);
  const summary = readJson('.artifacts/spanish-slovak-correspondence-qa/summary.json');
  const queuePath = '.artifacts/spanish-slovak-correspondence-qa/owner-review-queue.tsv';
  assert.equal(hash(queuePath), summary.finalOwnerQueue.sha256, 'Correspondence review queue changed.');
  const [header, ...lines] = readFileSync(queuePath, 'utf8').trimEnd().split('\n');
  const columns = header.split('\t');
  assert.deepEqual(columns, summary.finalOwnerQueue.columns);
  assert.equal(lines.length, summary.finalOwnerQueue.rows);
  const excludedConcepts = lines.map((line) => {
    const cells = line.split('\t');
    assert.equal(cells.length, columns.length);
    const row = Object.fromEntries(columns.map((key, index) => [key, cells[index]]));
    return { id: row.groupId, level: row.level, reason: 'pending-owner-verdict' };
  }).filter((row) => laterLevels.includes(row.level));
  const excludedIds = new Set(excludedConcepts.map((concept) => concept.id));
  assert.equal(excludedIds.size, 70, 'Expected 70 pending later-level concepts.');
  assert.equal(excludedConcepts.length, excludedIds.size);
  const externalQaPath = 'assets/catalog/spanish/external-qa-adjudications.json';
  assert.equal(hash(externalQaPath), a1Release.sourceHashes.externalQaAdjudications.sha256);
  const staleHintIds = new Set(readJson(externalQaPath).entries
    .filter((entry) => entry.staleSlovakHint && laterLevels.includes(entry.level))
    .map((entry) => entry.entryId));
  const amendments = readJson('assets/catalog/spanish/b1-post-translation-content-corrections.json');
  assert.equal(amendments.notHumanReview, true);
  const amendmentById = new Map(amendments.entries.map((entry) => {
    assert.equal(entry.affectsSlovakHint, false);
    return [entry.entryId, entry];
  }));
  const concepts = [...a1.concepts];
  for (const level of laterLevels) {
    const directory = `.artifacts/spanish-${level.toLowerCase()}-slovak-translations`;
    const pilot = readJson(`${directory}/pilot/manifest.json`);
    const full = readJson(`${directory}/full/manifest.json`);
    assert.deepEqual(pilot.sourceLearnerContent, full.sourceLearnerContent);
    const source = pilot.sourceLearnerContent;
    assert.equal(hash(source.path), source.manifestSha256);
    if (source.corrections) assert.equal(hash(source.corrections.path), source.corrections.sha256);
    const learner = buildTranslationGroups(source.path, level, source.corrections?.path);
    assert.equal(learner.contentSha256, source.contentSha256, `${level}: translated learner content changed.`);
    const groupById = new Map(learner.groups.map((group) => [group.groupId, group]));
    const records = new Map();
    for (const manifest of [pilot, full]) {
      for (const batch of manifest.batches) {
        assert.equal(hash(batch.inputPath), batch.inputSha256);
        const input = readJson(batch.inputPath);
        const output = readJson(batch.outputPath);
        validateOutput(input, output);
        input.forEach((group, index) => {
          assert.deepEqual(group, groupById.get(group.groupId), `${group.groupId}: translation source mismatch.`);
          assert(!records.has(group.groupId), `Duplicate translation: ${group.groupId}`);
          assert.notEqual(output[index].sharedHintRiskAssessment, 'unresolved');
          records.set(group.groupId, output[index]);
        });
      }
    }
    assert.equal(records.size, groupById.size, `${level}: translations are incomplete.`);
    const excluded = excludedConcepts.filter((concept) => concept.level === level);
    assert.equal(excluded.length, summary.finalOwnerQueue.countsByLevel[level]);
    for (const concept of excluded) assert(groupById.has(concept.id), `Unknown excluded concept: ${concept.id}`);
    for (const group of learner.groups) {
      if (group.members.some((member) => staleHintIds.has(member.entryId)) && !excludedIds.has(group.groupId)) {
        excludedIds.add(group.groupId);
        excludedConcepts.push({ id: group.groupId, level, reason: 'stale-slovak-hint' });
      }
    }
    const entries = catalog.entries.filter((entry) => entry.level === level);
    const entryById = new Map(entries.map((entry) => [entry.id, entry]));
    const rankById = new Map(order.levels[level].orderedEntries.map((entry) => [entry.entryId, entry.rank]));
    assert.equal(rankById.size, entries.length);
    const seenMembers = new Set();
    const levelConcepts = learner.groups.map((group) => {
      const translation = records.get(group.groupId);
      const overrides = new Map(translation.memberOverrides.map((entry) => [entry.entryId, entry.slovakHint]));
      const members = group.members.map((member) => {
        const entry = entryById.get(member.entryId);
        assert(entry && rankById.has(member.entryId), `${member.entryId}: missing catalog membership or order.`);
        assert(!seenMembers.has(member.entryId), `Duplicate member: ${member.entryId}`);
        seenMembers.add(member.entryId);
        const amendment = amendmentById.get(member.entryId);
        return {
          entryId: member.entryId,
          term: member.term,
          normalizedTerm: entry.normalizedTerm,
          partOfSpeech: member.partOfSpeech,
          definition: amendment?.replacementDefinition ?? member.definition,
          example: amendment?.replacementExample ?? member.example,
          selectedSenseId: member.selectedSenseId,
          slovakHint: overrides.get(member.entryId) ?? translation.slovakHint,
          hintSource: overrides.has(member.entryId) ? 'generated-member-override' : 'generated-shared-hint',
          courseOrder: rankById.get(member.entryId),
        };
      }).sort((left, right) => left.courseOrder - right.courseOrder);
      return {
        id: group.groupId,
        notHumanReview: true,
        level,
        partOfSpeech: group.partOfSpeech,
        courseOrder: members[0].courseOrder,
        sharedSlovakHint: translation.slovakHint,
        members,
        review: {
          spanish: 'automated-reference-qa-plus-independent-ai-cross-review',
          slovakOwnerVerdict: null,
          slovakOwnerVerdictProvenance: null,
          slovakOwnerVerdictRequired: false,
        },
      };
    }).filter((concept) => !excludedIds.has(concept.id))
      .sort((left, right) => left.courseOrder - right.courseOrder);
    assert.equal(seenMembers.size, entries.length, `${level}: learner membership is incomplete.`);
    levelConcepts.forEach((concept, index) => { concept.courseOrder = index + 1; });
    concepts.push(...levelConcepts);
  }
  return {
    ...a1,
    title: 'Wordfold Spanish A1–C1 catalog',
    counts: {
      ...a1.counts,
      concepts: concepts.length,
      terms: concepts.reduce((sum, concept) => sum + concept.members.length, 0),
    },
    levels: { ...a1.levels, A2: 'available', B1: 'available', B2: 'available', C1: 'available' },
    excludedConcepts,
    concepts,
  };
}

