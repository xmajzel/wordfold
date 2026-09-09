import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

function canonicalJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporaryPath, canonicalJson(value));
  renameSync(temporaryPath, path);
}

const template = JSON.parse(readFileSync(resolve('assets/catalog/spanish/b1-source-manifest.json'), 'utf8'));
for (const level of ['B2', 'C1']) {
  const slug = level.toLowerCase();
  const manifest = structuredClone(template);
  manifest.level = level;
  manifest.sources = manifest.sources.map((source) => source.id === 'wordfold-original-spanish-b1'
    ? {
      ...source,
      id: `wordfold-original-spanish-${slug}`,
      version: 'draft-2026-09-09',
      transformations: source.transformations.map((item) => item.replace('B1', level)),
    }
    : source);
  writeJsonAtomic(resolve(`assets/catalog/spanish/${slug}-source-manifest.json`), manifest);
}
