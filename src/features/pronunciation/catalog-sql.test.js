/* global __dirname, describe, expect, it */

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const builder = resolve(root, 'scripts/build-pronunciation-catalog-sql.mjs');
const catalogPath = resolve(root, 'assets/catalog/cefr-catalog.json');
const sqlPath = resolve(root, 'supabase/migrations/20260721180500_seed_pronunciation_catalog_inputs.sql');

describe('public pronunciation catalog SQL', () => {
  it('is deterministic and current', () => {
    const result = spawnSync(process.execPath, [builder, '--check'], { cwd: root, encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Valid pronunciation catalog SQL: 8300 entries');
  });

  it('contains only the server pronunciation allowlist fields', () => {
    const sql = readFileSync(sqlPath, 'utf8');
    const catalogSha256 = createHash('sha256').update(readFileSync(catalogPath)).digest('hex');

    expect(sql).toContain(`8300 entries, SHA-256 ${catalogSha256}`);
    expect(sql.match(/^  \('/gm)).toHaveLength(8300);
    const columnLists = [...sql.matchAll(
      /insert into public\.pronunciation_catalog_inputs \(\n([\s\S]*?)\n\) values/g,
    )].map((match) => match[1].trim());

    expect(columnLists).toHaveLength(17);
    expect(new Set(columnLists)).toEqual(new Set([
      'catalog_sense_id, text, source, source_version, catalog_sha256',
    ]));
  });
});
