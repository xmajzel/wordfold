import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pilotEntryIds = [
  'a1:00223465-r:behind', 'a1:00252773-r:am', 'a1:02857998-n:pants', 'a1:03324991-n:fan',
  'a1:03370837-n:storey', 'a1:03733928-n:match', 'a1:03781824-n:mobile', 'a1:04414570-n:temple',
  'a1:09951098-n:coach', 'a1:12648511-n:may', 'a2:00116161-r:physically', 'a2:00848000-s:plastic',
  'a2:01022875-s:handicapped', 'a2:01897764-v:click', 'a2:02483951-s:organised', 'a2:04260861-n:max',
  'a2:05101152-n:degree', 'a2:05815314-n:brainstorm', 'a2:06339636-n:gender', 'a2:09937051-n:fry',
  'a2:10121403-n:footballer', 'a2:15319328-n:float', 'b1:00193263-r:continuously', 'b1:00310732-n:safari',
  'b1:00994417-n:dating', 'b1:01277865-v:riddle', 'b1:01884326-s:rolling', 'b1:08243899-n:crossroads',
  'b1:10786688-n:ward', 'b1:13338024-n:customs', 'b1:13347642-n:exchange rate', 'b1:14298742-n:gall',
  'b2:00801674-s:soaked', 'b2:01575715-n:lark', 'b2:03082307-a:growing', 'b2:04820120-n:dash',
  'b2:05039506-n:guts', 'b2:08254784-n:cast', 'b2:10484694-n:prefect', 'b2:12369152-n:ling',
  'b2:14470485-n:unease', 'b2:14980800-n:gook', 'b2:82230893-n:corona', 'c1:00682829-s:battered',
  'c1:02168962-v:gape', 'c1:04631874-n:physicality', 'c1:05832256-n:grounds', 'c1:09863364-n:batter',
  'c1:10174170-n:hack', 'c1:14037117-n:recess', 'c2:00032610-s:acrobatic', 'c2:02262825-a:seedy',
  'c2:03921038-n:perch', 'c2:05017985-n:echo', 'c2:05043392-n:athleticism', 'c2:07447159-n:dribble',
  'a2:02804097-a:scientific', 'a2:01452455-a:lost', 'a2:02785116-n:balloon', 'b1:02002147-s:devastating',
  'b1:01462677-s:adorable', 'b1:00191603-a:aware', 'b1:09772396-n:balance', 'b1:05683749-n:awareness',
  'b1:08563758-n:county', 'b1:14479414-n:vacancy', 'b2:01361079-s:exhausting', 'b2:06325134-n:clause',
  'b2:00558456-n:completion', 'b2:00103013-r:delicately', 'b2:04773530-n:complexity', 'b2:01836317-s:potent',
  'b2:08703415-n:mansion', 'b2:00566339-n:stroke', 'c1:02341306-s:victorious', 'c1:02904232-a:juvenile',
  'c1:03949542-n:pinnacle', 'c2:05996720-n:edification', 'c2:06763518-n:proposition', 'c2:07231421-n:stipulation',
  'a1:09236472-n:bank', 'a1:15144478-n:present', 'a1:00190414-n:run', 'a1:02039393-a:right',
  'a1:10041617-n:dr.', 'a1:06289979-n:e-mail', 'a1:06604096-n:album', 'a1:13403644-n:kite',
  'a1:13386310-n:cd', 'a2:08154738-n:state', 'a2:13375435-n:capital', 'a2:01655325-a:online',
  'a2:07337369-n:make-up', 'b1:09722069-n:angle', 'b1:06954856-n:pie', 'c1:00573255-s:self-conscious',
  'c1:02800154-n:saloon', 'c2:02347576-v:eke out', 'c2:02357542-s:incumbent', 'c2:13376883-n:corpus',
];

function parseArgs(argv) {
  const options = {
    mode: 'pilot',
    chunkSize: 200,
    outputDirectory: resolve('.artifacts/cefr-learner-translations-sk'),
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validIdentity(record, entry) {
  return record?.entryId === entry.id && record?.normalizedTerm === entry.normalizedTerm;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validAdjudication(record, entry) {
  return validIdentity(record, entry)
    && ['wordnet', 'curated'].includes(record.meaningSource)
    && nonEmptyString(record.definition)
    && nonEmptyString(record.example)
    && nonEmptyString(record.partOfSpeech)
    && ['high', 'medium'].includes(record.confidence)
    && (record.meaningSource === 'curated'
      ? record.meaningReferenceSenseId === null
      : nonEmptyString(record.meaningReferenceSenseId));
}

function validLearnerDefinition(record, entry) {
  return validIdentity(record, entry)
    && !record.needsReview
    && record.confidence !== 'low'
    && nonEmptyString(record.definition)
    && nonEmptyString(record.example)
    && nonEmptyString(record.partOfSpeech)
    && nonEmptyString(record.meaningReferenceSenseId);
}

function effectiveEnglish(entry, learnerDefinitions, adjudications) {
  const adjudication = adjudications[entry.id];
  if (validAdjudication(adjudication, entry)) {
    return {
      definition: adjudication.definition,
      example: adjudication.example,
      partOfSpeech: adjudication.partOfSpeech,
      meaningReferenceSenseId: adjudication.meaningReferenceSenseId,
      meaningSource: adjudication.meaningSource,
      confidence: adjudication.confidence,
    };
  }

  const learner = learnerDefinitions[entry.id];
  if (validLearnerDefinition(learner, entry)) {
    return {
      definition: learner.definition,
      example: learner.example,
      partOfSpeech: learner.partOfSpeech,
      meaningReferenceSenseId: learner.meaningReferenceSenseId,
      meaningSource: 'wordnet',
      confidence: learner.confidence,
    };
  }

  throw new Error(`${entry.id} has no final reviewed English meaning.`);
}

function pilotSelection(entries) {
  const entriesById = new Map(entries.map((entry) => [entry.entryId, entry]));
  const selected = pilotEntryIds.map((entryId) => entriesById.get(entryId));
  if (new Set(pilotEntryIds).size !== 100 || selected.some((entry) => !entry)) {
    throw new Error('The fixed 100-entry translation pilot does not match the catalog.');
  }
  return selected;
}

const options = parseArgs(process.argv.slice(2));
const catalogText = readFileSync(resolve('assets/catalog/cefr-catalog.json'), 'utf8');
const catalog = JSON.parse(catalogText);
const learnerDefinitions = JSON.parse(readFileSync(resolve('assets/catalog/cefr-learner-definitions.json'), 'utf8')).entries;
const adjudicationsPath = resolve('assets/catalog/cefr-learner-definition-adjudications.json');
const adjudications = existsSync(adjudicationsPath)
  ? JSON.parse(readFileSync(adjudicationsPath, 'utf8')).entries
  : {};
const acceptedPilotPath = resolve(options.outputDirectory, 'pilot', 'compiled.json');
const acceptedPilot = options.mode === 'all' && existsSync(acceptedPilotPath)
  ? JSON.parse(readFileSync(acceptedPilotPath, 'utf8')).entries
  : {};

const prepared = catalog.entries.map((entry) => {
  const english = effectiveEnglish(entry, learnerDefinitions, adjudications);
  const accepted = acceptedPilot[entry.id];
  return {
    entryId: entry.id,
    term: entry.term,
    normalizedTerm: entry.normalizedTerm,
    level: entry.level,
    finalEnglish: english,
    currentTranslation: entry.translation,
    translationReviewRequired: english.meaningSource === 'curated'
      || english.meaningReferenceSenseId !== entry.catalogSenseId,
    acceptedPilot: accepted ? {
      entryId: accepted.entryId,
      normalizedTerm: accepted.normalizedTerm,
      translation: accepted.translation,
      confidence: accepted.confidence,
      needsReview: accepted.needsReview,
      reviewNote: accepted.reviewNote,
    } : null,
  };
});

const selected = options.mode === 'pilot' ? pilotSelection(prepared) : prepared;
const runDirectory = resolve(options.outputDirectory, options.mode);
mkdirSync(runDirectory, { recursive: true });
const promptPath = resolve(runDirectory, 'PROMPT.md');
writeFileSync(promptPath, `# CEFR Slovak learner-translation task

For every input entry, write one concise, natural Slovak learning hint aligned to the supplied final English definition, example, and part of speech. Treat the current translation only as comparison evidence; replace it whenever it expresses a different meaning or is unnatural.

If an entry contains a non-null \`acceptedPilot\`, copy those six output fields exactly; that result has already passed generation and review.

Return a JSON array in the corresponding \`.output.json\` file. Each item must contain exactly:

- \`entryId\`
- \`normalizedTerm\`
- \`translation\` (a concise Slovak equivalent, normally 1-5 words; only when no direct equivalent exists, a short explanation of at most 12 words)
- \`confidence\` (\`high\`, \`medium\`, or \`low\`)
- \`needsReview\` (boolean)
- \`reviewNote\` (empty unless review is needed)

Translate the exact final meaning rather than the headword in isolation. Use contemporary standard Slovak as spoken in Slovakia. Use the noun nominative form, verb infinitive (including necessary \`sa\` or \`si\`), masculine singular adjective form, and natural adverb form. Translate expressions and idioms as a whole. Preserve inherent plural and mass forms when appropriate. A natural borrowing is valid when it is the ordinary Slovak word. Preserve a sensitive or outdated register with a short marker only when essential.

Prefer the most ordinary learner-friendly equivalent, not a literal translation of the English definition. Independently decide before comparing with the current translation. Set \`needsReview\` only for a genuine unresolved ambiguity or terminology problem. Low confidence must always need review. Do not browse, add alternatives, translate the example, add English explanations or part-of-speech labels, or include markdown or commentary.
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
  englishMeaningsSha256: sha256(JSON.stringify(selected.map((entry) => ({
    entryId: entry.entryId,
    normalizedTerm: entry.normalizedTerm,
    finalEnglish: entry.finalEnglish,
  })))),
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
