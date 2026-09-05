/* global describe, expect, it, __dirname */
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const candidates = require('../../../assets/catalog/spanish/expansion-candidates.json');
const ledger = require('../../../assets/catalog/spanish/expansion-editorial-corrections.json');
const root = resolve(__dirname, '../../..');

describe('reviewed Spanish expansion assets', () => {
  it('reproduces the learner preview from two independent current reviews', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { readFileSync } from 'node:fs';
      import { compileDraftPreview } from './scripts/spanish-expansion-pipeline.mjs';
      const read = path => JSON.parse(readFileSync(path, 'utf8'));
      const root = 'assets/catalog/spanish/';
      const actual = compileDraftPreview(read(root+'expansion-candidates.json'),read(root+'reviews/expansion-spanish-review.json'),read(root+'reviews/expansion-slovak-review.json'),read(root+'a1-candidates.json').entries);
      console.log(JSON.stringify(actual));
    `], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(0);
    const preview = JSON.parse(readFileSync(resolve(root, 'assets/catalog/spanish/expansion-preview.json'), 'utf8'));
    expect(JSON.parse(result.stdout)).toEqual(preview);
    expect(preview.entries).toHaveLength(candidates.entries.length);
    expect(preview.curriculumCoverage).toBe('partial');
  });

  it('retains a reversible audit trail for every pre-preview correction', () => {
    const original = JSON.parse(JSON.stringify(candidates));
    expect(ledger.notHumanReview).toBe(true);
    expect(ledger.changes).toHaveLength(22);
    for (const change of ledger.changes) {
      const entry = original.entries.find(item => item.id === change.entryId);
      for (const field of change.fields) {
        expect(entry[field.field]).toEqual(field.after);
        entry[field.field] = field.before;
      }
    }
    const hash = value => createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex');
    expect(hash(original)).toBe(ledger.authoredBaselineFileSha256);
    expect(hash(candidates)).toBe(ledger.finalFileSha256);
  });
});
