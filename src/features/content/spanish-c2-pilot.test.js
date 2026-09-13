/* global describe, expect, it, __dirname */
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const candidates = read('assets/catalog/spanish/c2-pilot-candidates.json');
const course = read('assets/catalog/spanish/course.json');

describe('original Spanish C2 pilot', () => {
  it('keeps all 50 senses in a separate provisional draft with traceable references', () => {
    expect(candidates.publicationStatus).toBe('draft');
    expect(candidates.entries).toHaveLength(50);
    const references = new Set(candidates.references.map(reference => reference.id));
    const terms = new Set();
    for (const entry of candidates.entries) {
      expect(entry.level).toBe('C2');
      expect(entry.publicationStatus).toBe('draft');
      expect(entry.placementStatus).toBe('provisional');
      expect(entry.originalContent).toBe(true);
      expect(entry.lowerLevelComparison.trim().length).toBeGreaterThan(0);
      expect(entry.lexicalEvidence.referenceUrl).toMatch(/^https:\/\//u);
      expect(entry.lexicalEvidence.verificationStatus).not.toBe('pending-ai-review');
      for (const reference of entry.placementReferenceIds) expect(references.has(reference)).toBe(true);
      expect(terms.has(entry.normalizedTerm)).toBe(false);
      terms.add(entry.normalizedTerm);
    }
    expect(new Set(candidates.entries.flatMap(entry => entry.objectiveIds)).size).toBe(8);
  });

  it('pins the compared baseline and does not introduce pilot entries into production', () => {
    const bytes = readFileSync(resolve(root, candidates.baseline.path));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(candidates.baseline.sha256);
    const productionTerms = new Set(course.concepts.flatMap(concept => concept.members.map(member => member.normalizedTerm)));
    const productionIds = new Set(course.concepts.flatMap(concept => concept.members.map(member => member.entryId)));
    for (const entry of candidates.entries) {
      expect(productionTerms.has(entry.normalizedTerm)).toBe(false);
      expect(productionIds.has(entry.id)).toBe(false);
    }
    expect(course.levels.C2).toBe('unavailable-no-elelex-source-level');
  });

  it('reproduces the partial preview only from resolved independent reviews of the final content', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { readFileSync } from 'node:fs';
      import { compileDraftPreview } from './scripts/spanish-expansion-pipeline.mjs';
      const read = path => JSON.parse(readFileSync(path, 'utf8'));
      const base = 'assets/catalog/spanish/';
      console.log(JSON.stringify(compileDraftPreview(
        read(base+'c2-pilot-candidates.json'),
        read(base+'reviews/c2-pilot-spanish-review.json'),
        read(base+'reviews/c2-pilot-slovak-review.json'),
        read(base+'a1-candidates.json').entries,
      )));
    `], { cwd: root, encoding: 'utf8' });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    const preview = read('assets/catalog/spanish/c2-pilot-preview.json');
    expect(JSON.parse(result.stdout)).toEqual(preview);
    expect(preview.reviewStatus).toBe('ai-reviewed-not-human-approved');
    expect(preview.curriculumCoverage).toBe('partial');
  });

  it('reconstructs the original content covered by the historical reviews', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      import { sha256Payload } from './scripts/spanish-catalog-utils.mjs';
      import { validateAIReview } from './scripts/spanish-expansion-pipeline.mjs';
      const read = path => JSON.parse(readFileSync(path, 'utf8'));
      const base = 'assets/catalog/spanish/';
      const draft = read(base+'c2-pilot-candidates.json');
      const ledger = read(base+'c2-pilot-editorial-corrections.json');
      assert.equal(sha256Payload(draft), ledger.finalPayloadSha256);
      for (const change of ledger.changes) {
        const entry = draft.entries.find(entry => entry.id === change.entryId);
        assert.ok(entry);
        for (const field of change.fields) {
          assert.deepEqual(entry[field.field], field.after);
          entry[field.field] = field.before;
        }
      }
      assert.equal(sha256Payload(draft), ledger.authoredBaselinePayloadSha256);
      for (const kind of ['spanish', 'slovak']) {
        validateAIReview(read(base+'reviews/c2-pilot-'+kind+'-review-r1.json'), draft, kind);
      }
    `], { cwd: root, encoding: 'utf8' });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  });
});
