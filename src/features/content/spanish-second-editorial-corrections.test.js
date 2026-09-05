/* global __dirname, describe, expect, it */

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const candidates = require('../../../assets/catalog/spanish/a1-candidates.json');
const pilot = require('../../../assets/catalog/spanish/cefr-pilot.json');
const ledger = require('../../../assets/catalog/spanish/second-editorial-corrections.json');

const entryFor = (term) => candidates.entries.find((entry) => entry.term === term);
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const hash = (value) => createHash('sha256').update(value).digest('hex');

describe('second independent Spanish and Slovak AI editorial reconciliation', () => {
  it('fixes the four required definition and exceptional-form findings', () => {
    expect(entryFor('continente').definition).toBe('Una de las grandes partes de tierra del planeta, como Europa o África.');
    expect(entryFor('arte').gender).toBe('masculine');
    expect(entryFor('arte').alternativeForms).toContainEqual({ form: 'las artes', type: 'plural normalmente femenino' });
    expect(entryFor('examen').alternativeForms).toContainEqual({ form: 'exámenes', type: 'plural' });
    expect(entryFor('origen').alternativeForms).toContainEqual({ form: 'orígenes', type: 'plural' });
  });

  it('records all 36 findings without claiming native review, grading or audio validation', () => {
    expect(ledger.notHumanReview).toBe(true);
    expect(ledger.levelValidation).toBe('not-performed');
    expect(ledger.audioValidation).toBe('not-performed');
    expect(ledger.findings).toHaveLength(36);
    expect(new Set(ledger.findings.map((finding) => finding.findingId)).size).toBe(36);
    expect(ledger.findings.filter((finding) => finding.severity === 'required-fix'))
      .toHaveLength(4);
    for (const finding of ledger.findings) {
      expect(finding.humanDecision).toBeNull();
      expect(finding.rationale.length).toBeGreaterThan(20);
      expect(finding.sourceFinding).toBeTruthy();
      if (finding.severity === 'required-fix') expect(finding.disposition).toBe('applied');
      if (finding.disposition === 'applied') {
        expect(ledger.changes.some((change) => change.entryId === finding.entryId)).toBe(true);
      }
    }
    expect(ledger.counts).toEqual({
      reportFindings: 36, appliedFindings: 30, retainedWithRationale: 6, changedEntries: 30,
    });
  });

  it('reverses every changed field back to the exact reviewed A1 payload and frozen pilot payload', () => {
    const editable = new Set(['definition', 'example', 'exampleSurfaceForm', 'translation', 'alternativeForms']);
    for (const asset of ledger.assets) {
      const raw = readFileSync(resolve(__dirname, '../../..', asset.path), 'utf8');
      expect(hash(raw)).toBe(asset.fileAfterSha256);
      const restored = JSON.parse(raw);
      const byId = new Map(restored.entries.map((entry) => [entry.id, entry]));
      for (const correction of ledger.changes.filter((change) => change.asset === asset.path)) {
        const entry = byId.get(correction.entryId);
        expect(entry.catalogSenseId).toBe(correction.catalogSenseId);
        for (const change of correction.changes) {
          expect(editable.has(change.field)).toBe(true);
          expect(entry[change.field]).toEqual(change.after);
          expect(change.after).not.toEqual(change.before);
          entry[change.field] = change.before;
        }
      }
      expect(hash(JSON.stringify(canonical(restored)))).toBe(asset.payloadBeforeSha256);
      if (asset.path.endsWith('a1-candidates.json')) {
        expect(hash(`${JSON.stringify(restored, null, 2)}\n`)).toBe(asset.fileBeforeSha256);
      }
      expect(restored.entries).toHaveLength(asset.entryCount);
      expect(restored.publicationStatus).toBe('draft');
    }
  });

  it('keeps coordinated senses and Slovak valency explicit', () => {
    expect(entryFor('alquiler').translation).toBe('nájomné');
    expect(entryFor('lavarse').translation).toBe('umyť sa; umyť si');
    expect(entryFor('vivir').translation).toBe('bývať; žiť');
    expect(entryFor('cámara').translation).toBe('fotoaparát; kamera');
    expect(entryFor('menú').example).toBe('Leo el menú antes de elegir la comida.');
    expect(entryFor('té').definition).not.toMatch(/\bté\b/iu);
    expect(pilot.entries.find((entry) => entry.term === 'plantear')).toMatchObject({
      example: 'El informe plantea un problema importante.', translation: 'nastoliť',
    });
    expect(pilot.entries.find((entry) => entry.term === 'cuidar').translation).toBe('starať sa o');
    expect(pilot.entries.find((entry) => entry.term === 'aquiescencia')).toMatchObject({
      definition: 'En este contexto, consentimiento que se comunica sin palabras, por ejemplo mediante el silencio.',
      translation: 'tichý súhlas',
    });
  });
});
