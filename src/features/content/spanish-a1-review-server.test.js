/* global __dirname, afterAll, afterEach, beforeAll, beforeEach, describe, expect, it */

const { spawn, spawnSync } = require('node:child_process');
const { Buffer } = require('node:buffer');
const { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } = require('node:fs');
const http = require('node:http');
const { join, resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const root = resolve(__dirname, '../../..');
const serverScript = resolve(root, 'scripts/spanish-a1-review-server.mjs');
const pipelineScript = resolve(root, 'scripts/spanish-a1-pipeline.mjs');
const clientScript = resolve(root, 'scripts/spanish-a1-review/app.js');
const fixtureRoot = resolve(root, `.artifacts/spanish-a1-review-server-test-${process.pid}`);
const baseRoot = resolve(fixtureRoot, 'base');
const liveRoot = resolve(fixtureRoot, 'live');
const sourcesPath = resolve(root, 'assets/catalog/spanish/a1-source-manifest.json');
const candidatesPath = resolve(root, 'assets/catalog/spanish/a1-candidates.json');
const evidencePath = resolve(root, 'assets/catalog/spanish/a1-lexical-evidence.json');
const fixtureEvidencePath = resolve(baseRoot, 'evidence.json');

async function reviewClient(initialSession, onRequest) {
  class Element {
    constructor(tagName = 'div') {
      this.tagName = tagName;
      this.children = [];
      this.listeners = {};
      this.style = {};
      this.dataset = {};
      this.value = '';
      this.disabled = false;
    }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return [this.text ?? '', ...this.children.map((child) => child.textContent)].join(''); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute(name, value) { this[name] = value; }
    focus() {}
    async dispatch(name) { return this.listeners[name]?.({ target: this }); }
  }
  const html = readFileSync(resolve(root, 'scripts/spanish-a1-review/index.html'), 'utf8');
  const elements = Object.fromEntries([...html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/gu)]
    .map(([, tag, id]) => [id, Object.assign(new Element(tag), { id })]));
  elements['status-filter'].value = 'all';
  elements['category-filter'].value = 'all';
  const buttons = ['approved', 'changes-requested', 'rejected'].map((decision) => {
    const button = new Element('button');
    button.dataset.decision = decision;
    return button;
  });
  const created = [];
  const windowEvents = {};
  const requests = [];
  await runInNewContext(readFileSync(clientScript, 'utf8'), {
    document: {
      querySelectorAll(selector) {
        if (selector === '[id]') return Object.values(elements);
        if (selector === '[data-decision]') return buttons;
        return [...Object.values(elements), ...buttons, ...created].filter((element) => ['input', 'textarea', 'select', 'button'].includes(element.tagName));
      },
      createElement(tag) { const element = new Element(tag); created.push(element); return element; },
      addEventListener() {},
    },
    window: { addEventListener(name, callback) { windowEvents[name] = callback; } },
    async fetch(path, options) {
      if (path === '/api/session') return { ok: true, json: async () => initialSession };
      const body = JSON.parse(options.body);
      requests.push({ path, body });
      return onRequest(path, body);
    },
  });
  return { elements, buttons, created, requests, windowEvents };
}

function clientSession(reviewKind = 'slovak') {
  return {
    reviewKind, level: 'A1', reviewerId: 'test-reviewer', qualification: 'Test fixture',
    reviewedAt: '', attestation: '', revision: 'original-revision',
    subjects: [0, 1].map((index) => ({
      entryId: `entry-${index}`, catalogSenseId: `catalog-${index}`, term: `Term ${index}`,
      definition: 'Wordfold definition', example: 'Wordfold example', translation: 'Slovak hint',
      displayPartOfSpeech: 'noun', pcicClassification: { id: 1, label: 'Identity' },
      gender: 'feminine', alternativeForms: [{ form: 'test-form', type: 'plural' }],
    })),
    decisions: [0, 1].map((index) => ({
      entryId: `entry-${index}`, catalogSenseId: `catalog-${index}`, decision: 'approved', notes: '',
    })),
  };
}

function decisionResponse(session, input) {
  const next = JSON.parse(JSON.stringify(session));
  next.revision = `${session.revision}-saved`;
  const index = next.decisions.findIndex((decision) => decision.entryId === input.entryId);
  const { expectedRevision, ...decision } = input;
  next.decisions[index] = decision;
  return { ok: true, json: async () => next };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function configureReviewer(path, reviewerId, qualification) {
  const review = JSON.parse(readFileSync(path, 'utf8'));
  review.reviewerId = reviewerId;
  review.qualification = qualification;
  writeJson(path, review);
}

function prepareFixtures() {
  rmSync(fixtureRoot, { recursive: true, force: true });
  mkdirSync(baseRoot, { recursive: true });
  const spanish = resolve(baseRoot, 'spanish.json');
  const slovak = resolve(baseRoot, 'slovak.json');
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const originalSource = JSON.parse(readFileSync(sourcesPath, 'utf8')).sources.find((source) => source.id === 'wordfold-original-spanish-a1');
  // Keep the documented exception branch covered even when the real catalog has complete OMW coverage.
  const removedMatch = evidence.entries[0].candidateSenses.length > 0;
  Object.assign(evidence.entries[0], {
    sourceId: originalSource.id, sourceVersion: originalSource.version,
    candidateSenses: [], selectedSenseId: null, requiresSpanishSenseSelection: false,
    exceptionRationale: 'Deliberate test fixture without an offered OMW source sense.',
  });
  if (removedMatch) evidence.coverage.exactLemmaAndPosMatches -= 1;
  evidence.coverage.exactLemmaAndPosRatio = evidence.coverage.exactLemmaAndPosMatches / evidence.entries.length;
  writeJson(fixtureEvidencePath, evidence);
  const prepared = spawnSync(process.execPath, [
    pipelineScript, 'prepare-reviews',
    '--sources', sourcesPath,
    '--candidates', candidatesPath,
    '--evidence', fixtureEvidencePath,
    '--spanish-output', spanish,
    '--slovak-output', slovak,
  ], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (prepared.status !== 0) throw new Error(prepared.stderr);
  configureReviewer(spanish, 'annamariea-es', 'native Spanish speaker');
  configureReviewer(slovak, 'jozef-sk', 'native Slovak speaker');
}

function resetReview(kind) {
  mkdirSync(liveRoot, { recursive: true });
  const path = resolve(liveRoot, `${kind}.json`);
  copyFileSync(resolve(baseRoot, `${kind}.json`), path);
  return path;
}

function request(port, path, options = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const body = options.rawBody != null
      ? Buffer.from(options.rawBody)
      : options.body == null ? null : Buffer.from(JSON.stringify(options.body));
    const clientRequest = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method ?? 'GET',
      headers: {
        ...(body ? {
          'Content-Type': options.contentType ?? 'application/json',
          'Content-Length': body.length,
        } : {}),
        ...(options.headers ?? {}),
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolveRequest({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    clientRequest.on('error', rejectRequest);
    if (body) clientRequest.write(body);
    clientRequest.end();
  });
}

function startServer(reviewPath) {
  return new Promise((resolveServer, rejectServer) => {
    const child = spawn(process.execPath, [serverScript, '--review', reviewPath, '--evidence', fixtureEvidencePath, '--port', '0'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      rejectServer(new Error(`Spanish A1 review server did not start. stdout=${stdout} stderr=${stderr}`));
    }, 10_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const match = /Spanish A1 (?:spanish|slovak) review: http:\/\/127\.0\.0\.1:(\d+)\//u.exec(stdout);
      if (match) {
        clearTimeout(timeout);
        resolveServer({ child, port: Number(match[1]) });
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      rejectServer(new Error(`Spanish A1 review server exited with ${code}. stdout=${stdout} stderr=${stderr}`));
    });
  });
}

function sessionPayload(response) {
  return JSON.parse(response.body.toString('utf8'));
}

function decisionPayload(session, index, changes = {}) {
  const subject = session.subjects[index];
  const decision = session.decisions[index];
  return {
    entryId: subject.entryId,
    catalogSenseId: subject.catalogSenseId,
    decision: decision.decision,
    notes: decision.notes,
    ...(session.reviewKind === 'spanish' ? {
      selectedSenseId: decision.selectedSenseId,
      originalEditorialExceptionApproved: decision.originalEditorialExceptionApproved,
    } : {}),
    expectedRevision: session.revision,
    ...changes,
  };
}

function sensesFor(subject) {
  if (subject.lexicalEvidence?.type === 'omw') return [subject.lexicalEvidence];
  return subject.lexicalEvidence?.candidateSenses ?? [];
}

describe('Spanish A1 independent review server', () => {
  let runningServer;
  let secondServer;

  beforeAll(prepareFixtures);
  beforeEach(() => { mkdirSync(liveRoot, { recursive: true }); });

  afterEach(async () => {
    if (runningServer?.child && runningServer.child.exitCode == null) {
      await new Promise((resolveExit) => {
        runningServer.child.once('exit', resolveExit);
        runningServer.child.kill('SIGTERM');
      });
    }
    runningServer = null;
    if (secondServer?.child && secondServer.child.exitCode == null) {
      await new Promise((resolveExit) => {
        secondServer.child.once('exit', resolveExit);
        secondServer.child.kill('SIGTERM');
      });
    }
    secondServer = null;
    rmSync(liveRoot, { recursive: true, force: true });
  });

  afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  it('serves one isolated, loopback-only review package and its accessible client', async () => {
    runningServer = await startServer(resetReview('spanish'));

    const page = await request(runningServer.port, '/');
    const client = await request(runningServer.port, '/app.js');
    const result = await request(runningServer.port, '/api/session');
    const traversal = await request(runningServer.port, '/api/../slovak-review.json');
    const unsupported = await request(runningServer.port, '/api/session', { method: 'POST' });
    const crossOrigin = await request(runningServer.port, '/api/session', {
      headers: { Origin: 'https://example.com' },
    });
    const session = sessionPayload(result);

    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toContain("default-src 'self'");
    expect(page.body.toString()).toContain('Search');
    expect(client.body.toString()).toContain('status-filter');
    expect(session).toEqual(expect.objectContaining({
      reviewKind: 'spanish',
      reviewerId: 'annamariea-es',
      qualification: 'native Spanish speaker',
      revision: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(session.subjects).toHaveLength(500);
    expect(session.semanticSource.licenseText).toContain('Princeton');
    expect(session.lexicalSource.license).toBe('CC BY 3.0');
    for (const subject of session.subjects) {
      const senses = sensesFor(subject);
      expect(new Set(senses.map((sense) => sense.synsetId)).size).toBe(senses.length);
      for (const sense of senses) {
        expect(sense.semanticReference.english.definition.trim()).not.toBe('');
        expect(sense.semanticReference.english.members.length).toBeGreaterThan(0);
        expect(sense.semanticReference.sourceSenseAliases[0].senseId).toBe(sense.senseId);
      }
    }
    expect(result.body.toString()).not.toContain('jozef-sk');
    expect(result.body.toString()).not.toMatch(/"translation"/u);
    expect(traversal.status).toBe(404);
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.allow).toBe('GET');
    expect(crossOrigin.status).toBe(403);
  });

  it('validates Spanish decisions and rejects stale concurrent writes', async () => {
    const reviewPath = resetReview('spanish');
    runningServer = await startServer(reviewPath);
    const session = sessionPayload(await request(runningServer.port, '/api/session'));
    const index = session.subjects.findIndex((subject) => sensesFor(subject).length > 0);
    const senseId = sensesFor(session.subjects[index])[0].senseId;

    const missingSense = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      body: decisionPayload(session, index, { decision: 'approved' }),
    });
    const missingNote = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      body: decisionPayload(session, index, { decision: 'changes-requested', notes: '' }),
    });
    const saved = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      body: decisionPayload(session, index, { decision: 'approved', selectedSenseId: senseId }),
    });
    const stale = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      body: decisionPayload(session, index, { decision: 'approved', selectedSenseId: senseId }),
    });
    const oversized = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      rawBody: JSON.stringify({ notes: 'x'.repeat(20_000) }),
    });
    const wrongContentType = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      rawBody: '{}',
      contentType: 'text/plain',
    });
    const stored = JSON.parse(readFileSync(reviewPath, 'utf8'));

    expect(missingSense.status).toBe(400);
    expect(missingNote.status).toBe(400);
    expect(saved.status).toBe(200);
    expect(sessionPayload(saved).decisions[index]).toEqual(expect.objectContaining({
      decision: 'approved',
      selectedSenseId: senseId,
      originalEditorialExceptionApproved: false,
    }));
    expect(stale.status).toBe(409);
    expect(oversized.status).toBe(413);
    expect(wrongContentType.status).toBe(415);
    expect(stored.decisions[index].selectedSenseId).toBe(senseId);
    expect(statSync(reviewPath).mode & 0o777).toBe(0o600);
  });

  it('requires the documented exception path only when Spanish evidence offers no sense', async () => {
    runningServer = await startServer(resetReview('spanish'));
    const session = sessionPayload(await request(runningServer.port, '/api/session'));
    const index = session.subjects.findIndex((subject) => sensesFor(subject).length === 0);

    expect(index).toBeGreaterThanOrEqual(0);
    const missingException = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      body: decisionPayload(session, index, { decision: 'approved' }),
    });
    const saved = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      body: decisionPayload(session, index, {
        decision: 'approved',
        originalEditorialExceptionApproved: true,
      }),
    });

    expect(missingException.status).toBe(400);
    expect(saved.status).toBe(200);
    expect(sessionPayload(saved).decisions[index].originalEditorialExceptionApproved).toBe(true);
  });

  it('keeps Slovak sessions free of Spanish evidence and Spanish-only mutation fields', async () => {
    runningServer = await startServer(resetReview('slovak'));
    const response = await request(runningServer.port, '/api/session');
    const session = sessionPayload(response);
    const invalid = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      body: { ...decisionPayload(session, 0, { decision: 'approved' }), selectedSenseId: 'hidden' },
    });
    const saved = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      body: decisionPayload(session, 0, { decision: 'approved' }),
    });

    expect(session.reviewKind).toBe('slovak');
    expect(session.subjects[0]).toHaveProperty('translation');
    expect(response.body.toString()).not.toContain('lexicalEvidence');
    expect(response.body.toString()).not.toContain('selectedSenseId');
    expect(response.body.toString()).not.toContain('semanticReference');
    expect(response.body.toString()).not.toContain('semanticSource');
    expect(response.body.toString()).not.toContain('lexicalSource');
    expect(invalid.status).toBe(400);
    expect(saved.status).toBe(200);
  });

  it('finalizes only complete work with reviewer-entered attestation and reopens after edits', async () => {
    const reviewPath = resetReview('spanish');
    runningServer = await startServer(reviewPath);
    let session = sessionPayload(await request(runningServer.port, '/api/session'));
    const pending = await request(runningServer.port, '/api/finalize', {
      method: 'POST',
      body: { expectedRevision: session.revision, attestation: 'I reviewed this work myself.' },
    });

    const complete = JSON.parse(readFileSync(reviewPath, 'utf8'));
    complete.decisions = complete.decisions.map((decision, index) => {
      const senses = sensesFor(complete.subjects[index]);
      return {
        ...decision,
        decision: 'approved',
        selectedSenseId: senses[0]?.senseId ?? null,
        originalEditorialExceptionApproved: senses.length === 0,
      };
    });
    writeJson(reviewPath, complete);
    session = sessionPayload(await request(runningServer.port, '/api/session'));
    const emptyAttestation = await request(runningServer.port, '/api/finalize', {
      method: 'POST',
      body: { expectedRevision: session.revision, attestation: '  ' },
    });
    const finalized = await request(runningServer.port, '/api/finalize', {
      method: 'POST',
      body: { expectedRevision: session.revision, attestation: 'I independently reviewed every Spanish candidate.' },
    });
    const finalSession = sessionPayload(finalized);
    const reopened = await request(runningServer.port, '/api/decision', {
      method: 'PUT',
      body: decisionPayload(finalSession, 0),
    });

    expect(pending.status).toBe(400);
    expect(emptyAttestation.status).toBe(400);
    expect(finalized.status).toBe(200);
    expect(finalSession.attestation).toBe('I independently reviewed every Spanish candidate.');
    expect(Number.isNaN(Date.parse(finalSession.reviewedAt))).toBe(false);
    expect(sessionPayload(reopened)).toEqual(expect.objectContaining({ attestation: '', reviewedAt: '' }));
  });

  it('rejects review paths outside artifacts and tampered subject packages before listening', () => {
    const outsidePath = join(root, `spanish-review-outside-${process.pid}.json`);
    writeFileSync(outsidePath, '{}');
    const outside = spawnSync(process.execPath, [serverScript, '--review', outsidePath, '--port', '0'], {
      cwd: root,
      encoding: 'utf8',
    });
    rmSync(outsidePath, { force: true });

    const tamperedPath = resetReview('spanish');
    const tampered = JSON.parse(readFileSync(tamperedPath, 'utf8'));
    tampered.subjects[0].definition = 'Tampered definition';
    writeJson(tamperedPath, tampered);
    const invalid = spawnSync(process.execPath, [serverScript, '--review', tamperedPath, '--evidence', fixtureEvidencePath, '--port', '0'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });

    expect(outside.status).toBe(1);
    expect(outside.stderr).toContain('beneath .artifacts');
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('subjects do not match');
  });

  it('rejects edited source descriptions before accepting a review session', () => {
    const reviewPath = resetReview('spanish');
    const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
    const subject = review.subjects.find((item) => sensesFor(item).length > 0);
    sensesFor(subject)[0].semanticReference.english.definition = 'Changed reference meaning';
    writeJson(reviewPath, review);
    const invalid = spawnSync(process.execPath, [serverScript, '--review', reviewPath, '--evidence', fixtureEvidencePath, '--port', '0'], {
      cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
    });
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('subjects do not match');
  });

  it('allows only one cross-process writer to commit a shared base revision', async () => {
    const reviewPath = resetReview('slovak');
    runningServer = await startServer(reviewPath);
    secondServer = await startServer(reviewPath);
    const firstSession = sessionPayload(await request(runningServer.port, '/api/session'));
    const secondSession = sessionPayload(await request(secondServer.port, '/api/session'));

    expect(secondSession.revision).toBe(firstSession.revision);
    const results = await Promise.all([
      request(runningServer.port, '/api/decision', {
        method: 'PUT',
        body: decisionPayload(firstSession, 0, { decision: 'approved' }),
      }),
      request(secondServer.port, '/api/decision', {
        method: 'PUT',
        body: decisionPayload(secondSession, 0, { decision: 'changes-requested', notes: 'Use a more specific Slovak hint.' }),
      }),
    ]);
    const winner = results.find((result) => result.status === 200);
    const conflict = results.find((result) => result.status === 409);
    const stored = JSON.parse(readFileSync(reviewPath, 'utf8'));

    expect(winner).toBeDefined();
    expect(conflict).toBeDefined();
    expect(stored.decisions[0]).toEqual(sessionPayload(winner).decisions[0]);
    expect(existsSync(`${reviewPath}.lock`)).toBe(false);
    expect(existsSync(`${resolve(baseRoot, 'slovak.json')}.lock`)).toBe(false);
  });
});

describe('Spanish A1 review browser behavior', () => {
  it('renders source descriptions as text and submits the canonical offered sense', async () => {
    const session = clientSession('spanish');
    session.semanticSource = { attribution: 'Princeton WordNet 3.0', license: 'WordNet 3.0 license', licenseText: 'Full license fixture\nPrinceton' };
    session.lexicalSource = { attribution: 'MCR Spanish source', license: 'CC BY 3.0' };
    const sense = {
      senseId: 'canonical-sense', synsetId: 'spanish-synset',
      semanticReference: {
        iliId: 'ili-1', spanishSynsetId: 'spanish-synset', englishSynsetId: 'english-synset',
        spanish: { definition: '<img src=x onerror=alert(1)>', examples: ['Ejemplo español.'] },
        english: { definition: 'English meaning', members: ['member one', 'member two'], examples: ['English example.'] },
        sourceSenseAliases: [{ senseId: 'canonical-sense' }, { senseId: 'duplicate-alias' }],
      },
    };
    session.subjects[0].lexicalEvidence = { candidateSenses: [sense] };
    const client = await reviewClient(session, async (_, input) => decisionResponse(session, input));
    const copy = client.elements['sense-options'].textContent;

    expect(copy).toContain('<img src=x onerror=alert(1)>');
    expect(copy).toContain('Spanish · Open Multilingual Wordnet 2.0');
    expect(copy).toContain('English · Princeton WordNet 3.0 via OMW 2.0');
    expect(copy).toContain('English meaning');
    expect(copy).toContain('member one, member two');
    expect(copy).toContain('English example.');
    expect(copy).toContain('Ejemplo español.');
    expect(copy).toContain('ILI ili-1');
    expect(client.created.some((element) => element.tagName === 'img')).toBe(false);
    const radios = client.created.filter((element) => element.type === 'radio');
    expect(radios).toHaveLength(1);
    await radios[0].dispatch('change');
    await client.elements.save.dispatch('click');
    expect(client.requests[0].body.selectedSenseId).toBe('canonical-sense');
    expect(client.elements.gender.textContent).toBe('feminine');
    expect(client.elements.forms.textContent).toBe('test-form (plural)');
    expect(client.elements['source-license'].hidden).toBe(false);
    expect(client.elements['source-license-text'].textContent).toBe(session.semanticSource.licenseText);
    expect(client.elements['source-attribution'].textContent).toContain('MCR Spanish source (CC BY 3.0)');
  });

  it('keeps Slovak UI independent and preserves newer edits during an outstanding save', async () => {
    const session = clientSession();
    let release;
    const client = await reviewClient(session, (_, input) => new Promise((resolveResponse) => {
      release = () => resolveResponse(decisionResponse(session, input));
    }));
    expect(client.elements['sense-panel'].hidden).toBe(true);
    expect(client.elements['sense-options'].textContent).toBe('');
    client.elements.notes.value = 'First edit';
    await client.elements.notes.dispatch('input');
    const saving = client.elements.save.dispatch('click');
    client.elements.notes.value = 'Newer edit';
    await client.elements.notes.dispatch('input');
    release();
    await saving;
    expect(client.elements.notes.value).toBe('Newer edit');
    expect(client.elements['save-status'].textContent).toContain('still unsaved');
    const event = { preventDefault() { this.prevented = true; } };
    client.windowEvents.beforeunload(event);
    expect(event.prevented).toBe(true);
    const navigating = client.elements.next.dispatch('click');
    expect(client.requests[1].body.notes).toBe('Newer edit');
    expect(client.requests[1].body.expectedRevision).toBe('original-revision-saved');
    release();
    await navigating;
    expect(client.elements.term.textContent).toBe('Term 1');
  });

  it('blocks navigation, filtering, and finalization when dirty input cannot be saved', async () => {
    const client = await reviewClient(clientSession(), async () => ({ ok: false, json: async () => ({ error: 'Review changed elsewhere.' }) }));
    client.elements.notes.value = 'Unsaved review';
    await client.elements.notes.dispatch('input');
    await client.elements.next.dispatch('click');
    expect(client.elements.term.textContent).toBe('Term 0');
    client.elements.search.value = 'Term 1';
    await client.elements.search.dispatch('input');
    expect(client.elements.search.value).toBe('');
    expect(client.elements.term.textContent).toBe('Term 0');
    await client.elements['next-pending'].dispatch('click');
    expect(client.elements['status-filter'].value).toBe('all');
    client.elements.attestation.value = 'My own review';
    client.elements['attestation-confirmed'].checked = true;
    await client.elements.finalize.dispatch('click');
    expect(client.requests.every(({ path }) => path === '/api/decision')).toBe(true);
    expect(client.elements.notes.value).toBe('Unsaved review');
  });

  it('saves dirty input before finalization and protects input while finalizing', async () => {
    const session = clientSession();
    let release;
    const client = await reviewClient(session, async (path, input) => {
      if (path === '/api/decision') {
        client.elements.attestation.value = 'Updated while saving';
        return decisionResponse(session, input);
      }
      return new Promise((resolveResponse) => {
        release = () => resolveResponse({ ok: true, json: async () => ({
          ...session, reviewedAt: '2026-09-05T12:00:00Z', attestation: input.attestation,
        }) });
      });
    });
    client.elements.notes.value = 'Final correction';
    await client.elements.notes.dispatch('input');
    client.elements.attestation.value = 'My own review';
    client.elements['attestation-confirmed'].checked = true;
    const finalizing = client.elements.finalize.dispatch('click');
    for (let tick = 0; tick < 20 && !release; tick += 1) await Promise.resolve();
    expect(release).toBeDefined();
    expect(client.requests.map(({ path }) => path)).toEqual(['/api/decision', '/api/finalize']);
    expect(client.requests[0].body.notes).toBe('Final correction');
    expect(client.requests[1].body.expectedRevision).toBe('original-revision-saved');
    expect(client.requests[1].body.attestation).toBe('Updated while saving');
    expect(client.elements.notes.disabled).toBe(true);
    release();
    await finalizing;
    expect(client.elements.notes.disabled).toBe(false);
    expect(client.elements['save-status'].textContent).toContain('Finalized');
  });

});
