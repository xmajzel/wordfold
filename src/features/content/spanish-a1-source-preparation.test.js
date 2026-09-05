/* global afterEach, beforeEach, describe, expect, it */

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const scriptPath = resolve('scripts/prepare-spanish-a1-sources.mjs');
const spanishXml = `<LexicalResource><Lexicon id="omw-es" language="es" version="2.0">
  <LexicalEntry id="omw-es-limpio-a"><Lemma writtenForm="limpio" partOfSpeech="a" />
    <Sense id="omw-es-limpio-00000001-a" synset="omw-es-00000001-a" /></LexicalEntry>
  <Synset id="omw-es-00000001-a" ili="i1" partOfSpeech="a" members="omw-es-limpio-00000001-a">
    <Definition>sin suciedad &amp; manchas</Definition><Example>está &#x6c;impio</Example></Synset>
</Lexicon></LexicalResource>`;
const englishXml = `<LexicalResource><Lexicon id="omw-en" language="en" version="2.0">
  <LexicalEntry id="omw-en-clean-a" index="clean"><Lemma writtenForm="clean" partOfSpeech="a" />
    <Sense id="omw-en-clean-00000001-s" synset="omw-en-00000001-s" n="1" /></LexicalEntry>
  <Synset id="omw-en-00000001-s" ili="i1" partOfSpeech="s" members="omw-en-clean-00000001-s">
    <Definition>free from dirt</Definition><Example>a &quot;clean&quot; shirt</Example></Synset>
</Lexicon></LexicalResource>`;

function run(code) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import * as source from ${JSON.stringify(scriptPath)}; ${code}`], { encoding: 'utf8' });
}

describe('Spanish A1 source preparation', () => {
  let fixtureRoot;
  beforeEach(() => { fixtureRoot = mkdtempSync(resolve(tmpdir(), 'wordfold-spanish-a1-source-')); });
  afterEach(() => { rmSync(fixtureRoot, { recursive: true, force: true }); });

  it('maps adjective satellites by equal ILI, decodes source text, and preserves duplicate aliases in source order', () => {
    const result = run(`
      const spanish = source.parseOmw(${JSON.stringify(spanishXml)}, 'es');
      const english = source.parseOmw(${JSON.stringify(englishXml)}, 'en');
      const senses = [{ synsetId: 'omw-es-00000001-a', senseId: 'first', lexicalEntryId: 'entry1' },
        { synsetId: 'omw-es-00000001-a', senseId: 'second', lexicalEntryId: 'entry2' }];
      console.log(JSON.stringify(source.groupSemanticSenses(senses, spanish, english)));
    `);
    expect(result.status).toBe(0);
    const senses = JSON.parse(result.stdout);
    expect(senses).toHaveLength(1);
    expect(senses[0].senseId).toBe('first');
    expect(senses[0].semanticReference).toEqual({
      spanishSynsetId: 'omw-es-00000001-a', englishSynsetId: 'omw-en-00000001-s', iliId: 'i1',
      spanish: { definition: 'sin suciedad & manchas', examples: ['está limpio'] },
      english: { definition: 'free from dirt', members: ['clean'], examples: ['a "clean" shirt'] },
      sourceSenseAliases: [{ senseId: 'first', lexicalEntryId: 'entry1' }, { senseId: 'second', lexicalEntryId: 'entry2' }],
    });
  });

  it.each([
    ['ILI mismatch', englishXml.replace('ili="i1"', 'ili="i2"'), 'ILI mismatch'],
    ['missing definition', englishXml.replace('<Definition>free from dirt</Definition>', ''), 'Incomplete English'],
    ['unresolved member', englishXml.replace('members="omw-en-clean-00000001-s"', 'members="unknown"'), 'Incomplete English'],
    ['different offset', englishXml.replaceAll('00000001', '00000002'), 'Missing English'],
    ['unexpected POS', englishXml.replace('partOfSpeech="s"', 'partOfSpeech="v"'), 'Missing English'],
  ])('refuses %s', (_label, xml, message) => {
    const result = run(`source.resolveSemanticReference({ synsetId: 'omw-es-00000001-a', senseId: 'sense', lexicalEntryId: 'entry' }, source.parseOmw(${JSON.stringify(spanishXml)}, 'es'), source.parseOmw(${JSON.stringify(xml)}, 'en'));`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it('verifies the supplied XML is the exact member in the verified archive', () => {
    mkdirSync(resolve(fixtureRoot, 'omw-es'));
    const xmlPath = resolve(fixtureRoot, 'omw-es/omw-es.xml');
    const archivePath = resolve(fixtureRoot, 'omw.tar');
    writeFileSync(xmlPath, spanishXml);
    expect(spawnSync('tar', ['-cf', archivePath, '-C', fixtureRoot, 'omw-es/omw-es.xml']).status).toBe(0);
    const hash = createHash('sha256').update(readFileSync(archivePath)).digest('hex');
    const command = (sha256) => `source.verifiedXml(${JSON.stringify(archivePath)}, ${JSON.stringify(xmlPath)}, { version: '2.0', sha256: '${sha256}' }, 'es');`;
    expect(run(command(hash)).status).toBe(0);
    expect(run(command('0'.repeat(64))).stderr).toContain('archive SHA-256 mismatch');
    writeFileSync(xmlPath, spanishXml.replace('sin suciedad', 'changed content'));
    const changed = run(command(hash));
    expect(changed.status).toBe(1);
    expect(changed.stderr).toContain('XML does not match the verified archive member');
  });
});
