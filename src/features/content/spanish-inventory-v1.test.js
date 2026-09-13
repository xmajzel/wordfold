/* global describe, expect, it, __dirname */
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

function run(body) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { createHash } from 'node:crypto';
    import { validateInventoryBatch, buildInventoryReport, assertInventoryFreezeReady,
      loadInventoryContext, runCli, INVENTORY_CELLS } from './scripts/spanish-inventory-v1.mjs';
    const context = {baselineEntries:[{id:'existing-1',level:'A1'}],
      plannedSelections:[{id:'planned-1',level:'A1'}], referenceEntries:[{id:'pilot-1',level:'A1'}]};
    const batch = {schemaVersion:1,batchId:'A1-F',courseId:'es-sk',level:'A1',package:'F',status:'proposed',
      author:'inventory-worker',levelMeaning:'recommended-sense-introduction',
      references:[{id:'pcic',url:'https://cvc.cervantes.es/framework',section:'Spatial notions, A1 column',use:'Framework only; original selection.'}],
      objectives:[{id:'A1-F-location',description:'Answer where a person is.',frameworkSections:['Spatial notions'],referenceIds:['pcic'],disposition:'selected',rationale:'Basic immediate location contrast.'}],
      selections:[{id:'A1-F-001',term:'aquí',partOfSpeech:'ADV',sense:'at the present location of the speaker',proposedLevel:'A1',action:'retain-existing',existingEntryIds:['existing-1'],plannedSelectionIds:['planned-1'],objectiveIds:['A1-F-location'],levelRationale:'Answer a short immediate location question.',lowerLevelContrast:'First location contrast.',register:'neutral',region:'pan-Hispanic; es-ES audio',formNotes:'Invariable.',pronunciationNotes:'Final stressed vowel.',referenceIds:['pcic'],uncertainties:[]}],
      exclusions:[{subject:'Unbounded integers',reason:'Use a bounded compositional number system.',objectiveIds:[]}],
      coverageNotes:['Original selections, not official word placement.'],counts:{selections:1,objectives:1}};
    const selection=batch.selections[0];
    ${body}
  `], {cwd:resolve(__dirname,'../../..'),encoding:'utf8'});
}

describe('Spanish v1 sense inventory validation and read-only coverage', () => {
  it('INV-001: validates a proposed batch without equating structural validity to freeze readiness', () => {
    const result=run(`const valid=validateInventoryBatch(batch,context);
      assert.equal(valid.structurallyValid,true); assert.equal(valid.batchId,'A1-F');
      const report=buildInventoryReport([batch],context);
      assert.equal(report.structurallyValid,true); assert.equal(report.freezeReady,false);
      assert.throws(()=>assertInventoryFreezeReady(report),/freeze/i);`);
    expect(result.status).toBe(0);
  });

  it.each([
    ['batch.schemaVersion=2','schemaVersion'],
    ['batch.courseId="en-sk"','courseId'],
    ['batch.level="A0"','level'],
    ['batch.package="Z"','package'],
    ['batch.batchId="A2-F"','batchId'],
    ['batch.status="frozen"','status'],
    ['batch.levelMeaning="word-frequency"','levelMeaning'],
    ['batch.author="  "','author'],
    ['batch.references=null','references'],
    ['batch.objectives=[null]','objectives'],
    ['batch.selections=null','selections'],
    ['selection.objectiveIds=null','objectiveIds'],
    ['selection.id="es-sk:a1:published"','id'],
    ['selection.existingEntryIds=["existing-1","existing-1"]','Duplicate'],
    ['batch.references[0].url="javascript:alert(1)"','url'],
    ['batch.references[0].section=""','section'],
    ['batch.references.push(batch.references[0])','Duplicate'],
    ['batch.objectives[0].disposition="complete"','disposition'],
    ['batch.objectives[0].referenceIds=["missing"]','referenceIds'],
    ['batch.objectives[0].frameworkSections=[]','frameworkSections'],
    ['batch.objectives.push(batch.objectives[0]);batch.counts.objectives=2','Duplicate'],
    ['selection.partOfSpeech="X"','partOfSpeech'],
    ['selection.action="publish"','action'],
    ['selection.proposedLevel="C3"','proposedLevel'],
    ['selection.formNotes=" "','formNotes'],
    ['selection.pronunciationNotes=""','pronunciationNotes'],
    ['selection.lowerLevelContrast=""','lowerLevelContrast'],
    ['selection.levelRationale=""','levelRationale'],
    ['selection.uncertainties=[""]','uncertainties'],
    ['selection.existingEntryIds=["unknown"]','existingEntryIds'],
    ['selection.plannedSelectionIds=["unknown"]','plannedSelectionIds'],
    ['selection.objectiveIds=["unknown"]','objectiveIds'],
    ['selection.referenceIds=[]','referenceIds'],
    ['selection.existingEntryIds=[]','retain-existing'],
    ['selection.action="cross-reference";selection.existingEntryIds=[];selection.plannedSelectionIds=[]','cross-reference'],
    ['selection.proposedLevel="A2"','uncertainties'],
    ['selection.action="propose-relevel"','uncertainties'],
    ['context.baselineEntries[0].level="A2"','uncertainties'],
    ['batch.counts.selections=2','counts.selections'],
    ['batch.counts.objectives=1.5','counts.objectives'],
    ['batch.exclusions[0].objectiveIds=["unknown"]','objectiveIds'],
    ['batch.coverageNotes=[]','coverageNotes'],
    ['batch.selections=[];batch.counts.selections=0','selection link'],
    ['selection.action="exclude"','selection link'],
    ['batch.selections.push({...selection});batch.counts.selections=2','Duplicate'],
    ['batch.selections.push({...selection,id:"A1-F-002",term:" AQUÍ ",sense:"AT THE PRESENT LOCATION OF THE SPEAKER"});batch.counts.selections=2','Duplicate local meaning'],
  ])('INV-002/003: rejects %s with an actionable field', (mutation,error) => {
    const result=run(`${mutation};validateInventoryBatch(batch,context);`);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Inventory validation:');
    expect(result.stderr).toContain(error);
  });

  it('permits distinct senses of the same lemma and multiword syntactic POS', () => {
    const result=run(`selection.term='de ida y vuelta';selection.partOfSpeech='ADJ';
      batch.selections.push({...selection,id:'A1-F-002',sense:'a different explicitly distinguished meaning',action:'select-new'});
      batch.counts.selections=2;assert.equal(validateInventoryBatch(batch,context).structurallyValid,true);`);
    expect(result.status).toBe(0);
  });

  it('INV-004: identifies missing cells, exact coverage and pilot references without counting pilots as baseline', () => {
    const result=run(`selection.existingEntryIds=['pilot-1'];selection.plannedSelectionIds=[];
      const report=buildInventoryReport([batch],context);
      assert.equal(report.cells.expected,48);assert.equal(report.cells.missing.length,47);
      assert.deepEqual(report.baseline.uncoveredIds,['existing-1']);assert.equal(report.baseline.total,1);
      assert.deepEqual(report.planned.uncoveredIds,['planned-1']);assert.deepEqual(report.referenceOnly.usedIds,['pilot-1']);`);
    expect(result.status).toBe(0);
  });

  it('INV-005: reports collisions, relevels and uncertainties without rewriting or merging rows', () => {
    const result=run(`const other=structuredClone(batch);other.batchId='A2-F';other.level='A2';
      other.objectives[0].id='A2-F-location';other.selections[0].id='A2-F-001';
      other.selections[0].objectiveIds=['A2-F-location'];other.selections[0].proposedLevel='A2';
      other.selections[0].action='propose-relevel';other.selections[0].uncertainties=['Existing A1 placement requires adjudication.'];
      const before=JSON.stringify([batch,other]);const report=buildInventoryReport([batch,other],context);
      assert.equal(report.collisions.length,1);assert.equal(report.relevels.length,1);assert.equal(report.uncertainties.length,1);
      assert.equal(JSON.stringify([batch,other]),before);assert.equal(report.rowCounts.selections,2);
      assert.equal(report.finalUniqueSenseCount,null);assert.equal(report.freezeReady,false);`);
    expect(result.status).toBe(0);
  });

  it('INV-006: reports malformed batches and duplicate cells instead of silently claiming coverage', () => {
    const result=run(`const invalid=structuredClone(batch);invalid.selections[0].sense='';
      const report=buildInventoryReport([batch,batch,invalid],context);
      assert.equal(report.structurallyValid,false);assert(report.validationErrors.length>0);
      assert.deepEqual(report.cells.duplicates,['A1-F']);assert.equal(report.freezeReady,false);`);
    expect(result.status).toBe(0);
  });

  it('INV-006: all 48 structural cells still require independent adjudication and exact inventory acceptance', () => {
    const result=run(`const all=INVENTORY_CELLS.map(cell=>{
      const b=structuredClone(batch);b.batchId=cell;[b.level,b.package]=cell.split('-');
      b.objectives[0].id=cell+'-location';b.selections[0].id=cell+'-001';b.selections[0].term=cell;
      b.selections[0].objectiveIds=[cell+'-location'];b.selections[0].proposedLevel=b.level;
      b.selections[0].action='select-new';b.selections[0].existingEntryIds=[];b.selections[0].plannedSelectionIds=[];
      return b;
    });
    all[0].selections[0].existingEntryIds=['existing-1'];all[0].selections[0].plannedSelectionIds=['planned-1'];
    const report=buildInventoryReport(all,context);
    assert.equal(report.structurallyValid,true);assert.equal(report.cells.missing.length,0);
    assert.equal(report.baseline.uncoveredIds.length,0);assert.equal(report.planned.uncoveredIds.length,0);
    assert(report.freezeBlockers.some(b=>b.code==='independent-coverage-adjudication-required'));
    assert(report.freezeBlockers.some(b=>b.code==='exact-inventory-acceptance-required'));
    assert.throws(()=>assertInventoryFreezeReady(report),/freeze/i);`);
    expect(result.status).toBe(0);
  });

  it('INV-006: cannot spoof a frozen report by supplying a status or readiness boolean', () => {
    const result=run(`assert.throws(()=>assertInventoryFreezeReady({status:'frozen',freezeReady:true,freezeBlockers:[]}),/freeze/i);`);
    expect(result.status).toBe(0);
  });

  it('CLI validates exact file identity, reports invalid JSON and never writes report outputs', () => {
    const result=run(`const dir=mkdtempSync(join(tmpdir(),'wordfold-inventory-test-'));
      try {
        const current=loadInventoryContext();selection.existingEntryIds=[current.baselineEntries[0].id];selection.plannedSelectionIds=[];
        writeFileSync(join(dir,'A1-F.json'),JSON.stringify(batch),{flag:'wx'});
        assert.equal(runCli(['validate',join(dir,'A1-F.json')]).structurallyValid,true);
        assert.equal(runCli(['validate','--directory',dir]).cells.present.length,1);
        assert.throws(()=>runCli(['freeze-check','--directory',dir]),/freeze/i);
        writeFileSync(join(dir,'A1-P.json'),'{ broken JSON',{flag:'wx'});
        let report=runCli(['report','--directory',dir]);
        assert.equal(report.structurallyValid,false);assert(report.validationErrors.some(e=>e.message.includes('JSON')));
        assert.throws(()=>runCli(['validate','--directory',dir]),/Inventory validation:/);
        writeFileSync(join(dir,'A1-H.json'),JSON.stringify(batch),{flag:'wx'});
        assert.throws(()=>runCli(['validate',join(dir,'A1-H.json')]),/filename/);
        report=runCli(['report','--directory',dir]);assert(report.validationErrors.some(e=>e.message.includes('filename')));
        assert.deepEqual(readdirSync(dir).sort(),['A1-F.json','A1-H.json','A1-P.json']);
      } finally { rmSync(dir,{recursive:true,force:true}); }`);
    expect(result.status).toBe(0);
  });

  it('INV-006: deferred-core and prerequisite dispositions remain visible completion work', () => {
    const result=run(`batch.objectives[0].disposition='deferred-core';
      const report=buildInventoryReport([batch],context);assert.equal(report.deferredCore.length,1);
      assert(report.freezeBlockers.some(b=>b.code==='deferred-core-objectives'));
      batch.objectives[0].disposition='prerequisite';assert.equal(buildInventoryReport([batch],context).prerequisites.length,1);`);
    expect(result.status).toBe(0);
  });

  it('INV-007: loads actual 685/138/6 identities and reports without changing learner assets', () => {
    const result=run(`const paths=['a1-candidates','expansion-candidates','cefr-pilot','a1-c2-inventory'].map(n=>'assets/catalog/spanish/'+n+'.json');
      const hashes=()=>paths.map(p=>createHash('sha256').update(readFileSync(p)).digest('hex'));
      const before=hashes();const current=loadInventoryContext();
      assert.equal(current.baselineEntries.length,685);assert.equal(current.plannedSelections.length,138);assert.equal(current.referenceEntries.length,6);
      const report=runCli(['report','--directory','assets/catalog/spanish/inventory-v1/no-such-batches']);
      assert.equal(report.cells.missing.length,48);assert.equal(report.baseline.uncoveredIds.length,685);
      assert.equal(report.planned.uncoveredIds.length,138);assert.deepEqual(hashes(),before);
      assert.throws(()=>runCli(['report','--output','ignored.json']),/Unknown/);`);
    expect(result.status).toBe(0);
  });
});
