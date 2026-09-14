/* global __dirname, describe, expect, it */
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const root = resolve(__dirname, '../../..');
const catalog = JSON.parse(readFileSync(join(root, 'assets/pronunciation/spanish-catalog.json'), 'utf8'));
const publication = JSON.parse(readFileSync(join(root, 'assets/pronunciation/spanish-publication.json'), 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex');
function run(script, args) {
  return spawnSync(process.execPath, [join(root, 'scripts', script), ...args], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
}

describe('Spanish pronunciation tooling', () => {
  it('bundles the pinned Spanish voice samples with matching integrity metadata', () => {
    const samples = JSON.parse(readFileSync(join(root, 'assets/pronunciation/voice-samples/manifest-spanish.json'))).samples;
    expect(samples.map(sample => sample.voiceId)).toEqual(['es-ES-ElviraNeural', 'es-MX-JorgeNeural']);
    for (const sample of samples) {
      const bytes = readFileSync(join(root, 'assets/pronunciation/voice-samples', sample.fileName));
      expect(bytes.byteLength).toBe(sample.byteLength);
      expect(hash(bytes)).toBe(sample.sha256);
    }
  });

  it('checks the current catalog SQL and includes C2 in its bounded dry-run plan', () => {
    expect(run('build-pronunciation-catalog-sql.mjs', ['--spanish', '--check']).status).toBe(0);
    const result = run('pronunciation-backfill.mjs', ['plan', '--course', 'es-sk', '--json']);
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout);
    expect(plan.locales).toEqual(['es-ES', 'es-MX']);
    expect(plan.requests).toBe(catalog.length * 2);
    expect(plan.priceUsdPerMillionCharacters).toBe(30);
    expect(plan.estimatedCostUsd).toBeLessThan(plan.hardCostCeilingUsd);
    expect(catalog.some(entry => entry.sourceVersion.startsWith('wordfold-spanish-c2-'))).toBe(true);
    const blocked = run('pronunciation-backfill.mjs', ['run', '--course', 'es-sk', '--max-cost-usd', '5']);
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain('Paid generation is disabled');
  });

  it('builds and verifies complete Spanish manifests and rejects missing or wrong-language audio', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spanish-manifest-test-'));
    try {
      const rows = Object.entries({ 'es-ES': 'es-ES-ElviraNeural', 'es-MX': 'es-MX-JorgeNeural' }).flatMap(([locale, voice]) => catalog.map(entry => {
        const key = hash(`${locale}:${entry.catalogSenseId}`);
        return { catalog_sense_id: entry.catalogSenseId, locale, provider: 'azure', voice_id: voice,
          model_tier: 'Standard Neural S0', output_format: 'audio-24khz-96kbitrate-mono-mp3', synthesis_version: 'azure-public-preview-v1',
          request_key: key, content_hash: key, sha256: hash(`audio:${key}`), byte_length: 128,
          object_key: `azure-public-preview-v1/${key}.mp3`, status: 'ready', catalog_sha256: publication.catalogSha256 };
      }));
      const input = join(directory, 'rows.json');
      const output = join(directory, 'output');
      writeFileSync(input, JSON.stringify(rows));
      const build = run('pronunciation-offline-manifest.mjs', ['build', '--course', 'es-sk', '--input', input, '--output', output]);
      expect(build.stderr).toBe('');
      expect(build.status).toBe(0);
      expect(run('pronunciation-offline-manifest.mjs', ['verify', '--course', 'es-sk', '--input', output]).status).toBe(0);
      writeFileSync(input, JSON.stringify(rows.slice(1)));
      expect(run('pronunciation-offline-manifest.mjs', ['build', '--course', 'es-sk', '--input', input, '--output', output]).status).not.toBe(0);
      rows[0].locale = 'en-US';
      writeFileSync(input, JSON.stringify(rows));
      expect(run('pronunciation-offline-manifest.mjs', ['build', '--course', 'es-sk', '--input', input, '--output', output]).status).not.toBe(0);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
