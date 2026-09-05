/* global describe, expect, it, __dirname */
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

function run(body) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { validateExpansionDataset, createAIReviewTemplate, validateAIReview, compileDraftPreview } from './scripts/spanish-expansion-pipeline.mjs';
    const entry = { id: 'es-sk:a2:exp-001-reservar', catalogSenseId: 'es-sk:a2:exp-001-reservar:verb:1',
      term:'reservar', normalizedTerm:'reservar', level:'A2', partOfSpeech:'VERB', displayPartOfSpeech:'verbo',
      definition:'Pedir que se guarde algo para usarlo después.', example:'Quiero reservar una mesa para dos personas.',
      exampleSurfaceForm:'reservar', translation:'rezervovať', levelRationale:'Arrange a simple restaurant booking in a routine transaction.',
      gender:'not-applicable', alternativeForms:[], sourceVersion:'original-1', publicationStatus:'draft',
      originalContent:true, originalContentDeclaration:'Original Wordfold learner text, not copied from PCIC.',
      objectiveIds:['a2-transactions'], placementStatus:'provisional', placementReferenceIds:['pcic-a1-a2'], register:'neutral' };
    const dataset = {schemaVersion:1, courseId:'es-sk', batchId:'expansion-1', sourceVersion:'original-1', publicationStatus:'draft',
      counts:{A1:0,A2:1,B1:0,B2:0,C1:0,C2:0}, entries:[entry]};
    const reviewed = kind => { const review = createAIReviewTemplate(dataset,kind,kind+'-agent'); review.reviewedAt='2026-09-05'; review.entries.forEach(row=>{row.decision='no-issue';row.notes='Checked meaning, example and selected sense.';}); return review; };
    ${body}
  `], { cwd: resolve(__dirname, '../../..'), encoding: 'utf8' });
  return result;
}

describe('level-aware original Spanish batches', () => {
  it('validates level counts and compiles only original fields after two independent AI reviews', () => {
    const result = run(`const output = compileDraftPreview(dataset,reviewed('spanish'),reviewed('slovak')); console.log(JSON.stringify(output));`);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.entries[0]).toMatchObject({ level:'A2', publicationStatus:'draft', translation:'rezervovať' });
    expect(output.reviewStatus).toBe('ai-reviewed-not-human-approved');
    expect(output.entries[0]).not.toHaveProperty('lexicalEvidence');
  });

  it.each([
    [`dataset.counts.A2=2; validateExpansionDataset(dataset);`, 'count'],
    [`entry.level='B2'; validateExpansionDataset(dataset);`, 'identity'],
    [`entry.translation=''; validateExpansionDataset(dataset);`, 'translation'],
    [`entry.exampleSurfaceForm='reserva'; entry.example='Una mesa para dos.'; validateExpansionDataset(dataset);`, 'surface'],
    [`entry.publicationStatus='production'; validateExpansionDataset(dataset);`, 'draft'],
    [`entry.originalContent=false; validateExpansionDataset(dataset);`, 'original'],
    [`entry.partOfSpeech='ADJ'; validateExpansionDataset(dataset);`, 'grammatical gender'],
    [`validateExpansionDataset(dataset,[entry]);`, 'Duplicate'],
    [`const review=reviewed('spanish'); entry.translation='objednať'; validateAIReview(review,dataset,'spanish');`, 'stale'],
    [`const review=reviewed('spanish'); review.entries=[]; validateAIReview(review,dataset,'spanish');`, 'coverage'],
    [`const review=reviewed('spanish'); review.entries.push(review.entries[0]); validateAIReview(review,dataset,'spanish');`, 'coverage'],
    [`const review=reviewed('spanish'); review.entries[0].level='B1'; validateAIReview(review,dataset,'spanish');`, 'identity'],
    [`compileDraftPreview(dataset,createAIReviewTemplate(dataset,'spanish','agent'),reviewed('slovak'));`, 'pending'],
    [`const review=reviewed('spanish'); review.entries[0].decision='changes-requested'; compileDraftPreview(dataset,review,reviewed('slovak'));`, 'changes-requested'],
    [`const es=reviewed('spanish'), sk=reviewed('slovak'); sk.reviewerId=es.reviewerId; compileDraftPreview(dataset,es,sk);`, 'independent'],
    [`const review=reviewed('spanish'); review.reviewerType='human'; validateAIReview(review,dataset,'spanish');`, 'AI'],
  ])('rejects invalid or unreviewed inputs: %s', (body, error) => {
    const result = run(body);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(error);
  });
});
