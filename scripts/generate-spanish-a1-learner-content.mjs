import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256, writeFileAtomic } from './prepare-spanish-a1-learner-content.mjs';
import { validateBatch } from './validate-spanish-a1-learner-content.mjs';

const DESKTOP_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex';
const CODEX_BINARY = process.env.WORDFOLD_CODEX_BINARY || (existsSync(DESKTOP_CODEX) ? DESKTOP_CODEX : 'codex');

function parseArgs(argv) {
  const options = {
    manifestPath: resolve('.artifacts/spanish-a1-learner-content/full/manifest.json'),
    usagePath: resolve('.artifacts/spanish-a1-learner-content/full/usage.json'),
    fromBatch: 1,
    toBatch: Number.POSITIVE_INFINITY,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--manifest') options.manifestPath = resolve(argv[++index]);
    else if (argument === '--usage') options.usagePath = resolve(argv[++index]);
    else if (argument === '--from') options.fromBatch = Number(argv[++index]);
    else if (argument === '--to') options.toBatch = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.fromBatch) || options.fromBatch < 1) throw new Error('--from must be a positive integer.');
  if (options.toBatch !== Number.POSITIVE_INFINITY && (!Number.isInteger(options.toBatch) || options.toBatch < options.fromBatch)) {
    throw new Error('--to must be an integer greater than or equal to --from.');
  }
  return options;
}

function checkpointIsValid(manifest, batch) {
  if (!existsSync(batch.checkpointPath) || !existsSync(batch.outputPath)) return false;
  try {
    const checkpoint = JSON.parse(readFileSync(batch.checkpointPath, 'utf8'));
    return checkpoint.status === 'valid'
      && checkpoint.runIdentitySha256 === manifest.runIdentitySha256
      && checkpoint.inputSha256 === batch.inputSha256
      && checkpoint.outputSha256 === sha256(readFileSync(batch.outputPath));
  } catch {
    return false;
  }
}

function usageFromEvents(stdout, batchNumber) {
  const events = stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const completed = [...events].reverse().find((event) => event.type === 'turn.completed');
  if (!completed?.usage) throw new Error(`Batch ${batchNumber}: Codex did not report token usage.`);
  const inputTokens = completed.usage.input_tokens;
  const cachedInputTokens = completed.usage.cached_input_tokens ?? 0;
  const outputTokens = completed.usage.output_tokens;
  if (![inputTokens, cachedInputTokens, outputTokens].every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error(`Batch ${batchNumber}: invalid Codex token usage.`);
  }
  return {
    batchNumber,
    source: 'Codex turn.completed provider usage',
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

function writeUsage(path, batches) {
  const ordered = [...batches].sort((left, right) => left.batchNumber - right.batchNumber);
  const totals = ordered.reduce((sum, batch) => ({
    inputTokens: sum.inputTokens + batch.inputTokens,
    cachedInputTokens: sum.cachedInputTokens + (batch.cachedInputTokens ?? 0),
    outputTokens: sum.outputTokens + batch.outputTokens,
    totalTokens: sum.totalTokens + batch.totalTokens,
  }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, totalTokens: 0 });
  writeFileAtomic(path, `${JSON.stringify({ schemaVersion: 1, batches: ordered, totals }, null, 2)}\n`);
}

function addUsage(previous, current) {
  const attempts = [...(previous?.attempts ?? (previous ? [{ ...previous, attempts: undefined }] : [])), current];
  return {
    batchNumber: current.batchNumber,
    source: attempts.length === 1 ? current.source : `Aggregate of ${attempts.length} Codex attempts`,
    inputTokens: attempts.reduce((sum, attempt) => sum + attempt.inputTokens, 0),
    cachedInputTokens: attempts.reduce((sum, attempt) => sum + (attempt.cachedInputTokens ?? 0), 0),
    outputTokens: attempts.reduce((sum, attempt) => sum + attempt.outputTokens, 0),
    totalTokens: attempts.reduce((sum, attempt) => sum + attempt.totalTokens, 0),
    attempts,
  };
}

function checkpointBatch(manifest, batch, usage) {
  const inputText = readFileSync(batch.inputPath);
  const outputText = readFileSync(batch.outputPath);
  const validation = validateBatch(JSON.parse(inputText), JSON.parse(outputText));
  writeFileAtomic(batch.checkpointPath, `${JSON.stringify({
    schemaVersion: 1,
    status: 'valid',
    runIdentitySha256: manifest.runIdentitySha256,
    batchNumber: batch.batchNumber,
    boundaries: { startIndex: batch.startIndex, endIndexExclusive: batch.endIndexExclusive },
    entryIds: batch.entryIds,
    inputSha256: batch.inputSha256,
    outputSha256: sha256(outputText),
    promptSha256: manifest.prompt.sha256,
    schemaSha256: manifest.outputSchema.sha256,
    model: batch.reusedFrom ? manifest.acceptedPilot.model : manifest.model,
    usage,
    validation,
  }, null, 2)}\n`);
}

export function generateRun(options) {
  const manifest = JSON.parse(readFileSync(options.manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.notHumanReview !== true || !['pilot', 'full'].includes(manifest.mode)) {
    throw new Error('Expected a Spanish learner-content pilot or full manifest marked notHumanReview.');
  }
  const prompt = readFileSync(manifest.prompt.path, 'utf8');
  const usageByBatch = new Map();
  if (existsSync(options.usagePath)) {
    const previous = JSON.parse(readFileSync(options.usagePath, 'utf8'));
    for (const batch of previous.batches ?? []) usageByBatch.set(batch.batchNumber, batch);
  }
  if (manifest.acceptedPilot) {
    const pilotUsagePath = resolve(manifest.acceptedPilot.directory, 'usage.json');
    const pilotUsage = JSON.parse(readFileSync(pilotUsagePath, 'utf8'));
    for (const batch of pilotUsage.batches) {
      if (!manifest.acceptedPilot.batchNumbers.includes(batch.batchNumber) || usageByBatch.has(batch.batchNumber)) continue;
      usageByBatch.set(batch.batchNumber, {
        ...batch,
        source: `Accepted pilot: ${batch.source}`,
        cachedInputTokens: batch.cachedInputTokens ?? 0,
      });
    }
    writeUsage(options.usagePath, usageByBatch.values());
  }
  const candidates = manifest.batches.filter((batch) => batch.batchNumber >= options.fromBatch && batch.batchNumber <= options.toBatch);
  for (const batch of candidates) {
    let retryReason = null;
    if (checkpointIsValid(manifest, batch)) {
      if (!usageByBatch.has(batch.batchNumber)) {
        const checkpoint = JSON.parse(readFileSync(batch.checkpointPath, 'utf8'));
        if (!checkpoint.usage) throw new Error(`Batch ${batch.batchNumber}: valid checkpoint has no usage record.`);
        usageByBatch.set(batch.batchNumber, checkpoint.usage);
        writeUsage(options.usagePath, usageByBatch.values());
      }
      console.log(`Batch ${batch.batchNumber}: valid checkpoint, skipped.`);
      continue;
    }
    if (existsSync(batch.outputPath) && usageByBatch.has(batch.batchNumber)) {
      try {
        checkpointBatch(manifest, batch, usageByBatch.get(batch.batchNumber));
        console.log(`Batch ${batch.batchNumber}: existing output validated and checkpointed.`);
        continue;
      } catch (error) {
        // Regenerate an existing output only when it fails current validation.
        retryReason = error.message;
      }
    }
    if (batch.reusedFrom) {
      const usage = usageByBatch.get(batch.batchNumber);
      if (!usage) throw new Error(`Batch ${batch.batchNumber}: accepted pilot usage is missing.`);
      checkpointBatch(manifest, batch, usage);
      console.log(`Batch ${batch.batchNumber}: accepted pilot output validated and checkpointed.`);
      continue;
    }
    const inputText = readFileSync(batch.inputPath, 'utf8');
    if (sha256(inputText) !== batch.inputSha256) throw new Error(`Batch ${batch.batchNumber}: input hash mismatch.`);
    const temporaryOutput = `${batch.outputPath}.tmp-${process.pid}-${randomUUID()}`;
    const retryInstruction = retryReason
      ? `\nA previous attempt failed validation: ${retryReason}\nGenerate a fresh complete batch and explicitly correct that failure.\n`
      : '';
    const task = `${prompt}\nReturn one JSON object whose only property is entries, containing the requested JSON array. Process this complete batch in its supplied order.${retryInstruction}\nBATCH INPUT:\n${inputText}`;
    console.log(`Batch ${batch.batchNumber}: generating ${batch.entryCount} entries...`);
    const execution = spawnSync(CODEX_BINARY, [
      'exec', '-', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
      '--sandbox', 'read-only', '--model', manifest.model.id, '--json',
      '--output-schema', manifest.codexOutputSchema.path, '--output-last-message', temporaryOutput,
      '-C', '/private/tmp',
    ], {
      input: task,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    try {
      if (execution.status !== 0) {
        throw new Error(`Batch ${batch.batchNumber}: Codex failed (${execution.status}).\n${execution.stderr}\n${execution.stdout}`);
      }
      const providerOutput = JSON.parse(readFileSync(temporaryOutput, 'utf8'));
      const outputText = `${JSON.stringify(providerOutput.entries, null, 2)}\n`;
      const attemptUsage = usageFromEvents(execution.stdout, batch.batchNumber);
      usageByBatch.set(batch.batchNumber, addUsage(usageByBatch.get(batch.batchNumber), attemptUsage));
      writeUsage(options.usagePath, usageByBatch.values());
      try {
        validateBatch(JSON.parse(inputText), providerOutput.entries);
      } catch (error) {
        writeFileAtomic(batch.outputPath, outputText);
        writeFileAtomic(batch.checkpointPath, `${JSON.stringify({
          schemaVersion: 1,
          status: 'invalid',
          runIdentitySha256: manifest.runIdentitySha256,
          batchNumber: batch.batchNumber,
          inputSha256: batch.inputSha256,
          outputSha256: sha256(outputText),
          error: error.message,
          usage: usageByBatch.get(batch.batchNumber),
        }, null, 2)}\n`);
        throw error;
      }
      writeFileAtomic(batch.outputPath, outputText);
      checkpointBatch(manifest, batch, usageByBatch.get(batch.batchNumber));
      console.log(`Batch ${batch.batchNumber}: generated and structurally valid.`);
    } finally {
      if (existsSync(temporaryOutput)) unlinkSync(temporaryOutput);
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    generateRun(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
