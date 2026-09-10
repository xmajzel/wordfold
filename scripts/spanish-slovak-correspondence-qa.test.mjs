import test from 'node:test';
import assert from 'node:assert/strict';

import { hintAtoms, parseOmwSlovakXml, wilson95 } from './spanish-slovak-correspondence-qa.mjs';

test('maps Slovak lemmas through synsets to ILIs', () => {
  const xml = `
    <LexicalResource>
      <Lexicon>
        <LexicalEntry id="one"><Lemma writtenForm="veľký" partOfSpeech="a" /><Sense synset="sk-1" /></LexicalEntry>
        <LexicalEntry id="two"><Lemma writtenForm="značný" partOfSpeech="a" /><Sense synset="sk-1" /></LexicalEntry>
        <Synset id="sk-1" ili="i42" partOfSpeech="a" />
      </Lexicon>
    </LexicalResource>`;

  assert.deepEqual([...parseOmwSlovakXml(xml).get('i42')].sort(), ['veľký', 'značný']);
});

test('normalizes member labels and alternative Slovak hints into strict atoms', () => {
  assert.deepEqual(
    hintAtoms('salón: obývačka | sala: sála / miestnosť; sieň'),
    ['obývačka', 'sála', 'miestnosť', 'sieň'],
  );
});

test('computes the expected Wilson intervals for the correspondence-risk cohorts', () => {
  const nearMiss = wilson95(61, 416);
  const absent = wilson95(56, 1141);

  assert.deepEqual(
    [nearMiss.lower, nearMiss.upper].map((value) => Number((value * 100).toFixed(2))),
    [11.59, 18.39],
  );
  assert.deepEqual(
    [absent.lower, absent.upper].map((value) => Number((value * 100).toFixed(2))),
    [3.8, 6.32],
  );
  assert.ok(nearMiss.lower > absent.upper);
});
