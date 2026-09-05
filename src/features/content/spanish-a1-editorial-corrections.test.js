/* global describe, expect, it */

const { createHash } = require('node:crypto');
const candidates = require('../../../assets/catalog/spanish/a1-candidates.json');
const ledger = require('../../../assets/catalog/spanish/a1-editorial-corrections.json');
const secondLedger = require('../../../assets/catalog/spanish/second-editorial-corrections.json');

// Each ledger describes its own frozen output. Undo the second pass before
// checking the first, rather than rewriting or losing its original decisions.
const firstPassCandidates = JSON.parse(JSON.stringify(candidates));
const entriesById = new Map(firstPassCandidates.entries.map((entry) => [entry.id, entry]));
for (const correction of secondLedger.changes.filter((change) => change.asset.endsWith('a1-candidates.json'))) {
  for (const change of correction.changes) entriesById.get(correction.entryId)[change.field] = change.before;
}
const entryFor = (term) => candidates.entries.find((entry) => entry.term === term);

describe('approved Spanish A1 editorial corrections', () => {
  it('records reversible corrections against the exact catalog the reports reviewed', () => {
    const original = JSON.parse(JSON.stringify(firstPassCandidates));
    const originalById = new Map(original.entries.map((entry) => [entry.id, entry]));
    const editableFields = new Set([
      'definition', 'example', 'exampleSurfaceForm', 'translation', 'partOfSpeech',
      'displayPartOfSpeech', 'gender', 'alternativeForms',
    ]);

    expect(new Set(ledger.changes.map((entry) => entry.entryId)).size).toBe(ledger.changes.length);
    for (const correction of ledger.changes) {
      const current = entriesById.get(correction.entryId);
      expect(current.catalogSenseId).toBe(correction.catalogSenseId);
      for (const change of correction.changes) {
        expect(editableFields.has(change.field)).toBe(true);
        expect(current[change.field]).toEqual(change.after);
        expect(change.after).not.toEqual(change.before);
        originalById.get(correction.entryId)[change.field] = change.before;
      }
    }

    const restoredHash = createHash('sha256')
      .update(`${JSON.stringify(original, null, 2)}\n`)
      .digest('hex');
    expect(restoredHash).toBe(ledger.candidateFileBeforeSha256);
    expect(candidates.entries).toHaveLength(500);
    expect(candidates.publicationStatus).toBe('draft');
    expect(candidates.entries.every((entry) => entry.publicationStatus === 'draft')).toBe(true);
  });

  it('preserves and resolves all 94 findings without presenting them as human decisions', () => {
    expect(ledger.notHumanReview).toBe(true);
    expect(ledger.findings).toHaveLength(94);
    expect(new Set(ledger.findings.map((finding) => finding.findingId)).size).toBe(94);
    expect(ledger.findings.filter((finding) => finding.findingId.startsWith('spanish:'))).toHaveLength(68);
    expect(ledger.findings.filter((finding) => finding.findingId.startsWith('slovak:'))).toHaveLength(26);
    expect(ledger.findings.filter((finding) => finding.disposition === 'retained-with-rationale')
      .map((finding) => finding.findingId)).toEqual(['slovak:422', 'slovak:492']);

    for (const finding of ledger.findings) {
      const current = entriesById.get(finding.entryId);
      expect(current.catalogSenseId).toBe(finding.catalogSenseId);
      expect(finding.rationale.length).toBeGreaterThan(20);
      expect(finding.sourceFinding.title).toBeTruthy();
      for (const [field, value] of Object.entries(finding.after)) {
        expect(current[field]).toEqual(value);
      }
    }
  });

  it('keeps the reported Spanish senses aligned with their Slovak hints', () => {
    expect(entryFor('fuerte')).toMatchObject({
      example: 'Mi hermano es fuerte y puede levantar esta caja.', translation: 'silný',
    });
    expect(entryFor('pareja')).toMatchObject({
      example: 'Mi pareja busca un apartamento pequeño.', translation: 'partner; partnerka',
    });
    expect(entryFor('pollo').definition).not.toMatch(/Ave doméstica/u);
    expect(entryFor('pollo').translation).toBe('kuracie mäso');
    expect(entryFor('pedir').definition).toContain('bar o restaurante');
    expect(entryFor('pedir').translation).toBe('objednať si');
    expect(entryFor('contestar').example).toBe('Ahora no puedo contestar tu mensaje.');
    expect(entryFor('apartamento').translation).toBe('byt');
    expect(entryFor('horario').translation).toBe('časový rozvrh');
    expect(entryFor('subir').definition).not.toContain('arriba');
    expect(entryFor('bajar').definition).not.toContain('abajo');
    expect(entryFor('mañana').translation).toBe('ráno; dopoludnie');
    expect(entryFor('llamarse').exampleSurfaceForm).toBe('llamarse');
    for (const entry of candidates.entries) expect(entry.example).toContain(entry.exampleSurfaceForm);
  });

  it('exposes agreement, exceptional plurals and nominal-expression gender', () => {
    for (const entry of candidates.entries.filter((candidate) => candidate.partOfSpeech === 'ADJ')) {
      expect(entry.alternativeForms.some((form) => form.type.includes('plural'))).toBe(true);
      if (entry.gender === 'masculine') {
        expect(entry.alternativeForms.some((form) => form.type === 'femenino singular')).toBe(true);
      }
    }
    expect(entryFor('lápiz').alternativeForms).toContainEqual({ form: 'lápices', type: 'plural' });
    expect(entryFor('pez').alternativeForms).toContainEqual({ form: 'peces', type: 'plural' });
    expect(entryFor('joven').alternativeForms[0].form).toBe('jóvenes');
    expect(entryFor('agua').gender).toBe('feminine');
    expect(entryFor('agua').alternativeForms.some((form) => form.form === 'agua fría')).toBe(true);
    expect(entryFor('hambre').gender).toBe('feminine');
    expect(entryFor('vacaciones').alternativeForms.some((form) => form.form === 'las vacaciones')).toBe(true);
    for (const [term, gender, article] of [
      ['tiempo libre', 'masculine', 'el'], ['correo electrónico', 'masculine', 'el'],
      ['oficina de correos', 'feminine', 'la'],
    ]) {
      const entry = entryFor(term);
      expect(entry).toMatchObject({ partOfSpeech: 'NOUN', gender, isMultiwordExpression: true });
      expect(entry.alternativeForms).toContainEqual({ form: `${article} ${term}`, type: 'con artículo' });
    }
  });
});
