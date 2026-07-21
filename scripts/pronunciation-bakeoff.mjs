#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, relative } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_CORPUS = resolve(ROOT, 'assets/pronunciation/bakeoff-corpus.json');
const DEFAULT_CANDIDATES = resolve(ROOT, 'assets/pronunciation/bakeoff-candidates.json');
const ARTIFACT_ROOT = resolve(ROOT, '.artifacts');
const SUPPORTED_LOCALES = ['en-US', 'en-GB', 'es-ES', 'es-MX', 'de-DE', 'el-GR', 'sk-SK'];
const SUPPORTED_CATEGORIES = [
  'common_word',
  'inflection',
  'phrase',
  'sense_sensitive',
  'proper_name_or_loanword',
  'abbreviation',
];
const PROVIDER_IDS = ['google', 'azure'];
const REVIEW_STATUSES = ['needs_native_review', 'approved', 'provisional_non_native'];
const GENERATION_READY_REVIEW_STATUSES = ['approved', 'provisional_non_native'];
const MINIMUM_AUDIO_BYTES = 100;
let googleClient;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArguments(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--') continue;
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (['execute', 'json'].includes(name)) options[name] = true;
    else {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value.`);
      options[name] = value;
      index += 1;
    }
  }
  return { command, options };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read JSON at ${path}: ${safeErrorMessage(error)}`);
  }
}

async function loadInputs(options = {}) {
  const corpusPath = resolve(options.corpus ?? DEFAULT_CORPUS);
  const candidatesPath = resolve(options.candidates ?? DEFAULT_CANDIDATES);
  const [corpusText, candidatesText] = await Promise.all([
    readFile(corpusPath, 'utf8'),
    readFile(candidatesPath, 'utf8'),
  ]);
  let corpus;
  let candidates;
  try {
    corpus = JSON.parse(corpusText);
    candidates = JSON.parse(candidatesText);
  } catch (error) {
    throw new Error(`Could not parse bakeoff inputs: ${safeErrorMessage(error)}`);
  }
  return {
    corpus,
    candidates,
    corpusPath,
    candidatesPath,
    corpusSha256: sha256(corpusText),
    candidatesSha256: sha256(candidatesText),
  };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateInputs(corpus, candidates) {
  const errors = [];
  if (corpus?.schemaVersion !== 1) errors.push('Corpus schemaVersion must be 1.');
  if (candidates?.schemaVersion !== 1) errors.push('Candidate schemaVersion must be 1.');
  if (candidates?.generatedAudioFormat !== 'mp3') errors.push('Generated audio format must be mp3.');
  if (!Number.isFinite(candidates?.hardCostCeilingUsd) || candidates.hardCostCeilingUsd <= 0) {
    errors.push('hardCostCeilingUsd must be a positive finite number.');
  }

  const quotas = corpus?.categoryQuotas ?? {};
  for (const category of SUPPORTED_CATEGORIES) {
    if (!Number.isInteger(quotas[category]) || quotas[category] < 1) {
      errors.push(`Corpus quota for ${category} must be a positive integer.`);
    }
  }
  const quotaTotal = SUPPORTED_CATEGORIES.reduce((sum, category) => sum + (quotas[category] ?? 0), 0);
  if (quotaTotal !== 30) errors.push(`Category quotas must total 30, received ${quotaTotal}.`);
  const unknownQuotas = Object.keys(quotas).filter((category) => !SUPPORTED_CATEGORIES.includes(category));
  if (unknownQuotas.length) errors.push(`Unsupported category quotas: ${unknownQuotas.join(', ')}.`);

  const corpusLocales = Array.isArray(corpus?.locales) ? corpus.locales : [];
  const localeIds = corpusLocales.map((entry) => entry?.locale);
  for (const locale of SUPPORTED_LOCALES) {
    if (localeIds.filter((value) => value === locale).length !== 1) {
      errors.push(`Corpus must contain exactly one ${locale} locale.`);
    }
  }
  for (const locale of localeIds.filter((value) => !SUPPORTED_LOCALES.includes(value))) {
    errors.push(`Corpus contains unsupported locale ${String(locale)}.`);
  }

  const globalItemIds = new Set();
  for (const localeEntry of corpusLocales) {
    const locale = localeEntry?.locale ?? '<unknown>';
    const review = localeEntry?.nativeReview;
    if (!REVIEW_STATUSES.includes(review?.status)) {
      errors.push(`${locale} nativeReview status must be needs_native_review, approved, or provisional_non_native.`);
    } else if (GENERATION_READY_REVIEW_STATUSES.includes(review.status)) {
      if (!isNonEmptyString(review.reviewerId)) errors.push(`${locale} completed review requires reviewerId.`);
      if (!isNonEmptyString(review.reviewedAt) || Number.isNaN(Date.parse(review.reviewedAt))) {
        errors.push(`${locale} completed review requires an ISO review date.`);
      }
      const expectedQualification = review.status === 'approved' ? 'native' : 'non_native_best_available';
      if (review.reviewerQualification !== expectedQualification) {
        errors.push(`${locale} ${review.status} review requires reviewerQualification=${expectedQualification}.`);
      }
    } else if (review.reviewerId !== null || review.reviewedAt !== null
      || review.reviewerQualification !== null) {
      errors.push(`${locale} pending native review must keep reviewer metadata null.`);
    }

    const items = Array.isArray(localeEntry?.items) ? localeEntry.items : [];
    if (items.length !== 30) errors.push(`${locale} must contain exactly 30 items, received ${items.length}.`);
    const categoryCounts = Object.fromEntries(SUPPORTED_CATEGORIES.map((category) => [category, 0]));
    const localTextContexts = new Set();
    for (const item of items) {
      if (!isNonEmptyString(item?.id) || !/^[A-Za-z0-9._-]+$/.test(item.id)) {
        errors.push(`${locale} contains an item without a filesystem-safe id.`);
      }
      else if (globalItemIds.has(item.id)) errors.push(`Duplicate corpus item id: ${item.id}.`);
      else globalItemIds.add(item.id);
      if (!SUPPORTED_CATEGORIES.includes(item?.category)) {
        errors.push(`${item?.id ?? locale} has unsupported category ${String(item?.category)}.`);
      } else categoryCounts[item.category] += 1;
      if (!isNonEmptyString(item?.text) || item.text !== item.text.trim()) {
        errors.push(`${item?.id ?? locale} text must be non-empty with no surrounding whitespace.`);
      }
      if (!isNonEmptyString(item?.context) || item.context !== item.context.trim()) {
        errors.push(`${item?.id ?? locale} context must be non-empty with no surrounding whitespace.`);
      }
      const textContext = `${item?.text}\u0000${item?.context}`;
      if (localTextContexts.has(textContext)) errors.push(`${locale} repeats the same text and context: ${item?.text}.`);
      localTextContexts.add(textContext);
    }
    for (const category of SUPPORTED_CATEGORIES) {
      if (categoryCounts[category] !== quotas[category]) {
        errors.push(`${locale} requires ${quotas[category]} ${category} items, received ${categoryCounts[category]}.`);
      }
    }
  }

  const providers = Array.isArray(candidates?.providers) ? candidates.providers : [];
  for (const providerId of PROVIDER_IDS) {
    if (providers.filter((provider) => provider?.id === providerId).length !== 1) {
      errors.push(`Candidates must contain exactly one ${providerId} provider.`);
    }
  }
  for (const provider of providers) {
    if (!PROVIDER_IDS.includes(provider?.id)) errors.push(`Unsupported provider ${String(provider?.id)}.`);
    if (!isNonEmptyString(provider?.model)) errors.push(`${provider?.id ?? 'provider'} requires a model.`);
    if (!Number.isFinite(provider?.estimatedUsdPerMillionCharacters)
      || provider.estimatedUsdPerMillionCharacters < 0) {
      errors.push(`${provider?.id ?? 'provider'} requires a non-negative finite planning price.`);
    }
    if (!isNonEmptyString(provider?.priceCheckedAt) || Number.isNaN(Date.parse(provider.priceCheckedAt))) {
      errors.push(`${provider?.id ?? 'provider'} requires a valid priceCheckedAt date.`);
    }
    const voiceLocales = Array.isArray(provider?.voices) ? provider.voices : [];
    for (const locale of SUPPORTED_LOCALES) {
      const matches = voiceLocales.filter((entry) => entry?.locale === locale);
      if (matches.length !== 1) {
        errors.push(`${provider?.id ?? 'provider'} must contain exactly one ${locale} voice set.`);
        continue;
      }
      const ids = matches[0].ids;
      if (!Array.isArray(ids) || ids.length !== 2 || new Set(ids).size !== 2) {
        errors.push(`${provider.id} ${locale} must pin exactly two distinct voices.`);
      } else {
        for (const voiceId of ids) {
          if (!isNonEmptyString(voiceId) || !/^[A-Za-z0-9._-]+$/.test(voiceId)
            || !voiceId.startsWith(`${locale}-`)) {
            errors.push(`${provider.id} voice ${String(voiceId)} does not match exact locale ${locale}.`);
          }
        }
      }
    }
    for (const entry of voiceLocales.filter((entry) => !SUPPORTED_LOCALES.includes(entry?.locale))) {
      errors.push(`${provider?.id ?? 'provider'} contains unsupported locale ${String(entry?.locale)}.`);
    }
  }
  return errors;
}

function assertValid(inputs) {
  const errors = validateInputs(inputs.corpus, inputs.candidates);
  if (errors.length) throw new Error(`Bakeoff inputs are invalid:\n- ${errors.join('\n- ')}`);
}

function selectedProviders(candidates, providerOption) {
  if (!providerOption) return candidates.providers;
  const ids = providerOption.split(',').map((value) => value.trim()).filter(Boolean);
  if (!ids.length) throw new Error('Provider selection cannot be empty.');
  if (new Set(ids).size !== ids.length) throw new Error('Provider selection cannot contain duplicates.');
  const unknown = ids.filter((id) => !PROVIDER_IDS.includes(id));
  if (unknown.length) throw new Error(`Unknown provider selection: ${unknown.join(', ')}.`);
  return candidates.providers.filter((provider) => ids.includes(provider.id));
}

function createPlan(corpus, candidates, providerOption) {
  const providers = selectedProviders(candidates, providerOption);
  const providerPlans = providers.map((provider) => {
    let samples = 0;
    let characters = 0;
    for (const localeEntry of corpus.locales) {
      const voiceSet = provider.voices.find((entry) => entry.locale === localeEntry.locale);
      for (const item of localeEntry.items) {
        samples += voiceSet.ids.length;
        characters += [...item.text].length * voiceSet.ids.length;
      }
    }
    return {
      provider: provider.id,
      model: provider.model,
      samples,
      characters,
      estimatedUsdPerMillionCharacters: provider.estimatedUsdPerMillionCharacters,
      estimatedCostUsd: Number((characters * provider.estimatedUsdPerMillionCharacters / 1_000_000).toFixed(6)),
    };
  });
  return {
    schemaVersion: 1,
    locales: corpus.locales.length,
    corpusItems: corpus.locales.reduce((sum, entry) => sum + entry.items.length, 0),
    generatedSamples: providerPlans.reduce((sum, provider) => sum + provider.samples, 0),
    characters: providerPlans.reduce((sum, provider) => sum + provider.characters, 0),
    estimatedCostUsd: Number(providerPlans.reduce((sum, provider) => sum + provider.estimatedCostUsd, 0).toFixed(6)),
    hardCostCeilingUsd: candidates.hardCostCeilingUsd,
    providers: providerPlans,
    nativeReview: Object.fromEntries(corpus.locales.map((entry) => [entry.locale, entry.nativeReview.status])),
  };
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function synthesizeGoogle({ text, locale, voiceId }) {
  if (!googleClient) {
    let TextToSpeechClient;
    try {
      ({ TextToSpeechClient } = await import('@google-cloud/text-to-speech'));
    } catch {
      throw new Error('Google generation requires the @google-cloud/text-to-speech development dependency.');
    }
    googleClient = new TextToSpeechClient();
  }
  const [response] = await googleClient.synthesizeSpeech({
    input: { text },
    voice: { languageCode: locale, name: voiceId },
    audioConfig: { audioEncoding: 'MP3' },
  });
  if (!response.audioContent) throw new Error('Google returned no audio content.');
  return Buffer.isBuffer(response.audioContent)
    ? response.audioContent
    : Buffer.from(response.audioContent, 'base64');
}

async function synthesizeAzure({ text, locale, voiceId }) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error('Azure generation requires AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
  if (process.env.AZURE_SPEECH_TIER !== 'S0') {
    throw new Error('Azure generation requires AZURE_SPEECH_TIER=S0; free-tier output is not permitted.');
  }
  if (!/^[a-z0-9-]+$/i.test(region)) throw new Error('AZURE_SPEECH_REGION contains invalid characters.');
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
      'User-Agent': 'Wordfold-Pronunciation-Bakeoff',
    },
    body: `<speak version="1.0" xml:lang="${escapeXml(locale)}"><voice name="${escapeXml(voiceId)}">${escapeXml(text)}</voice></speak>`,
  });
  if (!response.ok) throw new Error(`Azure synthesis failed with HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

function sampleIdentity(provider, locale, voiceId, item) {
  return sha256(JSON.stringify([1, provider.id, provider.model, locale, voiceId, item.id, item.text]));
}

async function existingFileMatches(path, expectedSha256) {
  try {
    const info = await stat(path);
    if (info.size <= MINIMUM_AUDIO_BYTES) return false;
    return sha256(await readFile(path)) === expectedSha256;
  } catch {
    return false;
  }
}

async function writeJson(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

function assertArtifactOutputPath(path, label) {
  const pathFromRoot = relative(ARTIFACT_ROOT, path);
  if (!pathFromRoot || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    throw new Error(`${label} must be a child of ${relative(ROOT, ARTIFACT_ROOT)}.`);
  }
}

function audioFileFor(providerId, locale, voiceId, itemId) {
  return `${providerId}/${locale}/${voiceId}/${itemId}.mp3`;
}

function assertGenerationAllowed(inputs, options, plan) {
  if (!options.execute) throw new Error('Paid generation is disabled. Add --execute after reviewing the plan.');
  const maxCost = Number(options['max-cost-usd']);
  if (!Number.isFinite(maxCost) || maxCost <= 0) throw new Error('--max-cost-usd must be a positive number.');
  if (maxCost > inputs.candidates.hardCostCeilingUsd) {
    throw new Error(`--max-cost-usd cannot exceed the hard $${inputs.candidates.hardCostCeilingUsd} ceiling.`);
  }
  if (plan.estimatedCostUsd > maxCost) {
    throw new Error(`Estimated $${plan.estimatedCostUsd} cost exceeds the supplied $${maxCost} cap.`);
  }
  const pending = inputs.corpus.locales
    .filter((entry) => !GENERATION_READY_REVIEW_STATUSES.includes(entry.nativeReview.status))
    .map((entry) => entry.locale);
  if (pending.length) throw new Error(`Corpus screening review is required before generation: ${pending.join(', ')}.`);
  if (!isNonEmptyString(options.output)) throw new Error('Generation requires --output <directory>.');
  assertArtifactOutputPath(resolve(options.output), 'Generation output');
}

async function generate(inputs, options) {
  const providers = selectedProviders(inputs.candidates, options.provider);
  const plan = createPlan(inputs.corpus, inputs.candidates, options.provider);
  assertGenerationAllowed(inputs, options, plan);
  const output = resolve(options.output);
  const manifestPath = resolve(output, 'generation-manifest.json');
  await mkdir(output, { recursive: true });
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.corpusSha256 !== inputs.corpusSha256 || manifest.candidatesSha256 !== inputs.candidatesSha256) {
      throw new Error('Existing generation manifest does not match the current corpus and candidates.');
    }
    const existingProviders = manifest.plan?.providers?.map((provider) => provider.provider).sort().join(',');
    const requestedProviders = plan.providers.map((provider) => provider.provider).sort().join(',');
    if (existingProviders !== requestedProviders) {
      throw new Error('Existing generation manifest used a different provider selection. Choose another output directory.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      if (error instanceof SyntaxError) throw new Error('Existing generation manifest contains invalid JSON.');
      throw error;
    }
    manifest = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      corpusSha256: inputs.corpusSha256,
      candidatesSha256: inputs.candidatesSha256,
      plan,
      samples: [],
    };
  }

  for (const provider of providers) {
    for (const localeEntry of inputs.corpus.locales) {
      const voiceIds = provider.voices.find((entry) => entry.locale === localeEntry.locale).ids;
      for (const voiceId of voiceIds) {
        for (const item of localeEntry.items) {
          const identity = sampleIdentity(provider, localeEntry.locale, voiceId, item);
          const audioFile = audioFileFor(provider.id, localeEntry.locale, voiceId, item.id);
          const audioPath = resolve(output, audioFile);
          const previous = manifest.samples.find((sample) => sample.identity === identity);
          if (previous?.status === 'completed' && await existingFileMatches(audioPath, previous.sha256)) continue;
          await mkdir(resolve(audioPath, '..'), { recursive: true });
          const startedAt = Date.now();
          try {
            const audio = provider.id === 'google'
              ? await synthesizeGoogle({ text: item.text, locale: localeEntry.locale, voiceId })
              : await synthesizeAzure({ text: item.text, locale: localeEntry.locale, voiceId });
            if (audio.length <= MINIMUM_AUDIO_BYTES) throw new Error('Provider returned an empty or invalid audio file.');
            await writeFile(audioPath, audio);
            const completed = {
              identity,
              itemId: item.id,
              locale: localeEntry.locale,
              provider: provider.id,
              model: provider.model,
              voiceId,
              audioFile,
              sha256: sha256(audio),
              bytes: audio.length,
              latencyMs: Date.now() - startedAt,
              status: 'completed',
            };
            manifest.samples = manifest.samples.filter((sample) => sample.identity !== identity);
            manifest.samples.push(completed);
          } catch (error) {
            const failed = {
              identity,
              itemId: item.id,
              locale: localeEntry.locale,
              provider: provider.id,
              model: provider.model,
              voiceId,
              audioFile,
              latencyMs: Date.now() - startedAt,
              status: 'failed',
              error: safeErrorMessage(error),
            };
            manifest.samples = manifest.samples.filter((sample) => sample.identity !== identity);
            manifest.samples.push(failed);
            await writeJson(manifestPath, manifest);
            throw new Error(`${provider.id} failed for ${item.id} with ${voiceId}: ${failed.error}`);
          }
          await writeJson(manifestPath, manifest);
        }
      }
    }
  }
  return manifest;
}

async function blind(inputs, options) {
  if (!isNonEmptyString(options.input) || !isNonEmptyString(options.output)
    || !isNonEmptyString(options['key-output']) || !isNonEmptyString(options.seed)) {
    throw new Error('blind requires --input <generation-directory> --output <directory> --key-output <private-key.json> --seed <value>.');
  }
  const input = resolve(options.input);
  const output = resolve(options.output);
  const keyOutput = resolve(options['key-output']);
  assertArtifactOutputPath(output, 'Reviewer output');
  assertArtifactOutputPath(keyOutput, 'Private key output');
  if (keyOutput === resolve(output, 'answer-key.json') || keyOutput.startsWith(`${output}/`)) {
    throw new Error('--key-output must be outside the reviewer output directory.');
  }
  const generation = await readJson(resolve(input, 'generation-manifest.json'));
  if (generation.corpusSha256 !== inputs.corpusSha256 || generation.candidatesSha256 !== inputs.candidatesSha256) {
    throw new Error('Generation manifest does not match the current corpus and candidates.');
  }
  if (!Array.isArray(generation.samples) || generation.samples.length === 0) {
    throw new Error('Generation manifest contains no samples.');
  }
  const failed = generation.samples.filter((sample) => sample.status !== 'completed');
  if (failed.length) throw new Error(`Cannot blind a run with ${failed.length} incomplete or failed samples.`);
  const itemById = new Map(inputs.corpus.locales.flatMap((entry) => entry.items.map((item) => [item.id, item])));
  const providerIds = [...new Set(generation.samples.map((sample) => sample.provider))].sort();
  const unknownProviders = providerIds.filter((provider) => !PROVIDER_IDS.includes(provider));
  if (unknownProviders.length) throw new Error(`Generation manifest contains unknown providers: ${unknownProviders.join(', ')}.`);
  const providers = selectedProviders(inputs.candidates, providerIds.join(','));
  const expectedIdentities = new Set();
  for (const provider of providers) {
    for (const localeEntry of inputs.corpus.locales) {
      const voiceIds = provider.voices.find((entry) => entry.locale === localeEntry.locale).ids;
      for (const voiceId of voiceIds) {
        for (const item of localeEntry.items) {
          expectedIdentities.add(sampleIdentity(provider, localeEntry.locale, voiceId, item));
        }
      }
    }
  }
  if (generation.samples.length !== expectedIdentities.size) {
    throw new Error(`Generation run is incomplete: expected ${expectedIdentities.size}, found ${generation.samples.length}.`);
  }
  const audioOutput = resolve(output, 'audio');
  await mkdir(audioOutput, { recursive: true });
  const reviewerSamples = [];
  const keySamples = [];
  const opaqueIds = new Set();
  const seenIdentities = new Set();
  for (const sample of generation.samples) {
    const item = itemById.get(sample.itemId);
    if (!item) throw new Error(`Generation manifest contains unknown item ${sample.itemId}.`);
    const provider = providers.find((entry) => entry.id === sample.provider);
    const validVoices = provider?.voices.find((entry) => entry.locale === sample.locale)?.ids ?? [];
    if (!provider || !validVoices.includes(sample.voiceId)) {
      throw new Error(`Generation manifest contains invalid voice ${sample.voiceId} for ${sample.locale}.`);
    }
    const expectedIdentity = sampleIdentity(provider, sample.locale, sample.voiceId, item);
    if (sample.identity !== expectedIdentity || !expectedIdentities.has(sample.identity)) {
      throw new Error(`Generation identity failed validation for ${sample.itemId}.`);
    }
    const expectedAudioFile = audioFileFor(sample.provider, sample.locale, sample.voiceId, sample.itemId);
    if (sample.audioFile !== expectedAudioFile) throw new Error(`Generation audio path failed validation for ${sample.itemId}.`);
    if (seenIdentities.has(sample.identity)) throw new Error(`Generation manifest repeats ${sample.itemId}.`);
    seenIdentities.add(sample.identity);
    const blindId = sha256(`${options.seed}\u0000${sample.identity}`).slice(0, 20);
    if (opaqueIds.has(blindId)) throw new Error('Opaque sample id collision. Choose a different seed.');
    opaqueIds.add(blindId);
    const source = resolve(input, sample.audioFile);
    if (!await existingFileMatches(source, sample.sha256)) throw new Error(`Audio checksum failed for ${sample.itemId}.`);
    await copyFile(source, resolve(audioOutput, `${blindId}.mp3`));
    reviewerSamples.push({
      blindId,
      itemId: sample.itemId,
      locale: sample.locale,
      category: item.category,
      text: item.text,
      context: item.context,
      audioFile: `audio/${blindId}.mp3`,
    });
    keySamples.push({
      blindId,
      identity: sample.identity,
      provider: sample.provider,
      model: sample.model,
      voiceId: sample.voiceId,
      locale: sample.locale,
      itemId: sample.itemId,
      sha256: sample.sha256,
      latencyMs: sample.latencyMs,
    });
  }
  reviewerSamples.sort((left, right) => left.blindId.localeCompare(right.blindId));
  keySamples.sort((left, right) => left.blindId.localeCompare(right.blindId));
  await mkdir(resolve(keyOutput, '..'), { recursive: true });
  await Promise.all([
    writeJson(resolve(output, 'reviewer-manifest.json'), { schemaVersion: 1, samples: reviewerSamples }),
    writeJson(keyOutput, {
      schemaVersion: 1,
      corpusSha256: inputs.corpusSha256,
      candidatesSha256: inputs.candidatesSha256,
      samples: keySamples,
    }),
    writeJson(resolve(output, 'ratings-template.json'), { schemaVersion: 1, ratings: [] }),
  ]);
  return { samples: reviewerSamples.length, output };
}

function scoreRatings(key, reviewerManifest, ratingsPayload) {
  if (key?.schemaVersion !== 1 || reviewerManifest?.schemaVersion !== 1 || ratingsPayload?.schemaVersion !== 1) {
    throw new Error('Answer key, reviewer manifest, and ratings must use schemaVersion 1.');
  }
  if (!Array.isArray(key.samples) || !Array.isArray(reviewerManifest.samples)) {
    throw new Error('Answer key and reviewer manifest require sample arrays.');
  }
  const ratings = Array.isArray(ratingsPayload.ratings) ? ratingsPayload.ratings : [];
  const keyById = new Map(key.samples.map((sample) => [sample.blindId, sample]));
  const reviewerIds = new Set(reviewerManifest.samples.map((sample) => sample.blindId));
  if (keyById.size !== key.samples.length || reviewerIds.size !== reviewerManifest.samples.length) {
    throw new Error('Answer key and reviewer manifest cannot contain duplicate blind IDs.');
  }
  if (keyById.size !== reviewerIds.size || [...keyById.keys()].some((blindId) => !reviewerIds.has(blindId))) {
    throw new Error('Answer key and reviewer manifest sample IDs do not match.');
  }
  const pairIds = new Set();
  const ratingsBySample = new Map();
  for (const rating of ratings) {
    if (!keyById.has(rating?.blindId) || !reviewerIds.has(rating?.blindId)) {
      throw new Error(`Rating contains unknown blindId ${String(rating?.blindId)}.`);
    }
    if (!isNonEmptyString(rating?.reviewerId)) throw new Error(`${rating.blindId} rating requires reviewerId.`);
    if (typeof rating.acceptable !== 'boolean' || typeof rating.wrongLocale !== 'boolean') {
      throw new Error(`${rating.blindId} rating flags must be boolean.`);
    }
    const pairId = `${rating.blindId}\u0000${rating.reviewerId}`;
    if (pairIds.has(pairId)) throw new Error(`Duplicate rating from ${rating.reviewerId} for ${rating.blindId}.`);
    pairIds.add(pairId);
    const sampleRatings = ratingsBySample.get(rating.blindId) ?? [];
    sampleRatings.push(rating);
    ratingsBySample.set(rating.blindId, sampleRatings);
  }

  const groups = new Map();
  let fullyRatedSamples = 0;
  let disagreementSamples = 0;
  for (const sample of key.samples) {
    const sampleRatings = ratingsBySample.get(sample.blindId) ?? [];
    const reviewers = new Set(sampleRatings.map((rating) => rating.reviewerId));
    if (reviewers.size >= 2) fullyRatedSamples += 1;
    if (new Set(sampleRatings.map((rating) => `${rating.acceptable}|${rating.wrongLocale}`)).size > 1) {
      disagreementSamples += 1;
    }
    const groupId = `${sample.locale}\u0000${sample.provider}\u0000${sample.voiceId}`;
    const group = groups.get(groupId) ?? {
      locale: sample.locale,
      provider: sample.provider,
      model: sample.model,
      voiceId: sample.voiceId,
      samples: 0,
      fullyRatedSamples: 0,
      ratings: 0,
      acceptableRatings: 0,
      wrongLocaleRatings: 0,
      disagreementSamples: 0,
      totalLatencyMs: 0,
    };
    group.samples += 1;
    group.totalLatencyMs += sample.latencyMs;
    if (reviewers.size >= 2) group.fullyRatedSamples += 1;
    if (new Set(sampleRatings.map((rating) => `${rating.acceptable}|${rating.wrongLocale}`)).size > 1) {
      group.disagreementSamples += 1;
    }
    for (const rating of sampleRatings) {
      group.ratings += 1;
      if (rating.acceptable) group.acceptableRatings += 1;
      if (rating.wrongLocale) group.wrongLocaleRatings += 1;
    }
    groups.set(groupId, group);
  }
  const results = [...groups.values()].map((group) => {
    const complete = group.fullyRatedSamples === group.samples;
    const acceptableRate = group.ratings ? group.acceptableRatings / group.ratings : 0;
    return {
      locale: group.locale,
      provider: group.provider,
      model: group.model,
      voiceId: group.voiceId,
      samples: group.samples,
      fullyRatedSamples: group.fullyRatedSamples,
      ratings: group.ratings,
      acceptableRate: Number(acceptableRate.toFixed(4)),
      wrongLocaleRatings: group.wrongLocaleRatings,
      disagreementSamples: group.disagreementSamples,
      meanGenerationLatencyMs: Math.round(group.totalLatencyMs / group.samples),
      passesScreening: complete && acceptableRate >= 0.95 && group.wrongLocaleRatings === 0,
    };
  }).sort((left, right) => left.locale.localeCompare(right.locale)
    || left.provider.localeCompare(right.provider)
    || left.voiceId.localeCompare(right.voiceId));
  const evaluationComplete = fullyRatedSamples === key.samples.length;
  const recommendations = results.filter((result) => result.passesScreening).map((result) => ({
    locale: result.locale,
    provider: result.provider,
    model: result.model,
    voiceId: result.voiceId,
  }));
  const coveredLocales = new Set(recommendations.map((recommendation) => recommendation.locale));
  return {
    schemaVersion: 1,
    samples: key.samples.length,
    fullyRatedSamples,
    incompleteSamples: key.samples.length - fullyRatedSamples,
    disagreementSamples,
    evaluationComplete,
    canRecommend: evaluationComplete && SUPPORTED_LOCALES.every((locale) => coveredLocales.has(locale)),
    recommendations,
    results,
  };
}

function printHelp() {
  console.log(`Wordfold pronunciation provider bakeoff

Commands:
  validate [--corpus path] [--candidates path]
  plan [--provider google,azure] [--json]
  generate --execute --max-cost-usd amount --output directory [--provider google,azure]
  blind --input generation-directory --output blind-directory --seed value
        --key-output private-key.json
  score --input blind-directory --key private-key.json --ratings ratings.json

No command contacts a paid provider except generate with --execute.`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'help' || command === '--help') return printHelp();
  const inputs = await loadInputs(options);
  assertValid(inputs);
  if (command === 'validate') {
    const plan = createPlan(inputs.corpus, inputs.candidates);
    console.log(`Valid pronunciation bakeoff inputs: ${plan.corpusItems} items, ${plan.locales} locales, ${plan.generatedSamples} planned samples.`);
    return;
  }
  if (command === 'plan') {
    const plan = createPlan(inputs.corpus, inputs.candidates, options.provider);
    if (options.json) console.log(JSON.stringify(plan, null, 2));
    else {
      console.log(`${plan.corpusItems} corpus items across ${plan.locales} locales`);
      for (const provider of plan.providers) {
        console.log(`${provider.provider}: ${provider.samples} samples, ${provider.characters} characters, estimated $${provider.estimatedCostUsd}`);
      }
      console.log(`Total: ${plan.generatedSamples} samples, estimated $${plan.estimatedCostUsd}; hard ceiling $${plan.hardCostCeilingUsd}`);
    }
    return;
  }
  if (command === 'generate') {
    try {
      const manifest = await generate(inputs, options);
      console.log(`Generated ${manifest.samples.filter((sample) => sample.status === 'completed').length} pronunciation samples.`);
    } finally {
      if (googleClient) await googleClient.close();
      googleClient = undefined;
    }
    return;
  }
  if (command === 'blind') {
    const result = await blind(inputs, options);
    console.log(`Created blinded package with ${result.samples} samples at ${relative(ROOT, result.output) || '.'}.`);
    return;
  }
  if (command === 'score') {
    if (!isNonEmptyString(options.input) || !isNonEmptyString(options.key) || !isNonEmptyString(options.ratings)) {
      throw new Error('score requires --input <blind-directory> --key <private-key.json> --ratings <ratings.json>.');
    }
    const input = resolve(options.input);
    const [key, reviewerManifest, ratings] = await Promise.all([
      readJson(resolve(options.key)),
      readJson(resolve(input, 'reviewer-manifest.json')),
      readJson(resolve(options.ratings)),
    ]);
    if (key.corpusSha256 !== inputs.corpusSha256 || key.candidatesSha256 !== inputs.candidatesSha256) {
      throw new Error('Answer key does not match the current corpus and candidates.');
    }
    console.log(JSON.stringify(scoreRatings(key, reviewerManifest, ratings), null, 2));
    return;
  }
  throw new Error(`Unknown command: ${command}. Run with help for usage.`);
}

main().catch((error) => {
  console.error(`Error: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
