import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBatch } from './validate-spanish-a1-learner-content.mjs';

const SAMPLE_SIZE = 200;
const EXPECTED_ENTRY_COUNTS = Object.freeze({ A1: 1707, A2: 1847 });

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, canonicalJson(value));
  renameSync(temporaryPath, path);
}

function parseArgs(argv) {
  const options = {
    level: 'A1',
    manifestPath: null,
    outputDirectory: null,
    aiOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--level') options.level = argv[++index].toUpperCase();
    else if (argument === '--manifest') options.manifestPath = resolve(argv[++index]);
    else if (argument === '--output-dir') options.outputDirectory = resolve(argv[++index]);
    else if (argument === '--ai-only') options.aiOnly = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!EXPECTED_ENTRY_COUNTS[options.level]) throw new Error('--level must be A1 or A2.');
  const slug = options.level.toLowerCase();
  options.manifestPath ??= resolve(`.artifacts/spanish-${slug}-learner-content/full/manifest.json`);
  options.outputDirectory ??= resolve(`.artifacts/spanish-${slug}-human-review`);
  return options;
}

function proportionalAllocation(populations, sampleSize) {
  const total = Object.values(populations).reduce((sum, count) => sum + count, 0);
  const allocation = Object.fromEntries(Object.entries(populations).map(([stratum, count]) => [
    stratum,
    Math.floor((sampleSize * count) / total),
  ]));
  let remaining = sampleSize - Object.values(allocation).reduce((sum, count) => sum + count, 0);
  const byRemainder = Object.entries(populations).sort((left, right) => {
    const leftRemainder = (sampleSize * left[1]) / total - allocation[left[0]];
    const rightRemainder = (sampleSize * right[1]) / total - allocation[right[0]];
    return rightRemainder - leftRemainder || left[0].localeCompare(right[0]);
  });
  for (const [stratum] of byRemainder) {
    if (remaining === 0) break;
    allocation[stratum] += 1;
    remaining -= 1;
  }
  return allocation;
}

function ranked(entries, seed, purpose) {
  return [...entries].sort((left, right) => {
    const leftRank = sha256(`${seed}\u0000${purpose}\u0000${left.entryId}`);
    const rightRank = sha256(`${seed}\u0000${purpose}\u0000${right.entryId}`);
    return leftRank.localeCompare(rightRank) || left.entryId.localeCompare(right.entryId);
  });
}

function loadFinishedContent(manifestPath, level) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const expectedCount = EXPECTED_ENTRY_COUNTS[level];
  if (manifest.mode !== 'full' || manifest.level !== level || manifest.entryCount !== expectedCount) {
    throw new Error(`Review sampling must use the immutable finished ${expectedCount}-entry ${level} run.`);
  }
  const entries = [];
  for (const batch of manifest.batches) {
    const inputText = readFileSync(batch.inputPath);
    const outputText = readFileSync(batch.outputPath);
    if (sha256(inputText) !== batch.inputSha256) throw new Error(`Batch ${batch.batchNumber} input hash mismatch.`);
    const input = JSON.parse(inputText);
    const output = JSON.parse(outputText);
    validateBatch(input, output);
    for (let index = 0; index < input.length; index += 1) {
      const generated = output[index];
      const selectedSense = input[index].candidateSenses.find(
        (sense) => sense.senseId === generated.meaningReferenceSenseId,
      );
      if (!selectedSense) throw new Error(`${generated.entryId}: selected sense is not present in its input.`);
      const hasSpanishGloss = typeof selectedSense.spanishDefinition === 'string'
        && selectedSense.spanishDefinition.trim().length > 0;
      entries.push({
        ...generated,
        evidenceStratum: hasSpanishGloss ? 'spanish-gloss' : 'english-bridge-only',
        selectedSenseEvidence: selectedSense,
      });
    }
  }
  if (entries.length !== manifest.entryCount || new Set(entries.map((entry) => entry.entryId)).size !== entries.length) {
    throw new Error('Finished A1 content is incomplete or contains duplicate IDs.');
  }
  return { manifest, entries };
}

export function prepareHumanReview(manifestPath, outputDirectory, { level = 'A1', aiOnly = false } = {}) {
  const { manifest, entries } = loadFinishedContent(manifestPath, level);
  const contentForHash = entries.map(({ selectedSenseEvidence: _evidence, evidenceStratum: _stratum, ...entry }) => entry);
  const contentSha256 = sha256(canonicalJson(contentForHash));
  const seedLabel = level === 'A1' && !aiOnly
    ? 'wordfold-spanish-a1-human-review-v1'
    : `wordfold-spanish-${level.toLowerCase()}-review-sample-v1`;
  const seedSha256 = sha256(`${seedLabel}\u0000${contentSha256}`);
  const populations = Object.fromEntries(['spanish-gloss', 'english-bridge-only'].map((stratum) => [
    stratum,
    entries.filter((entry) => entry.evidenceStratum === stratum).length,
  ]));
  const allocation = proportionalAllocation(populations, SAMPLE_SIZE);
  const selected = Object.keys(populations).flatMap((stratum) => (
    ranked(entries.filter((entry) => entry.evidenceStratum === stratum), seedSha256, `sample:${stratum}`)
      .slice(0, allocation[stratum])
  ));
  const spanishOrder = ranked(selected, seedSha256, 'packet:spanish');
  const slovakOrder = ranked(selected, seedSha256, 'packet:slovak');

  const sampleManifest = {
    schemaVersion: 1,
    ...(aiOnly ? { notHumanReview: true } : {}),
    courseId: 'es-sk',
    level,
    samplePurpose: aiOnly
      ? `Blinded independent AI cross-review of the immutable finished ${level} learner-content run.`
      : `Independent human quality gate for the immutable finished ${level} learner-content run.`,
    sourceRunIdentitySha256: manifest.runIdentitySha256,
    contentSha256,
    seedDerivation: `SHA-256("${seedLabel}" + U+0000 + contentSha256)`,
    seedSha256,
    selectionAlgorithm: 'Within each evidence stratum, sort by SHA-256(seed + U+0000 + purpose + U+0000 + entryId), then take the proportional allocation. Packet orders use separately labelled hashes.',
    sampleSize: SAMPLE_SIZE,
    population: { total: entries.length, strata: populations },
    allocation,
    entries: selected.map((entry) => ({
      entryId: entry.entryId,
      evidenceStratum: entry.evidenceStratum,
      generationConfidence: entry.confidence,
      generationNeedsReview: entry.needsReview,
      selectedSenseId: entry.meaningReferenceSenseId,
      selectedSenseSpanishDefinition: entry.selectedSenseEvidence.spanishDefinition,
      selectedSenseEnglishDefinition: entry.selectedSenseEvidence.englishDefinition,
      selectedSenseEnglishMembers: entry.selectedSenseEvidence.englishMembers,
    })),
  };

  const spanishPacket = {
    schemaVersion: 1,
    ...(aiOnly ? { notHumanReview: true } : {}),
    packetId: `spanish-${level.toLowerCase()}-${aiOnly ? 'ai-cross' : 'human-sense'}-review-${contentSha256.slice(0, 12)}`,
    status: aiOnly ? 'awaiting-ai-cross-review' : 'awaiting-human-review',
    reviewerRole: aiOnly ? 'independent-ai-cross-reviewer' : 'independent-native-spanish-speaker',
    reviewer: aiOnly ? { model: 'gpt-6-astra', completedAt: null } : { name: null, humanAttestation: null, completedAt: null },
    blinding: 'Evidence stratum, model confidence, model review flags, and source glosses are omitted.',
    instructions: {
      senseVerdict: 'Mark wrong when the definition/example teaches a meaning that the supplied Spanish headword and POS do not express in contemporary Spanish.',
      definitionVerdict: 'Mark material-error when the learner definition is false, misleading, circular, or materially unnatural.',
      exampleVerdict: 'Mark material-error when the example is false, meaning-mismatched, or materially unnatural.',
      levelVerdict: `Mark wrong when this selected sense and usage are unsuitable as ${level} learner content, even if another sense of the word is ${level}.`,
      criticalErrorUnion: 'Derived as wrong sense OR wrong level OR a material definition error OR a material example error.',
      independence: 'Review the packet without consulting the model flags or another reviewer. Use uncertain only when the item cannot be decided; uncertain items must be resolved before rates are computed.',
    },
    sampleContentSha256: contentSha256,
    sampleSeedSha256: seedSha256,
    entries: spanishOrder.map((entry, index) => ({
      reviewItemId: `ES-${level}-${String(index + 1).padStart(3, '0')}`,
      entryId: entry.entryId,
      term: entry.term,
      partOfSpeech: entry.partOfSpeech,
      level: entry.level,
      definition: entry.definition,
      example: entry.example,
      judgment: {
        senseVerdict: null,
        definitionVerdict: null,
        exampleVerdict: null,
        levelVerdict: null,
        notes: '',
      },
    })),
  };

  const slovakPacket = aiOnly ? null : {
    schemaVersion: 1,
    packetId: `spanish-a1-human-slovak-review-${contentSha256.slice(0, 12)}`,
    status: 'awaiting-section-4-translations',
    reviewerRole: 'independent-native-slovak-speaker',
    reviewer: { name: null, humanAttestation: null, completedAt: null },
    blinding: 'Uses the same frozen sample in an independently shuffled order; source evidence and Spanish-review judgments remain hidden.',
    sampleContentSha256: contentSha256,
    sampleSeedSha256: seedSha256,
    entries: slovakOrder.map((entry, index) => ({
      reviewItemId: `SK-A1-${String(index + 1).padStart(3, '0')}`,
      entryId: entry.entryId,
      term: entry.term,
      partOfSpeech: entry.partOfSpeech,
      level: entry.level,
      definition: entry.definition,
      example: entry.example,
      slovakTranslation: null,
      judgment: {
        translationVerdict: null,
        notes: '',
      },
    })),
  };

  const sampleManifestPath = resolve(outputDirectory, 'sample-manifest.json');
  const spanishPacketPath = resolve(outputDirectory, aiOnly ? 'ai-cross-review-packet.json' : 'spanish-review-packet.json');
  const slovakPacketPath = resolve(outputDirectory, 'slovak-review-packet.json');
  writeJsonAtomic(sampleManifestPath, sampleManifest);
  writeJsonAtomic(spanishPacketPath, spanishPacket);
  if (slovakPacket) writeJsonAtomic(slovakPacketPath, slovakPacket);
  return { sampleManifestPath, spanishPacketPath, slovakPacketPath, contentSha256, seedSha256, populations, allocation };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = prepareHumanReview(options.manifestPath, options.outputDirectory, options);
    console.log(`${options.level} content SHA-256: ${result.contentSha256}`);
    console.log(`Sample seed SHA-256: ${result.seedSha256}`);
    console.log(`Population strata: ${JSON.stringify(result.populations)}`);
    console.log(`Sample allocation: ${JSON.stringify(result.allocation)}`);
    console.log(`Sample manifest: ${result.sampleManifestPath}`);
    console.log(`Spanish packet: ${result.spanishPacketPath}`);
    if (!options.aiOnly) console.log(`Slovak packet: ${result.slovakPacketPath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
