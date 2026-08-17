/* global __dirname, describe, expect, it */

const { spawnSync } = require('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const root = resolve(__dirname, '../../..');
const runner = resolve(root, 'scripts/pronunciation-backfill.mjs');

function run(arguments_) {
  return spawnSync(process.execPath, [runner, ...arguments_], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('pronunciation catalog backfill CLI', () => {
  it('pins the exact two-locale plan and cost ceiling', () => {
    const result = run(['plan', '--', '--json']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      catalogSha256: '7a2bddcc85b7c638af7acef0209763871a8b94d37b4dbf4eee71bc458301ed8b',
      synthesisVersion: 'azure-public-preview-v1',
      locales: ['en-US', 'en-GB'],
      catalogEntries: 8300,
      requests: 16600,
      charactersPerLocale: 62156,
      billableCharacters: 124312,
      priceUsdPerMillionCharacters: 15,
      estimatedCostUsd: 1.86468,
      hardCostCeilingUsd: 2,
    }));
  });

  it('fails before authentication unless paid execution and its sufficient cap are explicit', () => {
    const disabled = run(['--', 'run', '--max-cost-usd', '2']);
    expect(disabled.status).toBe(1);
    expect(disabled.stderr).toContain('Paid generation is disabled');

    const insufficient = run(['run', '--execute', '--max-cost-usd', '1.86']);
    expect(insufficient.status).toBe(1);
    expect(insufficient.stderr).toContain('exceeds the supplied $1.86 cap');

    const excessive = run(['run', '--execute', '--max-cost-usd', '2.01']);
    expect(excessive.status).toBe(1);
    expect(excessive.stderr).toContain('cannot exceed the hard $2 ceiling');
  });

  it('rejects a catalog that differs from the reviewed checksum', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wordfold-backfill-catalog-'));
    const catalogPath = join(directory, 'catalog.json');
    const catalog = JSON.parse(readFileSync(resolve(root, 'assets/catalog/cefr-catalog.json'), 'utf8'));
    catalog.entries[0].term = `${catalog.entries[0].term} changed`;
    writeFileSync(catalogPath, JSON.stringify(catalog));

    const result = run(['plan', '--catalog', catalogPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Catalog checksum mismatch');
  });

  it('atomically checkpoints ready work and skips it on resume', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wordfold-backfill-checkpoint-'));
    const checkpointPath = join(directory, 'checkpoint.json');
    const moduleUrl = pathToFileURL(runner).href;
    const program = `
      import { executeBackfill } from ${JSON.stringify(moduleUrl)};
      const plan = {
        schemaVersion: 1,
        catalogSha256: 'test-catalog',
        synthesisVersion: 'azure-public-preview-v1',
        locales: ['en-US', 'en-GB'],
        requests: 4,
        billableCharacters: 8,
        entries: [
          { catalogSenseId: 'one', term: 'one' },
          { catalogSenseId: 'two', term: 'two' },
        ],
      };
      let calls = 0;
      const invoke = async () => { calls += 1; };
      await executeBackfill({ plan, checkpointPath: ${JSON.stringify(checkpointPath)}, invoke });
      const firstCalls = calls;
      await executeBackfill({ plan, checkpointPath: ${JSON.stringify(checkpointPath)}, invoke });
      console.log(JSON.stringify({ firstCalls, totalCalls: calls }));
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ firstCalls: 4, totalCalls: 4 });
    const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
    expect(checkpoint.completedKeys).toHaveLength(4);
    expect(checkpoint.requests).toBe(4);
  });

  it('persists a conservative attempt budget across restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wordfold-backfill-budget-'));
    const journalPath = join(directory, 'attempts.ndjson');
    const moduleUrl = pathToFileURL(runner).href;
    const program = `
      import { createAttemptBudget } from ${JSON.stringify(moduleUrl)};
      const plan = {
        schemaVersion: 1,
        catalogSha256: 'test-catalog',
        synthesisVersion: 'azure-public-preview-v1',
        locales: ['en-US', 'en-GB'],
        requests: 2,
        billableCharacters: 6,
        entries: [{ catalogSenseId: 'one', term: 'one' }],
      };
      const budget = await createAttemptBudget(plan, ${JSON.stringify(journalPath)}, 0.0001);
      await budget.record({ key: 'one\\u0000en-US', characters: 3 });
      await budget.record({ key: 'one\\u0000en-GB', characters: 3 });
      let error = '';
      try {
        await budget.record({ key: 'one\\u0000en-US', characters: 3 });
      } catch (caught) {
        error = caught.message;
      }
      await budget.close();
      const resumed = await createAttemptBudget(plan, ${JSON.stringify(journalPath)}, 0.0001);
      console.log(JSON.stringify({
        attemptedCharacters: resumed.attemptedCharacters,
        maximumCharacters: resumed.maximumCharacters,
        error,
      }));
      await resumed.close();
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      attemptedCharacters: 6,
      maximumCharacters: 6,
      error: 'The durable $0.0001 attempt ceiling has been reached; no request was sent.',
    });
  });
});
