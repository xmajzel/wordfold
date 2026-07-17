import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sources = [
  { id: 'spoken', name: 'Everyday spoken English', path: process.argv[2] ?? '/tmp/ngsl-spoken.txt' },
  { id: 'business', name: 'Business English', path: process.argv[3] ?? '/tmp/bsl.txt' },
  { id: 'academic', name: 'Academic English', path: process.argv[4] ?? '/tmp/nawl.txt' },
];
const outputPath = resolve(process.argv[5] ?? 'assets/catalog/packs.json');

function readTerms(path) {
  const lines = readFileSync(resolve(path), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const lastReference = lines.reduce(
    (result, line, index) => line.includes('Retrieved from http://www.newgeneralservicelist.org/') ? index : result,
    -1,
  );
  return lines
    .slice(lastReference + 1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.toLowerCase().startsWith('references'));
}

const packs = sources.map((source) => ({ id: source.id, name: source.name, terms: readTerms(source.path) }));
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(packs, null, 2)}\n`);
console.log(`Created ${outputPath} with ${packs.map((pack) => `${pack.id}:${pack.terms.length}`).join(', ')}.`);
