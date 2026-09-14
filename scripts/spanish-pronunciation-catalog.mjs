import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
export async function spanishPronunciationCatalog() {
  const course = JSON.parse(await readFile(new URL('assets/catalog/spanish/course.json', root), 'utf8'));
  if (course.status !== 'production') throw new Error('Spanish pronunciation requires a production course.');
  const entries = course.concepts.filter(concept => course.levels[concept.level] === 'available').map(concept => ({
    catalogSenseId: concept.id,
    term: concept.members[0].term,
    source: 'wordfold-original-spanish',
    sourceVersion: concept.sourceVersion ?? `elelex-${concept.level.toLowerCase()}-v1`,
  })).sort((a, b) => a.catalogSenseId < b.catalogSenseId ? -1 : a.catalogSenseId > b.catalogSenseId ? 1 : 0);
  if (!entries.length || new Set(entries.map(entry => entry.catalogSenseId)).size !== entries.length
    || entries.some(entry => typeof entry.term !== 'string' || !entry.term.trim() || entry.term !== entry.term.trim()
      || entry.term.length > 200 || /[\u0000-\u001f\u007f]/.test(entry.term))) {
    throw new Error('Invalid Spanish pronunciation catalog.');
  }
  const bytes = Buffer.from(`${JSON.stringify(entries)}\n`);
  return { entries, bytes, catalogSha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function loadSpanishPronunciationCatalog() {
  const catalog = await spanishPronunciationCatalog();
  const [pinned, publication] = await Promise.all([
    readFile(new URL('assets/pronunciation/spanish-catalog.json', root)),
    readFile(new URL('assets/pronunciation/spanish-publication.json', root), 'utf8').then(JSON.parse),
  ]);
  if (!pinned.equals(catalog.bytes) || publication.catalogSha256 !== catalog.catalogSha256) {
    throw new Error('Spanish pronunciation catalog is stale. Rebuild the Spanish catalog SQL before generation.');
  }
  return catalog;
}
