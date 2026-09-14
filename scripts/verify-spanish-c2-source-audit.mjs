import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseOmw, verifiedXml, normalizeSpanish, resolveSemanticReference } from './prepare-spanish-a1-sources.mjs';
import { sha256Payload } from './spanish-catalog-utils.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pendingStatus = 'ai-reviewed-not-individually-source-verified';
const pos = { NOUN: 'n', ADJ: 'a', VERB: 'v', ADV: 'r' };
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

export function retrieveEntries(draft, bulk, spanish, english) {
  const originals = new Map(bulk.entries.map(entry => [entry.id, entry]));
  return draft.entries.filter(entry => entry.lexicalEvidenceStatus === pendingStatus).map(entry => {
    const original = originals.get(entry.id);
    assert(original && sha256Payload(original) === entry.sourceEntrySha256, 'Stale original entry.');
    const records = spanish.entriesByKey.get(`${normalizeSpanish(entry.term)}\u0000${pos[entry.partOfSpeech]}`) ?? [];
    const senses = records.flatMap(record => record.senses.map(sense => ({ senseId: sense.senseId,
      lexicalEntryId: record.lexicalEntryId,
      ...resolveSemanticReference({ ...sense, lexicalEntryId: record.lexicalEntryId }, spanish, english) })));
    return { id: entry.id, term: entry.term, definition: entry.definition, example: entry.example,
      translation: entry.translation, inputEntrySha256: sha256Payload(original), senses };
  });
}

export function prepareInputs() {
  const manifest = read('assets/catalog/spanish/c1-source-manifest.json');
  const parsed = {};
  for (const language of ['es', 'en']) {
    const base = resolve(root, '.artifacts/spanish-source-archives');
    parsed[language] = parseOmw(verifiedXml(resolve(base, `omw-${language}-2.0.tar.xz`),
      resolve(base, `omw-${language}/omw-${language}.xml`),
      manifest.sources.find(source => source.id === `omw-${language}:2.0`), language), language);
  }
  const draft = read('assets/catalog/spanish/c2-consolidated-preview.json');
  const bulk = read('assets/catalog/spanish/c2-bulk-reviewed-candidates.json');
  return { sourceManifestSha256: sha256Payload(manifest),
    sources: manifest.sources.filter(source => source.id.startsWith('omw-')),
    draftSha256: sha256Payload(draft), bulkSha256: sha256Payload(bulk),
    entries: retrieveEntries(draft, bulk, parsed.es, parsed.en) };
}

// A deterministic integrity check, not an automated judgment of semantic truth.
export function validateSourceAudit(audit, inputs) {
  assert.equal(audit.inputSha256, sha256Payload(inputs), 'Stale source audit inputs.');
  assert.equal(audit.notHumanApproval, true, 'Audit must remain AI-only.');
  assert.equal(audit.publicationStatus, 'draft', 'Source audit cannot publish content.');
  assert.equal(audit.placementStatus, 'provisional', 'Source lookup cannot certify CEFR.');
  assert.equal(audit.entries.length, inputs.entries.length, 'Incomplete source audit.');
  const inputById = new Map(inputs.entries.map(entry => [entry.id, entry]));
  const seen = new Set();
  const counts = { total: 0, supported: 0, unresolved: 0, pinnedLibrary: 0, primaryPage: 0 };
  for (const row of audit.entries) {
    const entry = inputById.get(row.entryId);
    assert(entry && !seen.has(row.entryId), 'Duplicate or unknown audit entry.');
    seen.add(row.entryId);
    assert.equal(row.inputEntrySha256, entry.inputEntrySha256, 'Stale entry decision.');
    assert.equal(row.term, entry.term, 'Term mismatch.');
    assert.equal(row.candidateSensesSha256, sha256Payload(entry.senses), 'Candidate senses changed.');
    assert(['supported', 'unresolved'].includes(row.decision) && row.reason?.trim(), 'Invalid source decision.');
    assert(Array.isArray(row.evidence), 'Missing evidence list.');
    counts.total++; counts[row.decision]++;
    if (row.decision === 'supported') {
      assert(row.evidence.length > 0, 'Supported entry needs evidence.');
      for (const evidence of row.evidence) {
        if (evidence.kind === 'pinned-library-sense') {
          assert(entry.senses.some(sense => sha256Payload(sense) === sha256Payload(evidence.sense)), 'Unknown or altered source sense.');
        } else {
          assert.equal(evidence.kind, 'primary-page-read', 'Unknown source evidence kind.');
          assert.equal(new URL(evidence.url).hostname, 'dle.rae.es', 'Unexpected primary source.');
          assert(evidence.senseLocator?.trim() && evidence.paraphrase?.trim()
            && /^\d{4}-\d{2}-\d{2}$/u.test(evidence.observedAt), 'Incomplete page evidence.');
        }
      }
      if (row.evidence.some(evidence => evidence.kind === 'pinned-library-sense')) counts.pinnedLibrary++;
      else counts.primaryPage++;
    }
  }
  assert.deepEqual(audit.counts, counts, 'Incorrect audit counts.');
  return counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(validateSourceAudit(read('assets/catalog/spanish/reviews/c2-source-verification-audit.json'), prepareInputs()), null, 2));
}
