import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const mandatoryPilotTerms = new Set(['bank', 'present', 'right', 'run']);
const wordnetParts = {
  noun: ['n'],
  verb: ['v'],
  adjective: ['a', 's'],
  adverb: ['r'],
};

function parseArgs(argv) {
  const options = {
    mode: 'pilot',
    chunkSize: 200,
    outputDirectory: resolve('.artifacts/cefr-learner-definitions'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mode') options.mode = argv[++index];
    else if (argument === '--chunk-size') options.chunkSize = Number(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!['pilot', 'all'].includes(options.mode)) throw new Error('--mode must be pilot or all.');
  if (!Number.isInteger(options.chunkSize) || options.chunkSize < 1) throw new Error('--chunk-size must be a positive integer.');
  return options;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function sourceRows(path) {
  const [headers, ...rows] = parseCsv(readFileSync(path, 'utf8'));
  return new Map(rows.map((values, index) => [
    index + 2,
    Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ''])),
  ]));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function contextsFor(entry, provenance, rowsBySource) {
  const ignored = new Set(['headword', 'pos', 'CEFR']);
  const contexts = [];
  for (const record of provenance?.records ?? []) {
    const row = rowsBySource[record.source]?.get(record.row);
    if (!row) continue;
    for (const [label, rawValue] of Object.entries(row)) {
      const value = rawValue.trim();
      if (!ignored.has(label) && value) contexts.push({
        source: record.source,
        row: record.row,
        level: record.level,
        partOfSpeech: record.partOfSpeech,
        primary: record.source === entry.source && record.level === entry.level,
        label,
        value,
      });
    }
  }
  const seen = new Set();
  return contexts.filter(({ source, row, label, value }) => {
    const key = `${source}\u0000${row}\u0000${label}\u0000${value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function desiredWordnetParts(entry) {
  return new Set(entry.sourcePartOfSpeech.flatMap((part) => wordnetParts[part.toLocaleLowerCase('en')] ?? []));
}

function riskScore(entry) {
  return (5 * Math.min(entry.candidateSenses.length, 20))
    + (8 * Math.min(entry.selectionSignals.otherPartOfSpeechFamilies, 3))
    + (entry.sourcePartOfSpeech.length > 1 ? 15 : 0)
    + (entry.selectionSignals.provenanceLevels.length > 1 ? 12 : 0)
    + (entry.sourceContexts.length > 0 ? 15 : 0)
    + (entry.sourceContexts.length > 1 ? 6 : 0)
    + Math.min(Math.max(entry.current.definition.split(/\s+/).length - 12, 0), 10)
    + (entry.current.example ? 0 : 6);
}

function comparePilotRisk(left, right, contextLabels = new Set()) {
  const leftContextBonus = left.sourceContexts.some(({ label }) => !contextLabels.has(label)) ? 12 : 0;
  const rightContextBonus = right.sourceContexts.some(({ label }) => !contextLabels.has(label)) ? 12 : 0;
  return (riskScore(right) + rightContextBonus) - (riskScore(left) + leftContextBonus)
    || right.candidateSenses.length - left.candidateSenses.length
    || left.normalizedTerm.localeCompare(right.normalizedTerm, 'en');
}

function pilotSelection(prepared) {
  const targets = { A1: 17, A2: 17, B1: 17, B2: 17, C1: 16, C2: 16 };
  const partOfSpeechMinimums = { noun: 4, verb: 4, adjective: 3, adverb: 2 };
  const selected = [];
  for (const level of levels) {
    const candidates = prepared.filter((entry) => entry.level === level);
    const levelSelected = candidates.filter((entry) => mandatoryPilotTerms.has(entry.normalizedTerm));
    const selectedIds = new Set(levelSelected.map((entry) => entry.entryId));
    for (const [partOfSpeech, minimum] of Object.entries(partOfSpeechMinimums)) {
      const alreadySelected = levelSelected.filter((entry) => entry.current.partOfSpeech === partOfSpeech).length;
      const needed = Math.max(0, minimum - alreadySelected);
      const matches = candidates
        .filter((entry) => entry.current.partOfSpeech === partOfSpeech && !selectedIds.has(entry.entryId))
        .sort((left, right) => comparePilotRisk(left, right));
      for (const entry of matches.slice(0, needed)) {
        levelSelected.push(entry);
        selectedIds.add(entry.entryId);
      }
    }
    while (levelSelected.length < targets[level]) {
      const contextLabels = new Set(levelSelected.flatMap((entry) => entry.sourceContexts.map(({ label }) => label)));
      const next = candidates
        .filter((entry) => !selectedIds.has(entry.entryId))
        .sort((left, right) => comparePilotRisk(left, right, contextLabels))[0];
      if (!next) throw new Error(`Not enough ${level} entries for the pilot.`);
      levelSelected.push(next);
      selectedIds.add(next.entryId);
    }
    selected.push(...levelSelected.sort((left, right) => comparePilotRisk(left, right)));
  }
  if (selected.length !== 100 || [...mandatoryPilotTerms].some((term) => !selected.some((entry) => entry.normalizedTerm === term))) {
    throw new Error('Pilot selection must contain 100 entries and every mandatory regression term.');
  }
  return selected;
}

const options = parseArgs(process.argv.slice(2));
const acceptedPilotPath = resolve(options.outputDirectory, 'pilot', 'compiled.json');
const acceptedPilot = options.mode === 'all' && existsSync(acceptedPilotPath)
  ? JSON.parse(readFileSync(acceptedPilotPath, 'utf8')).entries
  : {};
const catalogText = readFileSync(resolve('assets/catalog/cefr-catalog.json'), 'utf8');
const catalog = JSON.parse(catalogText);
const manifest = JSON.parse(readFileSync(resolve('assets/catalog/cefr-catalog-manifest.json'), 'utf8'));
const provenanceByTerm = new Map(manifest.entryProvenance.map((item) => [item.normalizedTerm, item]));
const rowsBySource = {
  'cefr-j': sourceRows(resolve('assets/catalog/sources/cefr-j-wordlist-1.6.csv')),
  octanove: sourceRows(resolve('assets/catalog/sources/octanove-vocabulary-profile-c1c2-1.0.csv')),
};
const database = new DatabaseSync(resolve('assets/catalog/wordnet.sqlite'), { readOnly: true });
const lookup = database.prepare(
  `SELECT id, part_of_speech, definition, example, rank
   FROM senses WHERE normalized_term = ? ORDER BY rank, id`,
);

const prepared = catalog.entries.map((entry) => {
  const desiredParts = desiredWordnetParts(entry);
  const allSenses = lookup.all(entry.normalizedTerm);
  const senses = allSenses
    .filter((sense) => desiredParts.has(sense.part_of_speech))
    .map((sense) => ({
      id: sense.id,
      partOfSpeech: sense.part_of_speech,
      definition: sense.definition,
      example: sense.example,
      rank: sense.rank,
    }));
  if (senses.length === 0) throw new Error(`${entry.id} has no compatible WordNet senses.`);
  const provenance = provenanceByTerm.get(entry.normalizedTerm);
  const accepted = acceptedPilot[entry.id];
  return {
    entryId: entry.id,
    term: entry.term,
    normalizedTerm: entry.normalizedTerm,
    level: entry.level,
    source: entry.source,
    sourceVersion: entry.sourceVersion,
    sourcePartOfSpeech: entry.sourcePartOfSpeech,
    sourceContexts: contextsFor(entry, provenance, rowsBySource),
    current: {
      catalogSenseId: entry.catalogSenseId,
      partOfSpeech: entry.partOfSpeech,
      definition: entry.definition,
      example: entry.example,
    },
    candidateSenses: senses,
    selectionSignals: {
      otherPartOfSpeechFamilies: new Set(allSenses
        .filter((sense) => !desiredParts.has(sense.part_of_speech))
        .map((sense) => sense.part_of_speech === 's' ? 'a' : sense.part_of_speech)).size,
      provenanceLevels: [...new Set((provenance?.records ?? []).map((record) => record.level))].sort(),
    },
    acceptedPilot: accepted ? {
      entryId: accepted.entryId,
      normalizedTerm: accepted.normalizedTerm,
      meaningReferenceSenseId: accepted.meaningReferenceSenseId,
      definition: accepted.definition,
      example: accepted.example,
      confidence: accepted.confidence,
      needsReview: accepted.needsReview,
      reviewNote: accepted.reviewNote,
    } : null,
  };
});
database.close();

const selected = options.mode === 'pilot' ? pilotSelection(prepared) : prepared;
const runDirectory = resolve(options.outputDirectory, options.mode);
mkdirSync(runDirectory, { recursive: true });
const promptPath = resolve(runDirectory, 'PROMPT.md');
writeFileSync(promptPath, `# CEFR learner-definition task

For every input entry, choose the single meaning most consistent with its CEFR level, source part of speech, source context, and candidate WordNet senses. Use only the supplied evidence; do not browse or introduce an unsupported meaning. Context rows marked \`primary\` belong to the selected source and level; other rows are conflict evidence and must not silently override the primary rows.

If an entry contains a non-null \`acceptedPilot\`, copy those eight output fields exactly; that result has already passed generation and cross-review.

Return a JSON array in the corresponding \`.output.json\` file. Each item must contain exactly:

- \`entryId\`
- \`normalizedTerm\`
- \`meaningReferenceSenseId\` (one supplied candidate sense ID)
- \`definition\` (one learner-friendly sentence, 3-24 words, capitalized, ending with punctuation, and no target-word circularity)
- \`example\` (one natural sentence containing the exact term, 4-24 words, capitalized and ending with punctuation)
- \`confidence\` (\`high\`, \`medium\`, or \`low\`)
- \`needsReview\` (boolean)
- \`reviewNote\` (empty unless review is needed)

Prefer the ordinary learner meaning implied by source context over WordNet rank. Use vocabulary no harder than necessary for the entry level. Ordinary polysemy alone is not a reason to request review: choose the most useful everyday learner meaning when the evidence supports one. Set \`needsReview\` only for a genuine source conflict, candidate coverage gap, or unresolved tie. Do not add translations, pronunciation, multiple meanings, markdown, or commentary.
`);

const chunks = [];
for (let offset = 0; offset < selected.length; offset += options.chunkSize) {
  const entries = selected.slice(offset, offset + options.chunkSize);
  const chunkNumber = chunks.length + 1;
  const baseName = `${options.mode}-${String(chunkNumber).padStart(3, '0')}`;
  const inputPath = resolve(runDirectory, `${baseName}.input.json`);
  const outputPath = resolve(runDirectory, `${baseName}.output.json`);
  writeFileSync(inputPath, `${JSON.stringify(entries, null, 2)}\n`);
  chunks.push({
    chunk: chunkNumber,
    inputPath,
    outputPath,
    entries: entries.length,
    entryIds: entries.map((entry) => entry.entryId),
  });
}

const preparationManifest = {
  schemaVersion: 1,
  mode: options.mode,
  catalogSha256: sha256(catalogText),
  catalogEntries: catalog.entries.length,
  selectedEntries: selected.length,
  chunkSize: options.chunkSize,
  promptPath,
  chunks,
};
const manifestPath = resolve(runDirectory, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(preparationManifest, null, 2)}\n`);
console.log(`Prepared ${selected.length.toLocaleString()} ${options.mode} entries in ${chunks.length} chunk(s).`);
console.log(`Manifest: ${manifestPath}`);
