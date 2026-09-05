#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { open, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import process from 'node:process';

import {
  createReviewTemplate,
  sha256Payload,
  stableJson,
  validateCandidateDataset,
  validateReview,
} from './spanish-a1-pipeline.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const ARTIFACT_ROOT = resolve(ROOT, '.artifacts');
const STATIC_ROOT = resolve(import.meta.dirname, 'spanish-a1-review');
const DEFAULT_PORT = 8092;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_NOTES_LENGTH = 2_000;
const MAX_ATTESTATION_LENGTH = 1_000;
const REVIEWER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const DECISIONS = new Set(['approved', 'changes-requested', 'pending', 'rejected']);
const DEFAULT_PATHS = Object.freeze({
  sources: resolve(ROOT, 'assets/catalog/spanish/a1-source-manifest.json'),
  candidates: resolve(ROOT, 'assets/catalog/spanish/a1-candidates.json'),
  evidence: resolve(ROOT, 'assets/catalog/spanish/a1-lexical-evidence.json'),
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function assert(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') continue;
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value.`);
    if (Object.hasOwn(options, name)) throw new Error(`--${name} may be provided only once.`);
    options[name] = value;
    index += 1;
  }
  return options;
}

function assertOnlyKeys(value, keys, label) {
  assert(isPlainObject(value), `${label} must be an object.`);
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  assert(stableJson(actual) === stableJson(expected), `${label} has an invalid shape.`);
}

function assertArtifactChild(path, label) {
  const childPath = relative(ARTIFACT_ROOT, path);
  assert(childPath && !childPath.startsWith('..') && !isAbsolute(childPath), `${label} must be a JSON file beneath .artifacts.`);
  assert(extname(path) === '.json', `${label} must be a JSON file beneath .artifacts.`);
}

async function resolveReviewPath(value) {
  assert(nonEmptyString(value), 'Review server requires --review <review-package.json>.');
  const requestedPath = resolve(value);
  assertArtifactChild(requestedPath, 'Review package');
  const [artifactRealPath, reviewRealPath, info] = await Promise.all([
    realpath(ARTIFACT_ROOT),
    realpath(requestedPath).catch((error) => {
      throw new Error(`Review package could not be resolved: ${error instanceof Error ? error.message : String(error)}`);
    }),
    stat(requestedPath).catch((error) => {
      throw new Error(`Review package could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }),
  ]);
  const realChildPath = relative(artifactRealPath, reviewRealPath);
  assert(realChildPath && !realChildPath.startsWith('..') && !isAbsolute(realChildPath), 'Review package symlinks must remain beneath .artifacts.');
  assert(info.isFile(), 'Review package must be a regular file.');
  return reviewRealPath;
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`${label} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fileSha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function validateReviewerMetadata(review) {
  assert(REVIEWER_ID_PATTERN.test(review.reviewerId ?? ''), 'Review package requires a registered reviewer ID using 1-64 letters, numbers, dots, underscores, or hyphens.');
  assert(nonEmptyString(review.qualification) && review.qualification.trim().length <= 200, 'Review package requires a registered reviewer qualification of at most 200 characters.');
  assert(typeof review.attestation === 'string' && review.attestation.length <= MAX_ATTESTATION_LENGTH, `Attestation must contain at most ${MAX_ATTESTATION_LENGTH} characters.`);
  assert(typeof review.reviewedAt === 'string', 'reviewedAt must be a string.');
  assert(Boolean(review.attestation.trim()) === Boolean(review.reviewedAt.trim()), 'Attestation and reviewedAt must either both be empty or both be complete.');
}

function offeredSenses(subject) {
  const evidence = subject.lexicalEvidence;
  if (evidence?.type === 'omw') return [{
    lexicalEntryId: '',
    writtenForm: evidence.lemma,
    partOfSpeech: subject.partOfSpeech,
    senseId: evidence.senseId,
    synsetId: evidence.synsetId,
  }];
  return Array.isArray(evidence?.candidateSenses) ? evidence.candidateSenses : [];
}

function validateDecisionInput(input, subject, reviewKind) {
  const commonKeys = ['catalogSenseId', 'decision', 'entryId', 'expectedRevision', 'notes'];
  const keys = reviewKind === 'spanish'
    ? [...commonKeys, 'originalEditorialExceptionApproved', 'selectedSenseId']
    : commonKeys;
  assertOnlyKeys(input, keys, 'Decision payload');
  assert(nonEmptyString(input.expectedRevision) && /^[a-f0-9]{64}$/u.test(input.expectedRevision), 'Decision payload requires a valid expectedRevision.');
  assert(input.entryId === subject.entryId && input.catalogSenseId === subject.catalogSenseId, 'Decision identity does not match the selected review subject.');
  assert(DECISIONS.has(input.decision), 'Decision must be approved, changes-requested, pending, or rejected.');
  assert(typeof input.notes === 'string' && input.notes.length <= MAX_NOTES_LENGTH, `Decision notes must contain at most ${MAX_NOTES_LENGTH} characters.`);
  const notes = input.notes.trim();
  if (input.decision === 'changes-requested' || input.decision === 'rejected') {
    assert(notes.length > 0, `${input.decision} decisions require notes.`);
  }

  const decision = {
    entryId: subject.entryId,
    catalogSenseId: subject.catalogSenseId,
    decision: input.decision,
    notes,
  };
  if (reviewKind === 'spanish') {
    assert(input.selectedSenseId === null || nonEmptyString(input.selectedSenseId), 'selectedSenseId must be a non-empty string or null.');
    assert(typeof input.originalEditorialExceptionApproved === 'boolean', 'originalEditorialExceptionApproved must be a boolean.');
    const senses = offeredSenses(subject);
    const offeredIds = new Set(senses.map((sense) => sense.senseId));
    assert(input.selectedSenseId === null || offeredIds.has(input.selectedSenseId), 'The selected OMW sense was not offered for this subject.');
    assert(!(input.originalEditorialExceptionApproved && senses.length > 0), 'An original-editorial exception cannot replace an offered OMW sense.');
    if (input.decision === 'approved') {
      if (senses.length > 0) {
        assert(input.selectedSenseId !== null && !input.originalEditorialExceptionApproved, 'Spanish approval requires exactly one offered OMW sense.');
      } else {
        assert(input.selectedSenseId === null && input.originalEditorialExceptionApproved, 'Spanish approval without offered senses requires explicit original-editorial exception approval.');
      }
    }
    decision.selectedSenseId = input.selectedSenseId;
    decision.originalEditorialExceptionApproved = input.originalEditorialExceptionApproved;
  }
  return { decision, expectedRevision: input.expectedRevision };
}

function validateStoredReview(review, expectedTemplate, data) {
  assertOnlyKeys(review, Object.keys(expectedTemplate), 'Review package');
  assert(review.reviewKind === expectedTemplate.reviewKind, 'Review package kind changed.');
  assert(stableJson(review.subjects) === stableJson(expectedTemplate.subjects), 'Review subjects do not match the immutable candidate and evidence assets.');
  validateReviewerMetadata(review);
  validateReview(review, data.candidates, review.reviewKind, {
    allowTemplate: true,
    lexicalEvidence: data.evidence,
    sourceManifest: data.sources,
  });
  assert(review.decisions.length === review.subjects.length, 'Review decisions and subjects must have the same length.');
  const decisionKeys = review.reviewKind === 'spanish'
    ? ['entryId', 'catalogSenseId', 'decision', 'notes', 'selectedSenseId', 'originalEditorialExceptionApproved']
    : ['entryId', 'catalogSenseId', 'decision', 'notes'];
  for (const [index, decision] of review.decisions.entries()) {
    const subject = review.subjects[index];
    assertOnlyKeys(decision, decisionKeys, `Decision ${index + 1}`);
    assert(decision.entryId === subject.entryId && decision.catalogSenseId === subject.catalogSenseId, `Decision ${index + 1} is out of order or does not match its subject.`);
    validateDecisionInput({ ...decision, expectedRevision: '0'.repeat(64) }, subject, review.reviewKind);
  }
  if (review.reviewedAt.trim()) {
    validateReview(review, data.candidates, review.reviewKind, {
      lexicalEvidence: data.evidence,
      sourceManifest: data.sources,
    });
  }
  return review;
}

async function loadImmutableData(paths) {
  const [sources, candidates, evidence] = await Promise.all([
    readJson(paths.sources, 'Source manifest'),
    readJson(paths.candidates, 'Candidate dataset'),
    readJson(paths.evidence, 'Lexical evidence'),
  ]);
  validateCandidateDataset(candidates, sources, evidence);
  return {
    sources,
    candidates,
    evidence,
    hashes: {
      sources: await fileSha256(paths.sources),
      candidates: await fileSha256(paths.candidates),
      evidence: await fileSha256(paths.evidence),
    },
  };
}

async function assertImmutableFiles(paths, hashes) {
  const current = await Promise.all([fileSha256(paths.sources), fileSha256(paths.candidates), fileSha256(paths.evidence)]);
  assert(current[0] === hashes.sources && current[1] === hashes.candidates && current[2] === hashes.evidence, 'Immutable source, candidate, or evidence assets changed during this review session.', 409);
}

function reviewRevision(review) {
  return sha256Payload(review);
}

let writeSequence = 0;
async function writeReview(path, review) {
  writeSequence += 1;
  const temporaryPath = `${path}.${process.pid}.${writeSequence}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(review, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

async function acquireReviewLock(reviewPath) {
  const lockPath = `${reviewPath}.lock`;
  const token = randomUUID();
  let handle;
  try {
    handle = await open(lockPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() })}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
      await unlink(lockPath).catch(() => {});
    }
    if (error?.code === 'EEXIST') {
      throw new HttpError(409, 'Another local review process is writing this package. Retry after refreshing.');
    }
    throw error;
  }
  return async () => {
    await handle.close();
    try {
      const lock = JSON.parse(await readFile(lockPath, 'utf8'));
      if (lock.token === token) await unlink(lockPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  };
}

function publicSession(review) {
  return {
    schemaVersion: review.schemaVersion,
    courseId: review.courseId,
    level: review.level,
    reviewKind: review.reviewKind,
    reviewerId: review.reviewerId,
    qualification: review.qualification,
    attestation: review.attestation,
    reviewedAt: review.reviewedAt,
    ...(review.reviewKind === 'spanish' ? { lexicalSource: review.lexicalSource, semanticSource: review.semanticSource } : {}),
    subjects: review.subjects,
    decisions: review.decisions,
    revision: reviewRevision(review),
  };
}

function send(response, status, body, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Type': contentType,
    ...extraHeaders,
  });
  response.end(body);
}

function sendJson(response, status, value, extraHeaders = {}) {
  send(response, status, `${JSON.stringify(value)}\n`, 'application/json; charset=utf-8', extraHeaders);
}

async function readRequestJson(request) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers['content-type'] ?? '')) {
    throw new HttpError(415, 'Request Content-Type must be application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function rejectUnsupportedMethod(request, response, allowed) {
  sendJson(response, 405, { error: `Method ${request.method} is not allowed.` }, { Allow: allowed });
}

export async function startSpanishA1ReviewServer(options) {
  const reviewPath = await resolveReviewPath(options.review);
  const paths = {
    sources: resolve(options.sources ?? DEFAULT_PATHS.sources),
    candidates: resolve(options.candidates ?? DEFAULT_PATHS.candidates),
    evidence: resolve(options.evidence ?? DEFAULT_PATHS.evidence),
  };
  const port = options.port == null ? DEFAULT_PORT : Number(options.port);
  assert(Number.isInteger(port) && port >= 0 && port <= 65535, '--port must be an integer from 0 to 65535.');

  const data = await loadImmutableData(paths);
  let review = await readJson(reviewPath, 'Review package');
  assert(review?.reviewKind === 'spanish' || review?.reviewKind === 'slovak', 'Review package kind must be spanish or slovak.');
  const template = createReviewTemplate(data.candidates, review.reviewKind, data.evidence, data.sources);
  review = validateStoredReview(review, template, data);
  let writeQueue = Promise.resolve();

  async function withWrite(expectedRevision, mutate) {
    let result;
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      const releaseLock = await acquireReviewLock(reviewPath);
      try {
        await assertImmutableFiles(paths, data.hashes);
        const onDisk = validateStoredReview(await readJson(reviewPath, 'Review package'), template, data);
        assert(reviewRevision(onDisk) === expectedRevision, 'Review package changed since it was loaded. Refresh before saving.', 409);
        const updated = mutate(structuredClone(onDisk));
        validateStoredReview(updated, template, data);
        await writeReview(reviewPath, updated);
        review = updated;
        result = publicSession(updated);
      } finally {
        await releaseLock();
      }
    });
    await writeQueue;
    return result;
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const address = server.address();
      const expectedOrigin = `http://127.0.0.1:${address.port}`;
      assert(request.headers.host === `127.0.0.1:${address.port}`, 'Requests must use the loopback review-server address.', 403);
      assert(!request.headers.origin || request.headers.origin === expectedOrigin, 'Cross-origin requests are not allowed.', 403);
      if (url.pathname === '/api/health') {
        if (request.method !== 'GET') return rejectUnsupportedMethod(request, response, 'GET');
        sendJson(response, 200, {
          reviewKind: review.reviewKind,
          reviewerId: review.reviewerId,
          subjects: review.subjects.length,
        });
        return;
      }
      if (url.pathname === '/api/session') {
        if (request.method !== 'GET') return rejectUnsupportedMethod(request, response, 'GET');
        await assertImmutableFiles(paths, data.hashes);
        review = validateStoredReview(await readJson(reviewPath, 'Review package'), template, data);
        sendJson(response, 200, publicSession(review));
        return;
      }
      if (url.pathname === '/api/decision') {
        if (request.method !== 'PUT') return rejectUnsupportedMethod(request, response, 'PUT');
        const input = await readRequestJson(request);
        const subject = review.subjects.find((item) => item.catalogSenseId === input?.catalogSenseId);
        assert(subject, 'Unknown review subject.', 404);
        const validated = validateDecisionInput(input, subject, review.reviewKind);
        const session = await withWrite(validated.expectedRevision, (current) => {
          const index = current.decisions.findIndex((item) => item.catalogSenseId === subject.catalogSenseId);
          assert(index >= 0, 'Review decision is missing.', 409);
          current.decisions[index] = validated.decision;
          current.attestation = '';
          current.reviewedAt = '';
          return current;
        });
        sendJson(response, 200, session);
        return;
      }
      if (url.pathname === '/api/finalize') {
        if (request.method !== 'POST') return rejectUnsupportedMethod(request, response, 'POST');
        const input = await readRequestJson(request);
        assertOnlyKeys(input, ['attestation', 'expectedRevision'], 'Finalization payload');
        assert(nonEmptyString(input.expectedRevision) && /^[a-f0-9]{64}$/u.test(input.expectedRevision), 'Finalization payload requires a valid expectedRevision.');
        assert(nonEmptyString(input.attestation) && input.attestation.trim().length <= MAX_ATTESTATION_LENGTH, `Finalization requires a reviewer-entered attestation of at most ${MAX_ATTESTATION_LENGTH} characters.`);
        const session = await withWrite(input.expectedRevision, (current) => {
          assert(current.decisions.every((decision) => decision.decision !== 'pending'), 'Finalization requires a decision for every subject.');
          current.attestation = input.attestation.trim();
          current.reviewedAt = new Date().toISOString();
          validateReview(current, data.candidates, current.reviewKind, {
            lexicalEvidence: data.evidence,
            sourceManifest: data.sources,
          });
          return current;
        });
        sendJson(response, 200, session);
        return;
      }

      const staticFiles = new Map([
        ['/', ['index.html', 'text/html; charset=utf-8']],
        ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
        ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
      ]);
      if (staticFiles.has(url.pathname)) {
        if (request.method !== 'GET') return rejectUnsupportedMethod(request, response, 'GET');
        const [file, contentType] = staticFiles.get(url.pathname);
        send(response, 200, await readFile(resolve(STATIC_ROOT, file)), contentType);
        return;
      }
      sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 400;
      sendJson(response, status, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  return { server, reviewPath, reviewKind: review.reviewKind, reviewerId: review.reviewerId };
}

async function runCli() {
  const options = parseArguments(process.argv.slice(2));
  const running = await startSpanishA1ReviewServer(options);
  const address = running.server.address();
  console.log(`Spanish A1 ${running.reviewKind} review: http://127.0.0.1:${address.port}/`);
  console.log(`Reviewer: ${running.reviewerId}; package: ${relative(ROOT, running.reviewPath)}`);
  const close = () => running.server.close(() => process.exit(0));
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === resolve(import.meta.filename)) {
  runCli().catch((error) => {
    console.error(`Spanish A1 review server error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
