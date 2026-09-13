/* global describe, expect, it, __dirname */
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const directory = 'assets/catalog/spanish/';
const read = name => JSON.parse(readFileSync(resolve(root, directory + name + '.json'), 'utf8'));
const authored = read('c2-bulk-candidates');
const accepted = read('c2-bulk-reviewed-candidates');
const quarantine = read('c2-bulk-quarantine');

describe('Spanish C2 bulk draft review boundary', () => {
  it('accounts for every nomination exactly once without publishing quarantined entries', () => {
    const nominations = new Set(authored.entries.map(entry => entry.id));
    const included = accepted.entries.map(entry => entry.id);
    const excluded = quarantine.entries.map(entry => entry.entryId);
    expect(new Set([...included, ...excluded])).toEqual(nominations);
    expect(included.length + excluded.length).toBe(nominations.size);
    for (const row of quarantine.entries) {
      expect(row.reasons.length).toBeGreaterThan(0);
      expect(row.reasons.every(reason => reason.trim().length > 0)).toBe(true);
    }
    const previewIds = new Set(read('c2-preview').entries.map(entry => entry.id));
    for (const id of excluded) expect(previewIds.has(id)).toBe(false);
  });

  it('retains provisional provenance and excludes existing catalog and draft terms', () => {
    const course = read('course');
    const existingTerms = new Set([
      ...course.concepts.flatMap(concept => concept.members.map(member => member.normalizedTerm)),
      ...read('c2-pilot-candidates').entries.map(entry => entry.normalizedTerm),
      ...read('expansion-candidates').entries.map(entry => entry.normalizedTerm),
    ]);
    const references = new Set(accepted.references.map(reference => reference.id));
    const terms = new Set();
    for (const entry of accepted.entries) {
      expect(entry.level).toBe('C2');
      expect(entry.publicationStatus).toBe('draft');
      expect(entry.placementStatus).toBe('provisional');
      expect(entry.originalContent).toBe(true);
      expect(existingTerms.has(entry.normalizedTerm)).toBe(false);
      expect(terms.has(entry.normalizedTerm)).toBe(false);
      terms.add(entry.normalizedTerm);
      expect(entry.lowerLevelComparison.trim().length).toBeGreaterThan(0);
      for (const reference of entry.placementReferenceIds) expect(references.has(reference)).toBe(true);
    }
    expect(course.levels.C2).toBe('unavailable-no-elelex-source-level');
    const bytes = readFileSync(resolve(root, accepted.baseline.path));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(accepted.baseline.sha256);
    expect(accepted.baseline).toEqual(authored.baseline);
  });

  it('reproduces previews from current independent reviews and authenticates the first review round', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      import { compileDraftPreview, validateAIReview } from './scripts/spanish-expansion-pipeline.mjs';
      import { sha256Payload } from './scripts/spanish-catalog-utils.mjs';
      const read = name => JSON.parse(readFileSync('assets/catalog/spanish/'+name+'.json', 'utf8'));
      const authored = read('c2-bulk-candidates');
      const accepted = read('c2-bulk-reviewed-candidates');
      const quarantine = read('c2-bulk-quarantine');
      assert.equal(quarantine.authoredDatasetSha256, sha256Payload(authored));
      assert.equal(quarantine.reviewedDatasetSha256, sha256Payload(accepted));
      for (const kind of ['spanish', 'slovak']) {
        validateAIReview(read('reviews/c2-bulk-'+kind+'-review-r1'), authored, kind, {requireResolved: false});
      }
      const previews = ['c2-pilot', 'c2-bulk'].map(prefix => {
        const dataset = read(prefix === 'c2-bulk' ? prefix+'-reviewed-candidates' : prefix+'-candidates');
        const spanish = read('reviews/'+prefix+'-spanish-review');
        const slovak = read('reviews/'+prefix+'-slovak-review');
        const preview = compileDraftPreview(dataset, spanish, slovak, read('a1-candidates').entries);
        assert.deepEqual(preview, read(prefix+'-preview'));
        return preview;
      });
      const combined = read('c2-preview');
      assert.deepEqual(combined.entries, previews.flatMap(preview => preview.entries));
      assert.deepEqual(combined.sourceBatches.map(batch => batch.previewSha256), previews.map(sha256Payload));
      assert.deepEqual(combined.sourceBatches.map(batch => batch.datasetSha256), previews.map(preview => preview.datasetSha256));
      assert.deepEqual(combined.sourceBatches.map(batch => batch.reviews), previews.map(preview => preview.reviews));
      assert.equal(new Set(combined.entries.map(entry => entry.id)).size, combined.entries.length);
      assert.equal(new Set(combined.entries.map(entry => entry.normalizedTerm)).size, combined.entries.length);
      const topics = [...new Set(accepted.entries.filter(entry => entry.classificationInventory === 'specific-notions').map(entry => entry.pcicClassification.id))].sort((a,b)=>Number(a)-Number(b));
      assert.deepEqual(combined.coverage.specificTopicIds, topics);
      console.log('Both review rounds and all preview hashes verified.');
    `], { cwd: root, encoding: 'utf8' });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  });

  it('represents every specific topic without claiming a complete or human-approved C2 curriculum', () => {
    const preview = read('c2-preview');
    expect(preview.coverage.specificTopicIds).toEqual(Array.from({ length: 20 }, (_, index) => String(index + 1)));
    expect(preview.coverage.completionClaim).toBe(false);
    expect(preview.curriculumCoverage).toBe('partial');
    expect(preview.publicationStatus).toBe('draft');
    expect(preview.reviewStatus).toBe('ai-reviewed-not-human-approved');
    expect(preview.counts.C2).toBe(preview.entries.length);
    expect(preview.entries.length).toBe(accepted.entries.length + read('c2-pilot-candidates').entries.length);
  });
});
