/* global __dirname, describe, expect, it */

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const script = resolve(root, 'scripts/pronunciation-offline-manifest.mjs');
const catalog = JSON.parse(readFileSync(resolve(root, 'assets/catalog/cefr-catalog.json'), 'utf8'));
const catalogSha256 = '7a2bddcc85b7c638af7acef0209763871a8b94d37b4dbf4eee71bc458301ed8b';

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fixtureRows() {
  const voices = { 'en-US': 'en-US-AvaNeural', 'en-GB': 'en-GB-RyanNeural' };
  return Object.entries(voices).flatMap(([locale, voiceId]) => catalog.entries.map((entry) => {
    const contentHash = hash(`${locale}\0${entry.catalogSenseId}`);
    return {
      catalog_sense_id: entry.catalogSenseId,
      locale,
      provider: 'azure',
      voice_id: voiceId,
      model_tier: 'Standard Neural S0',
      output_format: 'audio-24khz-96kbitrate-mono-mp3',
      synthesis_version: 'azure-public-preview-v1',
      request_key: contentHash,
      content_hash: contentHash,
      sha256: hash(`audio\0${locale}\0${entry.catalogSenseId}`),
      byte_length: 12_000 + entry.term.length,
      object_key: `azure-public-preview-v1/${contentHash}.mp3`,
      status: 'ready',
      catalog_sha256: catalogSha256,
    };
  }));
}

function run(arguments_) {
  return spawnSync(process.execPath, [script, ...arguments_], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

describe('pronunciation offline manifest CLI', () => {
  it('builds identical immutable artifacts from identical complete asset rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wordfold-offline-manifest-'));
    const input = join(directory, 'rows.json');
    const first = join(directory, 'first');
    const second = join(directory, 'second');
    writeFileSync(input, JSON.stringify({ rows: fixtureRows() }));

    const firstRun = run(['build', '--input', input, '--output', first]);
    const secondRun = run(['build', '--input', input, '--output', second]);
    const verified = run(['verify', '--input', first]);

    expect(firstRun.status).toBe(0);
    expect(secondRun.status).toBe(0);
    expect(verified.status).toBe(0);
    expect(verified.stdout).toContain('Verified offline manifest');
    const firstPublication = JSON.parse(readFileSync(join(first, 'publication.json'), 'utf8'));
    const secondPublication = JSON.parse(readFileSync(join(second, 'publication.json'), 'utf8'));
    expect(secondPublication).toEqual(firstPublication);
    for (const entry of [firstPublication.index, ...Object.values(firstPublication.shards)]) {
      expect(readFileSync(join(second, entry.fileName))).toEqual(readFileSync(join(first, entry.fileName)));
      expect(entry.objectPath).toContain(entry.sha256);
    }
    expect(firstPublication.shards['en-US'].assetCount).toBe(8300);
    expect(firstPublication.shards['en-GB'].assetCount).toBe(8300);
  });

  it('fails closed for incomplete or altered backend metadata', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wordfold-offline-manifest-invalid-'));
    const input = join(directory, 'rows.json');
    const rows = fixtureRows();
    rows[0].status = 'failed';
    writeFileSync(input, JSON.stringify(rows));

    const result = run(['build', '--input', input, '--output', join(directory, 'output')]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid ready asset metadata');
  });

  it('requires an explicit execute flag before remote publishing', () => {
    const result = run(['publish']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Remote manifest publishing is disabled');
  });
});
