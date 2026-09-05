/* global describe, expect, it */
const inventory = require('../../../assets/catalog/spanish/a1-c2-inventory.json');
const expansion = require('../../../assets/catalog/spanish/expansion-candidates.json');
const legacy = require('../../../assets/catalog/spanish/a1-candidates.json');

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

describe('Spanish objective-first sense inventory', () => {
  it('accounts for every authored expansion sense exactly once without treating fixtures as corpora', () => {
    const mapped = inventory.objectives.flatMap((objective) => objective.authoredEntryIds);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect([...mapped].sort()).toEqual(expansion.entries.map((entry) => entry.id).sort());
    expect(inventory.legacyCatalog.entryCount).toBe(legacy.entries.length);
    expect(inventory.prototypePolicy.includeInPreview).toBe(false);
    expect(inventory.supplementalCatalog.entryCount).toBe(expansion.entries.length);
    expect(inventory.supplementalCatalog.batchId).toBe(expansion.batchId);
  });

  it.each(levels)('%s counts are derived from enumerated senses and never imply completeness', (level) => {
    const objectives = inventory.objectives.filter((objective) => objective.level === level);
    const counts = inventory.counts[level];
    expect(objectives.length).toBeGreaterThan(0);
    expect(counts.objectives).toBe(objectives.length);
    expect(counts.authoredExpansion).toBe(expansion.entries.filter((entry) => entry.level === level).length);
    expect(counts.plannedAdditionalSenses).toBe(objectives.reduce((sum, objective) => sum + objective.remainingSenseSelections.length, 0));
    expect(counts.legacyDrafts).toBe(legacy.entries.filter((entry) => entry.level === level).length);
    expect(counts.coverageStatus).toBe('partial');
    for (const objective of objectives) {
      expect(objective.coverageStatus).toBe('partial');
      expect(objective.remainingSenseSelections.length).toBeGreaterThan(0);
    }
  });

  it('binds each provisional sense to a same-level objective and retrievable framework references', () => {
    const references = new Set(inventory.references.map((reference) => reference.id));
    for (const entry of expansion.entries) {
      for (const id of entry.objectiveIds) {
        const objective = inventory.objectives.find((item) => item.id === id);
        expect(objective).toBeDefined();
        expect(objective.level).toBe(entry.level);
        expect(objective.authoredEntryIds).toContain(entry.id);
      }
      expect(entry.placementStatus).toBe('provisional');
      expect(entry.levelRationale.length).toBeGreaterThan(40);
      expect(entry.placementReferenceIds.length).toBeGreaterThan(0);
      expect(entry.placementReferenceIds.every((id) => references.has(id))).toBe(true);
    }
    for (const objective of inventory.objectives) {
      expect(objective.referenceIds.every((id) => references.has(id))).toBe(true);
      for (const sense of objective.remainingSenseSelections) {
        expect(sense.status).toBe('planned-not-authored');
        expect(sense.placementStatus).toBe('provisional');
        expect(sense.levelRationale).toContain(sense.sense);
      }
    }
  });

  it('preserves explicit gaps and does not invent human, audio or proficiency approval', () => {
    expect(inventory.status).toBe('partial');
    expect(inventory.completionClaim).toBe(false);
    expect(inventory.legacyCatalog.placementStatus).toBe('needs-individual-level-adjudication');
    expect(inventory.supplementalCatalog.humanReviewStatus).toBe('not-attested');
    expect(inventory.supplementalCatalog.audioReviewStatus).toBe('not-reviewed');
    expect(inventory.unmappedAreas.length).toBeGreaterThan(0);
    expect(inventory.attribution).toContain('not certified, accredited or endorsed');
    expect(inventory.reviewContract.requiredPerspectives).toEqual(['spanish-ai', 'slovak-ai']);
  });
});
