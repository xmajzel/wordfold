import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const Z_95 = 1.959963984540054;

function parseArgs(argv) {
  const options = {
    sampleManifestPath: resolve('.artifacts/spanish-a1-human-review/sample-manifest.json'),
    spanishPacketPath: resolve('.artifacts/spanish-a1-human-review/spanish-review-packet.json'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--sample-manifest') options.sampleManifestPath = resolve(argv[++index]);
    else if (argument === '--spanish-packet') options.spanishPacketPath = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export function wilson95(errors, total) {
  if (!Number.isInteger(errors) || !Number.isInteger(total) || errors < 0 || total < 1 || errors > total) {
    throw new Error('Wilson inputs must be integer counts with 0 <= errors <= total.');
  }
  const proportion = errors / total;
  const zSquared = Z_95 ** 2;
  const denominator = 1 + zSquared / total;
  const centre = (proportion + zSquared / (2 * total)) / denominator;
  const margin = (Z_95 * Math.sqrt((proportion * (1 - proportion) + zSquared / (4 * total)) / total)) / denominator;
  return {
    errors,
    total,
    rate: proportion,
    wilson95: { lower: Math.max(0, centre - margin), upper: Math.min(1, centre + margin) },
  };
}

function completedJudgment(entry) {
  const judgment = entry.judgment;
  return ['correct', 'wrong'].includes(judgment?.senseVerdict)
    && ['correct', 'material-error'].includes(judgment?.definitionVerdict)
    && ['correct', 'material-error'].includes(judgment?.exampleVerdict)
    && ['appropriate', 'wrong'].includes(judgment?.levelVerdict);
}

function metrics(entries) {
  return {
    wrongSense: wilson95(entries.filter((entry) => entry.judgment.senseVerdict === 'wrong').length, entries.length),
    wrongLevel: wilson95(entries.filter((entry) => entry.judgment.levelVerdict === 'wrong').length, entries.length),
    criticalErrorUnion: wilson95(entries.filter((entry) => (
      entry.judgment.senseVerdict === 'wrong'
      || entry.judgment.levelVerdict === 'wrong'
      || entry.judgment.definitionVerdict === 'material-error'
      || entry.judgment.exampleVerdict === 'material-error'
    )).length, entries.length),
  };
}

export function analyzeHumanReview(sampleManifest, spanishPacket) {
  if (sampleManifest.sampleSize !== 200 || spanishPacket.entries?.length !== 200) {
    throw new Error('Expected the frozen 200-entry human-review sample.');
  }
  if (spanishPacket.sampleContentSha256 !== sampleManifest.contentSha256
    || spanishPacket.sampleSeedSha256 !== sampleManifest.seedSha256) {
    throw new Error('Spanish packet does not match the frozen sample identity.');
  }
  const sampleById = new Map(sampleManifest.entries.map((entry) => [entry.entryId, entry]));
  if (sampleById.size !== 200 || spanishPacket.entries.some((entry) => !sampleById.has(entry.entryId))) {
    throw new Error('Spanish packet entry IDs do not match the sample manifest.');
  }
  const pendingEntryIds = spanishPacket.entries.filter((entry) => !completedJudgment(entry)).map((entry) => entry.entryId);
  if (pendingEntryIds.length > 0) {
    return {
      schemaVersion: 1,
      status: 'awaiting-human-review',
      reviewedEntries: 200 - pendingEntryIds.length,
      pendingEntries: pendingEntryIds.length,
      pendingEntryIds,
      rates: null,
    };
  }
  if (spanishPacket.reviewer?.humanAttestation !== true
    || typeof spanishPacket.reviewer?.name !== 'string'
    || spanishPacket.reviewer.name.trim().length === 0
    || typeof spanishPacket.reviewer?.completedAt !== 'string'
    || Number.isNaN(Date.parse(spanishPacket.reviewer.completedAt))) {
    throw new Error('Completed judgments require the actual reviewer name, humanAttestation=true, and completedAt.');
  }
  const enriched = spanishPacket.entries.map((entry) => ({ ...entry, ...sampleById.get(entry.entryId) }));
  const spanishGloss = enriched.filter((entry) => entry.evidenceStratum === 'spanish-gloss');
  const bridgeOnly = enriched.filter((entry) => entry.evidenceStratum === 'english-bridge-only');
  const overall = metrics(enriched);
  const byStratum = {
    'spanish-gloss': metrics(spanishGloss),
    'english-bridge-only': metrics(bridgeOnly),
  };
  const bridgeComparison = Object.fromEntries(['wrongSense', 'wrongLevel', 'criticalErrorUnion'].map((metric) => {
    const gloss = byStratum['spanish-gloss'][metric];
    const bridge = byStratum['english-bridge-only'][metric];
    const difference = bridge.rate - gloss.rate;
    return [metric, {
      difference,
      bridgeOnlyHigherByAtLeastFivePercentagePoints: difference >= 0.05,
      wilsonIntervalsDisjointInHigherDirection: bridge.wilson95.lower > gloss.wilson95.upper,
    }];
  }));
  return {
    schemaVersion: 1,
    status: 'complete',
    reviewer: spanishPacket.reviewer,
    reviewedEntries: 200,
    pendingEntries: 0,
    rates: { overall, byStratum, bridgeComparison },
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = analyzeHumanReview(
      JSON.parse(readFileSync(options.sampleManifestPath, 'utf8')),
      JSON.parse(readFileSync(options.spanishPacketPath, 'utf8')),
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
