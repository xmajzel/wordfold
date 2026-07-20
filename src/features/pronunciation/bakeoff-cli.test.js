/* global __dirname, afterEach, describe, expect, it */

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const cli = resolve(root, 'scripts/pronunciation-bakeoff.mjs');

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      AZURE_SPEECH_KEY: '',
      AZURE_SPEECH_REGION: '',
      GOOGLE_APPLICATION_CREDENTIALS: '',
    },
  });
}

describe('pronunciation bakeoff CLI', () => {
  const temporaryDirectories = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('validates the seven-locale screening inputs', () => {
    const result = run('validate');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('210 items, 7 locales, 840 planned samples');
    expect(result.stderr).toBe('');
  });

  it('creates a deterministic offline cost plan', () => {
    const first = run('plan', '--', '--json');
    const second = run('plan', '--json');

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    const plan = JSON.parse(first.stdout);
    expect(plan).toMatchObject({
      locales: 7,
      corpusItems: 210,
      generatedSamples: 840,
      hardCostCeilingUsd: 20,
    });
    expect(plan.estimatedCostUsd).toBeGreaterThan(0);
    expect(plan.estimatedCostUsd).toBeLessThan(1);
    expect(plan.providers).toEqual([
      expect.objectContaining({ provider: 'google', samples: 420 }),
      expect.objectContaining({ provider: 'azure', samples: 420 }),
    ]);
    expect(Object.values(plan.nativeReview)).toEqual(Array(7).fill('needs_native_review'));
  });

  it('never starts paid generation without explicit execution', () => {
    const result = run('generate', '--max-cost-usd', '1', '--output', '.artifacts/test-bakeoff');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Paid generation is disabled');
  });

  it('enforces the hard cost ceiling before provider access', () => {
    const result = run(
      'generate', '--execute', '--max-cost-usd', '20.01', '--output', '.artifacts/test-bakeoff',
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot exceed the hard $20 ceiling');
  });

  it('blocks provider access until every locale has native corpus approval', () => {
    const result = run(
      'generate', '--execute', '--max-cost-usd', '1', '--output', '.artifacts/test-bakeoff',
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Native corpus review is required before generation');
    expect(result.stderr).toContain('en-US');
    expect(result.stderr).toContain('sk-SK');
  });

  it('requires the private answer key to be stored outside reviewer output', () => {
    const result = run(
      'blind',
      '--input', '.artifacts/missing-generation',
      '--output', '.artifacts/reviewer',
      '--key-output', '.artifacts/reviewer/answer-key.json',
      '--seed', 'test-seed',
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--key-output must be outside the reviewer output directory');
  });

  it('recommends only fully and independently rated voices that pass the quality gates', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'wordfold-bakeoff-'));
    temporaryDirectories.push(directory);
    const blindDirectory = resolve(directory, 'blind');
    mkdirSync(blindDirectory);
    const locales = ['en-US', 'en-GB', 'es-ES', 'es-MX', 'de-DE', 'el-GR', 'sk-SK'];
    const samples = locales.map((locale, index) => ({
      blindId: `blind-${index}`,
      identity: `identity-${index}`,
      provider: 'google',
      model: 'Chirp 3 HD',
      voiceId: `${locale}-Chirp3-HD-Aoede`,
      locale,
      itemId: `${locale}-common-01`,
      sha256: 'audio-sha',
      latencyMs: 100 + index,
    }));
    const corpusSha256 = createHash('sha256')
      .update(readFileSync(resolve(root, 'assets/pronunciation/bakeoff-corpus.json')))
      .digest('hex');
    const candidatesSha256 = createHash('sha256')
      .update(readFileSync(resolve(root, 'assets/pronunciation/bakeoff-candidates.json')))
      .digest('hex');
    const keyPath = resolve(directory, 'private-key.json');
    const ratingsPath = resolve(directory, 'ratings.json');
    writeFileSync(keyPath, JSON.stringify({ schemaVersion: 1, corpusSha256, candidatesSha256, samples }));
    writeFileSync(resolve(blindDirectory, 'reviewer-manifest.json'), JSON.stringify({
      schemaVersion: 1,
      samples: samples.map(({ blindId }) => ({ blindId })),
    }));
    writeFileSync(ratingsPath, JSON.stringify({
      schemaVersion: 1,
      ratings: samples.flatMap(({ blindId }) => [
        { blindId, reviewerId: 'rater-a', acceptable: true, wrongLocale: false },
        { blindId, reviewerId: 'rater-b', acceptable: true, wrongLocale: false },
      ]),
    }));

    const result = run('score', '--input', blindDirectory, '--key', keyPath, '--ratings', ratingsPath);

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      samples: 7,
      fullyRatedSamples: 7,
      incompleteSamples: 0,
      evaluationComplete: true,
      canRecommend: true,
    });
    expect(report.recommendations).toHaveLength(7);
    expect(report.results.every((entry) => entry.passesScreening)).toBe(true);
  });
});
