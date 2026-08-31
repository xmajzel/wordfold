/* global Buffer, afterEach, beforeEach, describe, expect, it */

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = resolve('scripts/prepare-spanish-a1-sources.mjs');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

describe('Spanish A1 source preparation', () => {
  let fixtureRoot;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(resolve(tmpdir(), 'wordfold-spanish-a1-source-'));
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  function prepareFixture(expectedArchiveSha256) {
    const candidatesPath = resolve(fixtureRoot, 'candidates.json');
    const manifestPath = resolve(fixtureRoot, 'manifest.json');
    const archivePath = resolve(fixtureRoot, 'omw.tar.xz');
    const omwPath = resolve(fixtureRoot, 'omw.xml');
    const outputPath = resolve(fixtureRoot, 'evidence.json');
    const archive = Buffer.from('pinned Spanish OMW fixture');
    const entries = [
      {
        id: 'es-sk:a1:casa:noun:1', catalogSenseId: 'es-sk:a1:casa:noun:1',
        term: 'Casa', normalizedTerm: 'casa', partOfSpeech: 'noun',
      },
      {
        id: 'es-sk:a1:de:function-word:1', catalogSenseId: 'es-sk:a1:de:function-word:1',
        term: 'de', normalizedTerm: 'de', partOfSpeech: 'function-word',
      },
    ];
    writeFileSync(candidatesPath, JSON.stringify({ entries }));
    writeFileSync(manifestPath, JSON.stringify({
      sources: [{
        id: 'omw-es:2.0', version: '2.0', sha256: expectedArchiveSha256,
        license: 'CC BY 3.0', attribution: 'MCR Spanish',
      }],
    }));
    writeFileSync(archivePath, archive);
    writeFileSync(omwPath, `<?xml version="1.0"?><LexicalResource><Lexicon>
      <LexicalEntry id="omw-es-casa-n">
        <Lemma writtenForm="casa" partOfSpeech="n" />
        <Sense id="omw-es-casa-00000001-n" synset="omw-es-00000001-n" />
      </LexicalEntry>
    </Lexicon></LexicalResource>`);
    return { archive, archivePath, candidatesPath, manifestPath, omwPath, outputPath };
  }

  it('pins the archive and records exact lemma/POS matches without inventing function-word senses', () => {
    const fixture = prepareFixture(sha256(Buffer.from('pinned Spanish OMW fixture')));
    const result = spawnSync(process.execPath, [scriptPath,
      '--candidates', fixture.candidatesPath,
      '--manifest', fixture.manifestPath,
      '--archive', fixture.archivePath,
      '--omw', fixture.omwPath,
      '--output', fixture.outputPath,
    ], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    const payload = JSON.parse(readFileSync(fixture.outputPath, 'utf8'));
    expect(payload.coverage).toMatchObject({ entries: 2, exactLemmaAndPosMatches: 1, exactLemmaAndPosRatio: 0.5 });
    expect(payload.entries[0]).toMatchObject({
      sourceId: 'omw-es:2.0',
      candidateSenses: [{
        lexicalEntryId: 'omw-es-casa-n',
        senseId: 'omw-es-casa-00000001-n',
        synsetId: 'omw-es-00000001-n',
      }],
    });
    expect(payload.entries[1]).toMatchObject({
      sourceId: 'wordfold-original-spanish-a1',
      candidateSenses: [],
      exceptionRationale: expect.stringContaining('No exact compatible OMW'),
    });
  });

  it('rejects an archive that does not match the pinned manifest checksum', () => {
    const fixture = prepareFixture('0'.repeat(64));
    const result = spawnSync(process.execPath, [scriptPath,
      '--candidates', fixture.candidatesPath,
      '--manifest', fixture.manifestPath,
      '--archive', fixture.archivePath,
      '--omw', fixture.omwPath,
      '--output', fixture.outputPath,
    ], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('OMW archive SHA-256 mismatch');
  });
});
