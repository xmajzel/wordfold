import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const INVENTORY_LEVELS = Object.freeze(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export const INVENTORY_PACKAGES = Object.freeze(['F', 'P', 'H', 'T', 'W', 'C', 'S', 'D']);
export const INVENTORY_CELLS = Object.freeze(INVENTORY_LEVELS.flatMap(level => INVENTORY_PACKAGES.map(pkg => `${level}-${pkg}`)));
const partsOfSpeech = ['ADJ', 'ADP', 'ADV', 'AUX', 'CCONJ', 'DET', 'INTJ', 'NOUN', 'NUM', 'PART', 'PRON', 'PROPN', 'SCONJ', 'VERB'];
const actions = ['select-new', 'retain-existing', 'propose-relevel', 'cross-reference', 'exclude'];
const dispositions = ['selected', 'existing', 'prerequisite', 'not-applicable', 'deferred-core'];
const defaultDirectory = 'assets/catalog/spanish/inventory-v1/batches';
const normalize = value => value.normalize('NFC').trim().toLocaleLowerCase('es').replace(/\s+/gu, ' ');

function assert(condition, field, detail) {
  if (!condition) throw new Error(`Inventory validation: ${field}: ${detail}`);
}
function object(value, field) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), field, 'expected an object');
}
function text(value, field) {
  assert(typeof value === 'string' && value.trim().length > 0, field, 'expected a nonempty string');
}
function array(value, field, nonempty = false) {
  assert(Array.isArray(value) && (!nonempty || value.length > 0), field, `expected ${nonempty ? 'a nonempty' : 'an'} array`);
}
function strings(value, field, nonempty = false) {
  array(value, field, nonempty);
  value.forEach((item, index) => text(item, `${field}[${index}]`));
  assert(new Set(value).size === value.length, field, 'Duplicate values');
}
function enumeration(value, allowed, field) {
  assert(allowed.includes(value), field, `expected one of ${allowed.join(', ')}`);
}
function indexRows(rows, field) {
  array(rows, field);
  const result = new Map();
  rows.forEach((row, index) => {
    object(row, `${field}[${index}]`);
    text(row.id, `${field}[${index}].id`);
    assert(row.id === row.id.trim(), `${field}[${index}].id`, 'IDs must be exact, without surrounding whitespace');
    assert(!result.has(row.id), `${field}.${row.id}`, 'Duplicate ID');
    result.set(row.id, row);
  });
  return result;
}
function contextIndexes(context) {
  object(context, 'context');
  const baseline = indexRows(context.baselineEntries, 'context.baselineEntries');
  const planned = indexRows(context.plannedSelections, 'context.plannedSelections');
  const references = indexRows(context.referenceEntries ?? [], 'context.referenceEntries');
  for (const id of references.keys()) assert(!baseline.has(id), `context.referenceEntries.${id}`, 'Duplicate baseline/reference-only identity');
  return { baseline, planned, references, existing: new Map([...baseline, ...references]) };
}
function links(value, allowed, field, nonempty = false) {
  strings(value, field, nonempty);
  for (const id of value) assert(allowed.has(id), field, `unknown exact ID ${id}`);
}

// Structural checks deliberately do not certify editorial completeness, accurate
// citations, native review, pronunciation audio, or permission to publish.
export function validateInventoryBatch(batch, context) {
  const indexes = contextIndexes(context);
  object(batch, 'batch');
  const field = batch.batchId ?? 'batch';
  assert(batch.schemaVersion === 1, `${field}.schemaVersion`, 'expected 1');
  assert(batch.courseId === 'es-sk', `${field}.courseId`, 'expected es-sk');
  enumeration(batch.level, INVENTORY_LEVELS, `${field}.level`);
  enumeration(batch.package, INVENTORY_PACKAGES, `${field}.package`);
  assert(batch.batchId === `${batch.level}-${batch.package}`, `${field}.batchId`, 'must match the owning level/package cell');
  assert(batch.status === 'proposed', `${field}.status`, 'only proposed batches belong in this pre-freeze lane');
  assert(batch.levelMeaning === 'recommended-sense-introduction', `${field}.levelMeaning`, 'expected recommended-sense-introduction');
  text(batch.author, `${field}.author`);
  array(batch.references, `${field}.references`, true);
  const references = indexRows(batch.references, `${field}.references`);
  for (const row of batch.references) {
    for (const key of ['url', 'section', 'use']) text(row[key], `${field}.references.${row.id}.${key}`);
    let url;
    try { url = new URL(row.url); } catch { /* Report the reference field below. */ }
    assert(url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password,
      `${field}.references.${row.id}.url`, 'expected an absolute HTTP(S) reference URL without credentials');
  }
  array(batch.objectives, `${field}.objectives`, true);
  const objectives = indexRows(batch.objectives, `${field}.objectives`);
  for (const row of batch.objectives) {
    const path = `${field}.objectives.${row.id}`;
    assert(row.id.startsWith(`${batch.batchId}-`), `${path}.id`, 'expected a local cell-prefixed objective ID');
    for (const key of ['description', 'rationale']) text(row[key], `${path}.${key}`);
    strings(row.frameworkSections, `${path}.frameworkSections`, true);
    links(row.referenceIds, references, `${path}.referenceIds`, true);
    enumeration(row.disposition, dispositions, `${path}.disposition`);
  }
  const selections = indexRows(batch.selections, `${field}.selections`);
  const meanings = new Set();
  const linkedObjectives = new Set();
  for (const row of selections.values()) {
    const path = `${field}.selections.${row.id}`;
    assert(row.id.startsWith(`${batch.batchId}-`), `${path}.id`, 'expected a local cell-prefixed selection ID, not a published catalog ID');
    for (const key of ['term', 'sense', 'levelRationale', 'lowerLevelContrast', 'register', 'region', 'formNotes', 'pronunciationNotes']) text(row[key], `${path}.${key}`);
    enumeration(row.partOfSpeech, partsOfSpeech, `${path}.partOfSpeech`);
    enumeration(row.proposedLevel, INVENTORY_LEVELS, `${path}.proposedLevel`);
    enumeration(row.action, actions, `${path}.action`);
    links(row.existingEntryIds, indexes.existing, `${path}.existingEntryIds`);
    links(row.plannedSelectionIds, indexes.planned, `${path}.plannedSelectionIds`);
    links(row.objectiveIds, objectives, `${path}.objectiveIds`, true);
    links(row.referenceIds, references, `${path}.referenceIds`, true);
    strings(row.uncertainties, `${path}.uncertainties`);
    if (['retain-existing', 'propose-relevel'].includes(row.action)) {
      assert(row.existingEntryIds.length > 0, `${path}.existingEntryIds`, `${row.action} requires an existing entry`);
    }
    if (row.action === 'cross-reference') {
      assert(row.existingEntryIds.length + row.plannedSelectionIds.length > 0, `${path}.action`, 'cross-reference requires an existing or planned target');
    }
    const retainsDifferentLevel = row.action === 'retain-existing'
      && row.existingEntryIds.some(id => indexes.existing.get(id).level !== row.proposedLevel);
    if (row.action === 'propose-relevel' || row.proposedLevel !== batch.level || retainsDifferentLevel) {
      assert(row.uncertainties.length > 0, `${path}.uncertainties`, 'a proposed relevel needs an explicit unresolved decision note');
    }
    const meaning = JSON.stringify([normalize(row.term), row.partOfSpeech, normalize(row.sense)]);
    assert(!meanings.has(meaning), path, 'Duplicate local meaning (normalized term/POS/sense)');
    meanings.add(meaning);
    if (row.action !== 'exclude') for (const id of row.objectiveIds) linkedObjectives.add(id);
  }
  for (const row of objectives.values()) {
    if (['selected', 'existing'].includes(row.disposition)) {
      assert(linkedObjectives.has(row.id), `${field}.objectives.${row.id}`, 'selected/existing objective requires a selection link');
    }
  }
  array(batch.exclusions, `${field}.exclusions`);
  batch.exclusions.forEach((row, index) => {
    const path = `${field}.exclusions[${index}]`;
    object(row, path);
    text(row.subject, `${path}.subject`);
    text(row.reason, `${path}.reason`);
    links(row.objectiveIds, objectives, `${path}.objectiveIds`);
  });
  strings(batch.coverageNotes, `${field}.coverageNotes`, true);
  object(batch.counts, `${field}.counts`);
  for (const key of ['selections', 'objectives']) {
    assert(Number.isSafeInteger(batch.counts[key]) && batch.counts[key] === batch[key].length,
      `${field}.counts.${key}`, `expected actual row count ${batch[key].length}`);
  }
  return { batchId: batch.batchId, structurallyValid: true, status: 'proposed', counts: { ...batch.counts } };
}

function coverage(index, used) {
  const ids = [...index.keys()].sort();
  return { total: ids.length, covered: ids.filter(id => used.has(id)).length,
    coveredIds: ids.filter(id => used.has(id)), uncoveredIds: ids.filter(id => !used.has(id)) };
}

export function buildInventoryReport(batches, context) {
  array(batches, 'batches');
  const indexes = contextIndexes(context);
  const validationErrors = [];
  const valid = [];
  const cellCounts = new Map();
  for (const [index, batch] of batches.entries()) {
    if (INVENTORY_CELLS.includes(batch?.batchId)) cellCounts.set(batch.batchId, (cellCounts.get(batch.batchId) ?? 0) + 1);
    try {
      assert(!batch?.readError, batch?.batchId ?? `batches[${index}]`, batch?.readError);
      validateInventoryBatch(batch, context); valid.push(batch);
    }
    catch (error) { validationErrors.push({ batchId: batch?.batchId ?? null, index, message: error.message }); }
  }
  const present = INVENTORY_CELLS.filter(cell => valid.some(batch => batch.batchId === cell));
  const missing = INVENTORY_CELLS.filter(cell => !present.includes(cell));
  const duplicates = [...cellCounts].filter(([, count]) => count > 1).map(([id]) => id).sort();
  const existingUsed = new Set();
  const plannedUsed = new Set();
  const lemmaGroups = new Map();
  const relevels = [], uncertainties = [], deferredCore = [], prerequisites = [];
  const rowCounts = { selections: 0, objectives: 0, byAction: Object.fromEntries(actions.map(action => [action, 0])) };
  for (const batch of valid) {
    rowCounts.selections += batch.selections.length;
    rowCounts.objectives += batch.objectives.length;
    for (const row of batch.objectives) {
      const item = { batchId: batch.batchId, objectiveId: row.id, rationale: row.rationale };
      if (row.disposition === 'deferred-core') deferredCore.push(item);
      if (row.disposition === 'prerequisite') prerequisites.push(item);
    }
    for (const row of batch.selections) {
      rowCounts.byAction[row.action]++;
      row.existingEntryIds.forEach(id => existingUsed.add(id));
      row.plannedSelectionIds.forEach(id => plannedUsed.add(id));
      const item = { batchId: batch.batchId, selectionId: row.id, term: row.term, partOfSpeech: row.partOfSpeech,
        sense: row.sense, action: row.action, proposedLevel: row.proposedLevel };
      const key = JSON.stringify([normalize(row.term), row.partOfSpeech]);
      if (!lemmaGroups.has(key)) lemmaGroups.set(key, []);
      lemmaGroups.get(key).push(item);
      const changedExisting = row.existingEntryIds.filter(id => indexes.existing.get(id).level !== row.proposedLevel);
      if (row.action === 'propose-relevel' || row.proposedLevel !== batch.level || (row.action === 'retain-existing' && changedExisting.length)) {
        relevels.push({ ...item, owningLevel: batch.level, existingEntryIds: [...row.existingEntryIds],
          existingLevels: row.existingEntryIds.map(id => ({ id, level: indexes.existing.get(id).level })) });
      }
      row.uncertainties.forEach(note => uncertainties.push({ ...item, note }));
    }
  }
  const collisions = [...lemmaGroups.values()].filter(rows => new Set(rows.map(row => row.batchId)).size > 1)
    .map(rows => ({ normalizedTerm: normalize(rows[0].term), partOfSpeech: rows[0].partOfSpeech, selections: rows }));
  const baseline = coverage(indexes.baseline, existingUsed);
  const planned = coverage(indexes.planned, plannedUsed);
  const freezeBlockers = [];
  const block = (code, count, detail) => { if (count) freezeBlockers.push({ code, count, detail }); };
  block('invalid-batches', validationErrors.length, 'Resolve all structural validation errors.');
  block('duplicate-cells', duplicates.length, 'One canonical batch must own each cell.');
  block('missing-cells', missing.length, 'All 48 coverage cells are required.');
  block('uncovered-baseline', baseline.uncoveredIds.length, 'Reconcile each existing meaning explicitly.');
  block('uncovered-planned', planned.uncoveredIds.length, 'Reconcile every planned selection, including reject/merge proposals.');
  block('unresolved-collisions', collisions.length, 'Same lemma/POS across cells needs meaning-level adjudication, not automatic merging.');
  block('unresolved-relevels', relevels.length, 'Adjudicate placement and compatibility; no runtime relevel is performed.');
  block('unresolved-uncertainties', uncertainties.length, 'Resolve recorded uncertainties before freeze.');
  block('deferred-core-objectives', deferredCore.length, 'Deferred core cannot support a completion claim.');
  // This contract defines proposed input only. Do not invent acceptance booleans
  // or allow a CLI flag to fabricate the later, exact-inventory approval record.
  block('independent-coverage-adjudication-required', 1, 'A separate independent review must establish objective completeness and resolve meaning ownership.');
  block('exact-inventory-acceptance-required', 1, 'Owner acceptance of the later exact inventory is not represented by proposed batch validity.');
  return { schemaVersion: 1, courseId: 'es-sk', status: 'proposed-inventory-report',
    structurallyValid: validationErrors.length === 0 && duplicates.length === 0,
    cells: { expected: INVENTORY_CELLS.length, present, missing, duplicates }, validationErrors,
    baseline, planned, referenceOnly: { total: indexes.references.size, usedIds: [...indexes.references.keys()].filter(id => existingUsed.has(id)).sort() },
    rowCounts, finalUniqueSenseCount: null, collisions, relevels, uncertainties, deferredCore, prerequisites,
    coverageMeaning: 'Exact-ID references are accounted for, not editorially approved; row counts are not final unique or net-new senses.',
    freezeReady: false, freezeBlockers, publicationReady: false };
}

export function assertInventoryFreezeReady(report) {
  // No report generated in this proposal-only lane can grant freeze/publication.
  const blockers = Array.isArray(report?.freezeBlockers) ? report.freezeBlockers.map(blocker => blocker?.code).filter(Boolean) : [];
  assert(false, 'freeze', `not ready: ${blockers.join(', ') || 'missing independently adjudicated inventory acceptance; unsupported readiness reports cannot authorize freeze'}`);
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
export function loadInventoryContext(rootDirectory = process.cwd()) {
  const read = name => readJson(resolve(rootDirectory, `assets/catalog/spanish/${name}.json`));
  const context = { baselineEntries: [...read('a1-candidates').entries, ...read('expansion-candidates').entries],
    plannedSelections: read('a1-c2-inventory').objectives.flatMap(objective =>
      objective.remainingSenseSelections.map(selection => ({ ...selection, level: objective.level, objectiveId: objective.id }))),
    referenceEntries: read('cefr-pilot').entries };
  contextIndexes(context);
  return context;
}

export function runCli(argv) {
  const [command, ...args] = argv;
  assert(['validate', 'report', 'freeze-check'].includes(command), 'command', 'Use validate [batchPath], report [--directory PATH], or freeze-check [--directory PATH].');
  let batchPath, directory = defaultDirectory;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--directory') {
      assert(args[index + 1] && !args[index + 1].startsWith('--'), 'arguments', '--directory requires a path');
      directory = args[++index];
    } else if (command === 'validate' && !arg.startsWith('--') && !batchPath) batchPath = arg;
    else assert(false, 'arguments', `Unknown argument ${arg}; output is stdout only`);
  }
  assert(!batchPath || directory === defaultDirectory, 'arguments', 'Use either a batch path or --directory, not both');
  const context = loadInventoryContext();
  const readBatch = path => {
    const batch = readJson(path);
    assert(basename(path) === `${batch?.batchId}.json`, path, 'filename must match the exact batchId');
    return batch;
  };
  if (batchPath) return validateInventoryBatch(readBatch(resolve(batchPath)), context);
  const path = resolve(directory);
  const files = existsSync(path) ? readdirSync(path).filter(file => file.endsWith('.json')).sort() : [];
  const batches = files.map(file => {
    try { return readBatch(resolve(path, file)); }
    catch (error) { return { batchId: file, readError: `Cannot read batch JSON ${file}: ${error.message}` }; }
  });
  const report = buildInventoryReport(batches, context);
  if (command === 'validate') {
    assert(files.length > 0, 'directory', 'No batch files found; use report to inspect missing coverage');
    assert(report.structurallyValid, 'batches', JSON.stringify({ validationErrors: report.validationErrors, duplicateCells: report.cells.duplicates }));
  }
  if (command === 'freeze-check') assertInventoryFreezeReady(report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(runCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
