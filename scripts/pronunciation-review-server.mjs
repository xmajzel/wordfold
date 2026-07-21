#!/usr/bin/env node

import { createServer } from 'node:http';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const ARTIFACT_ROOT = resolve(ROOT, '.artifacts');
const STATIC_ROOT = resolve(import.meta.dirname, 'pronunciation-review');
const DEFAULT_PORT = 8091;
const MAX_BODY_BYTES = 4096;
const MAX_NOTE_LENGTH = 500;
const REVIEWER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BLIND_ID_PATTERN = /^[a-f0-9]{20}$/;

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') continue;
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value.`);
    options[name] = value;
    index += 1;
  }
  return options;
}

function assertArtifactPath(path, label) {
  const pathFromArtifacts = relative(ARTIFACT_ROOT, path);
  if (!pathFromArtifacts || pathFromArtifacts.startsWith('..') || isAbsolute(pathFromArtifacts)) {
    throw new Error(`${label} must be a child of .artifacts.`);
  }
}

function validateReviewerId(value) {
  if (typeof value !== 'string' || !REVIEWER_ID_PATTERN.test(value)) {
    throw new Error('Reviewer ID must use 1-64 letters, numbers, dots, underscores, or hyphens.');
  }
  return value;
}

function validateRating(rating, knownBlindIds) {
  if (!rating || typeof rating !== 'object') throw new Error('Rating must be an object.');
  if (!knownBlindIds.has(rating.blindId)) throw new Error(`Unknown blindId ${String(rating.blindId)}.`);
  const reviewerId = validateReviewerId(rating.reviewerId);
  if (typeof rating.acceptable !== 'boolean' || typeof rating.wrongLocale !== 'boolean') {
    throw new Error('Rating flags must be boolean.');
  }
  if (rating.wrongLocale && rating.acceptable) {
    throw new Error('A wrong-locale rating cannot also be acceptable.');
  }
  const note = rating.note == null ? '' : rating.note;
  if (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH) {
    throw new Error(`Rating note must contain at most ${MAX_NOTE_LENGTH} characters.`);
  }
  return {
    blindId: rating.blindId,
    reviewerId,
    acceptable: rating.acceptable,
    wrongLocale: rating.wrongLocale,
    ...(note.trim() ? { note: note.trim() } : {}),
  };
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadReviewerManifest(input) {
  const manifest = await readJson(resolve(input, 'reviewer-manifest.json'), 'Reviewer manifest');
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.samples) || manifest.samples.length === 0) {
    throw new Error('Reviewer manifest must use schemaVersion 1 and contain samples.');
  }
  const blindIds = new Set();
  const audioFiles = new Set();
  const forbiddenFields = ['provider', 'model', 'voiceId', 'identity'];
  if (forbiddenFields.some((field) => Object.hasOwn(manifest, field))) {
    throw new Error('Reviewer manifest exposes private identity metadata.');
  }
  const publicSamples = [];
  for (const sample of manifest.samples) {
    if (!BLIND_ID_PATTERN.test(sample?.blindId ?? '')) throw new Error('Reviewer manifest contains an invalid blindId.');
    if (blindIds.has(sample.blindId)) throw new Error(`Reviewer manifest repeats ${sample.blindId}.`);
    blindIds.add(sample.blindId);
    if (forbiddenFields.some((field) => Object.hasOwn(sample, field))) {
      throw new Error(`Reviewer manifest exposes private identity for ${sample.blindId}.`);
    }
    const expectedAudioFile = `audio/${sample.blindId}.mp3`;
    if (sample.audioFile !== expectedAudioFile || audioFiles.has(sample.audioFile)) {
      throw new Error(`Reviewer manifest contains an invalid audio path for ${sample.blindId}.`);
    }
    audioFiles.add(sample.audioFile);
    if (![sample.locale, sample.category, sample.text, sample.context].every((value) => typeof value === 'string' && value.trim())) {
      throw new Error(`Reviewer manifest contains incomplete metadata for ${sample.blindId}.`);
    }
    const audioInfo = await stat(resolve(input, sample.audioFile));
    if (!audioInfo.isFile() || audioInfo.size <= 100) throw new Error(`Reviewer audio is invalid for ${sample.blindId}.`);
    publicSamples.push({
      blindId: sample.blindId,
      locale: sample.locale,
      category: sample.category,
      text: sample.text,
      context: sample.context,
      audioFile: sample.audioFile,
    });
  }
  return { schemaVersion: 1, samples: publicSamples };
}

async function loadRatings(path, knownBlindIds) {
  let payload;
  try {
    payload = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { schemaVersion: 1, ratings: [] };
    throw new Error(`Ratings could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.ratings)) {
    throw new Error('Ratings must use schemaVersion 1 and contain a ratings array.');
  }
  const pairIds = new Set();
  const ratings = payload.ratings.map((rating) => {
    const validated = validateRating(rating, knownBlindIds);
    const pairId = `${validated.blindId}\u0000${validated.reviewerId}`;
    if (pairIds.has(pairId)) throw new Error(`Ratings repeat ${validated.blindId} for ${validated.reviewerId}.`);
    pairIds.add(pairId);
    return validated;
  });
  return { schemaVersion: 1, ratings };
}

async function writeRatings(path, payload) {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, path);
}

function send(response, status, body, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Type': contentType,
    ...extraHeaders,
  });
  response.end(body);
}

function sendJson(response, status, value, extraHeaders) {
  send(response, status, `${JSON.stringify(value)}\n`, 'application/json; charset=utf-8', extraHeaders);
}

async function readRequestJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function parseAudioRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
  if (!match) throw new Error('Unsupported audio range.');
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= size) {
    throw new Error('Invalid audio range.');
  }
  return { start, end };
}

async function startServer(options) {
  if (!options.input) throw new Error('Review server requires --input <blinded-directory>.');
  const input = resolve(options.input);
  const ratingsPath = resolve(options.ratings ?? resolve(input, 'ratings.json'));
  assertArtifactPath(input, 'Review input');
  assertArtifactPath(ratingsPath, 'Ratings output');
  const port = options.port == null ? DEFAULT_PORT : Number(options.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be an integer from 0 to 65535.');

  const manifest = await loadReviewerManifest(input);
  const samplesById = new Map(manifest.samples.map((sample) => [sample.blindId, sample]));
  const knownBlindIds = new Set(samplesById.keys());
  let ratingsPayload = await loadRatings(ratingsPath, knownBlindIds);
  let writeQueue = Promise.resolve();

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, {
          samples: manifest.samples.length,
          locales: [...new Set(manifest.samples.map((sample) => sample.locale))],
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/manifest') {
        sendJson(response, 200, manifest);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/ratings') {
        const reviewerId = validateReviewerId(url.searchParams.get('reviewerId') ?? '');
        sendJson(response, 200, {
          schemaVersion: 1,
          ratings: ratingsPayload.ratings.filter((rating) => rating.reviewerId === reviewerId),
        });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/export') {
        const reviewerId = validateReviewerId(url.searchParams.get('reviewerId') ?? '');
        const body = `${JSON.stringify({
          schemaVersion: 1,
          ratings: ratingsPayload.ratings.filter((rating) => rating.reviewerId === reviewerId),
        }, null, 2)}\n`;
        send(response, 200, body, 'application/json; charset=utf-8', {
          'Content-Disposition': `attachment; filename="ratings-${reviewerId}.json"`,
        });
        return;
      }
      const ratingMatch = /^\/api\/ratings\/([a-f0-9]{20})$/.exec(url.pathname);
      if (request.method === 'PUT' && ratingMatch) {
        const rating = validateRating({ ...(await readRequestJson(request)), blindId: ratingMatch[1] }, knownBlindIds);
        writeQueue = writeQueue.catch(() => {}).then(async () => {
          ratingsPayload = await loadRatings(ratingsPath, knownBlindIds);
          const pairId = `${rating.blindId}\u0000${rating.reviewerId}`;
          const remaining = ratingsPayload.ratings.filter(
            (entry) => `${entry.blindId}\u0000${entry.reviewerId}` !== pairId,
          );
          ratingsPayload = {
            schemaVersion: 1,
            ratings: [...remaining, rating].sort((left, right) => left.blindId.localeCompare(right.blindId)
              || left.reviewerId.localeCompare(right.reviewerId)),
          };
          await writeRatings(ratingsPath, ratingsPayload);
        });
        await writeQueue;
        sendJson(response, 200, rating);
        return;
      }
      const audioMatch = /^\/audio\/([a-f0-9]{20})\.mp3$/.exec(url.pathname);
      if (request.method === 'GET' && audioMatch && samplesById.has(audioMatch[1])) {
        const sample = samplesById.get(audioMatch[1]);
        const audio = await readFile(resolve(input, sample.audioFile));
        let range;
        try {
          range = parseAudioRange(request.headers.range, audio.length);
        } catch (error) {
          send(response, 416, error.message, 'text/plain; charset=utf-8', {
            'Content-Range': `bytes */${audio.length}`,
          });
          return;
        }
        if (range) {
          const body = audio.subarray(range.start, range.end + 1);
          send(response, 206, body, 'audio/mpeg', {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(body.length),
            'Content-Range': `bytes ${range.start}-${range.end}/${audio.length}`,
          });
        } else {
          send(response, 200, audio, 'audio/mpeg', {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(audio.length),
          });
        }
        return;
      }
      const staticFiles = new Map([
        ['/', ['index.html', 'text/html; charset=utf-8']],
        ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
        ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
      ]);
      if (request.method === 'GET' && staticFiles.has(url.pathname)) {
        const [file, contentType] = staticFiles.get(url.pathname);
        send(response, 200, await readFile(resolve(STATIC_ROOT, file)), contentType);
        return;
      }
      sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  console.log(`Pronunciation review: http://127.0.0.1:${address.port}/`);
  console.log(`Blinded samples: ${manifest.samples.length}; ratings: ${relative(ROOT, ratingsPath)}`);

  const close = () => server.close(() => process.exit(0));
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

startServer(parseArguments(process.argv.slice(2))).catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
