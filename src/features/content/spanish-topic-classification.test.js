/* global describe, expect, it, __dirname */
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

describe('published Spanish topic classifications', () => {
  it('covers the exact course content with two AI passes and a matching runtime index', () => {
    const result = spawnSync(process.execPath, ['scripts/spanish-topic-classification.mjs', 'validate'], {
      cwd: resolve(__dirname, '../../..'),
      encoding: 'utf8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('concepts: 5888');
  });
});
