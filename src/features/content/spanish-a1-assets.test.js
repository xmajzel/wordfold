/* global __dirname, describe, expect, it */

const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const candidatesPath = resolve(root, 'assets/catalog/spanish/a1-candidates.json');
const evidencePath = resolve(root, 'assets/catalog/spanish/a1-lexical-evidence.json');
const sourcesPath = resolve(root, 'assets/catalog/spanish/a1-source-manifest.json');
const pipelinePath = resolve(root, 'scripts/spanish-a1-pipeline.mjs');

describe('committed Spanish A1 draft assets', () => {
  it('validates all 500 candidates against their pinned source and lexical evidence', () => {
    const result = spawnSync(process.execPath, [pipelinePath, 'validate',
      '--sources', sourcesPath,
      '--candidates', candidatesPath,
      '--evidence', evidencePath,
    ], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Validated 500 draft Spanish A1 candidates/u);
  });

  it('retains useful examples without the rejected meta-linguistic templates', () => {
    const candidates = JSON.parse(readFileSync(candidatesPath, 'utf8'));
    const forbiddenTemplates = /(?:conversación básica|actividad básica|\busamos\b|\baparece\b|para describir)/iu;
    const openings = new Map();

    for (const entry of candidates.entries) {
      expect(entry.example).not.toMatch(forbiddenTemplates);
      expect(entry.example).toContain(entry.exampleSurfaceForm);
      const opening = entry.example
        .normalize('NFKC')
        .toLocaleLowerCase('es')
        .split(/\s+/u)
        .slice(0, 4)
        .join(' ');
      openings.set(opening, (openings.get(opening) ?? 0) + 1);
    }

    expect(Math.max(...openings.values())).toBeLessThanOrEqual(5);
  });

  it('grounds all 500 corrected candidates and supplies licensed semantic descriptions for every unique option', () => {
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    expect(evidence.coverage).toMatchObject({
      entries: 500,
      exactLemmaAndPosMatches: 500,
      exactLemmaAndPosRatio: 1,
      targetRatio: 0.8,
    });
    const exceptions = evidence.entries.filter((entry) => entry.candidateSenses.length === 0);
    expect(exceptions).toHaveLength(0);
    const uniqueSynsets = new Set();
    for (const entry of evidence.entries) {
      expect(new Set(entry.candidateSenses.map((sense) => sense.synsetId)).size).toBe(entry.candidateSenses.length);
      for (const sense of entry.candidateSenses) {
        const reference = sense.semanticReference;
        expect(reference.english.definition.trim()).not.toBe('');
        expect(reference.english.members.length).toBeGreaterThan(0);
        expect(reference.sourceSenseAliases[0].senseId).toBe(sense.senseId);
        uniqueSynsets.add(sense.synsetId);
      }
    }
    expect(uniqueSynsets.size).toBeGreaterThan(2800);
    expect(evidence.semanticSource.licenseText).toBe(readFileSync(resolve(root, 'assets/licenses/WORDNET_3_0_LICENSE.txt'), 'utf8'));
  });
});
