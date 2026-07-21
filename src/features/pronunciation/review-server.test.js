/* global __dirname, afterEach, beforeEach, describe, expect, it */

const { Buffer } = require('node:buffer');
const { spawn, spawnSync } = require('node:child_process');
const { mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const http = require('node:http');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const serverScript = resolve(root, 'scripts/pronunciation-review-server.mjs');
const fixtureRoot = resolve(root, `.artifacts/pronunciation-review-test-${process.pid}`);
const ratingsPath = resolve(fixtureRoot, 'ratings.json');
const blindIds = ['aaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbb'];

function createFixture() {
  mkdirSync(resolve(fixtureRoot, 'audio'), { recursive: true });
  const samples = blindIds.map((blindId, index) => ({
    blindId,
    locale: index === 0 ? 'en-US' : 'sk-SK',
    category: 'common_word',
    text: index === 0 ? 'hello' : 'ahoj',
    context: index === 0 ? 'A greeting.' : 'Pozdrav.',
    audioFile: `audio/${blindId}.mp3`,
  }));
  writeFileSync(resolve(fixtureRoot, 'reviewer-manifest.json'), JSON.stringify({ schemaVersion: 1, samples }));
  for (const blindId of blindIds) {
    writeFileSync(resolve(fixtureRoot, `audio/${blindId}.mp3`), Buffer.concat([
      Buffer.from('ID3'),
      Buffer.alloc(256, 1),
    ]));
  }
}

function request(port, path, options = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const body = options.body ? Buffer.from(JSON.stringify(options.body)) : null;
    const clientRequest = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method ?? 'GET',
      headers: {
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {}),
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

function startServer() {
  return new Promise((resolveServer, rejectServer) => {
    const child = spawn(process.execPath, [
      serverScript,
      '--input', fixtureRoot,
      '--ratings', ratingsPath,
      '--port', '0',
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      rejectServer(new Error(`Review server did not start. stdout=${stdout} stderr=${stderr}`));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const match = /Pronunciation review: http:\/\/127\.0\.0\.1:(\d+)\//.exec(stdout);
      if (match) {
        clearTimeout(timeout);
        resolveServer({ child, port: Number(match[1]) });
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      rejectServer(new Error(`Review server exited with ${code}. stdout=${stdout} stderr=${stderr}`));
    });
  });
}

describe('pronunciation review server', () => {
  let runningServer;

  beforeEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
    createFixture();
  });

  afterEach(async () => {
    if (runningServer?.child && runningServer.child.exitCode == null) {
      await new Promise((resolveExit) => {
        runningServer.child.once('exit', resolveExit);
        runningServer.child.kill('SIGTERM');
      });
    }
    runningServer = null;
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('serves only blinded metadata and allowlisted audio', async () => {
    runningServer = await startServer();

    const page = await request(runningServer.port, '/');
    const manifest = await request(runningServer.port, '/api/manifest');
    const audio = await request(runningServer.port, `/audio/${blindIds[0]}.mp3`, {
      headers: { Range: 'bytes=0-9' },
    });
    const unknownAudio = await request(runningServer.port, '/audio/cccccccccccccccccccc.mp3');
    const traversal = await request(runningServer.port, '/audio/../../private/azure-1-key.json');

    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toContain("default-src 'self'");
    expect(JSON.parse(manifest.body)).toEqual(expect.objectContaining({
      schemaVersion: 1,
      samples: expect.arrayContaining([expect.objectContaining({ blindId: blindIds[0], text: 'hello' })]),
    }));
    expect(manifest.body.toString()).not.toMatch(/provider|voiceId|model|identity/i);
    expect(manifest.body.toString()).not.toContain('itemId');
    expect(audio.status).toBe(206);
    expect(audio.body).toHaveLength(10);
    expect(audio.headers['content-range']).toBe('bytes 0-9/259');
    expect(unknownAudio.status).toBe(404);
    expect(traversal.status).toBe(404);
  });

  it('upserts by reviewer and blind ID without exposing another reviewer', async () => {
    runningServer = await startServer();
    const firstPath = `/api/ratings/${blindIds[0]}`;

    expect((await request(runningServer.port, firstPath, {
      method: 'PUT',
      body: { reviewerId: 'reviewer-a', acceptable: true, wrongLocale: false },
    })).status).toBe(200);
    expect((await request(runningServer.port, firstPath, {
      method: 'PUT',
      body: { reviewerId: 'reviewer-a', acceptable: false, wrongLocale: false, note: 'Stress is off.' },
    })).status).toBe(200);
    expect((await request(runningServer.port, firstPath, {
      method: 'PUT',
      body: { reviewerId: 'reviewer-b', acceptable: false, wrongLocale: true },
    })).status).toBe(200);

    const reviewerA = JSON.parse((await request(runningServer.port, '/api/ratings?reviewerId=reviewer-a')).body);
    const exported = await request(runningServer.port, '/api/export?reviewerId=reviewer-a');
    const combined = JSON.parse(readFileSync(ratingsPath, 'utf8'));

    expect(reviewerA.ratings).toEqual([{
      blindId: blindIds[0],
      reviewerId: 'reviewer-a',
      acceptable: false,
      wrongLocale: false,
      note: 'Stress is off.',
    }]);
    expect(JSON.parse(exported.body).ratings).toEqual(reviewerA.ratings);
    expect(exported.headers['content-disposition']).toBe('attachment; filename="ratings-reviewer-a.json"');
    expect(combined.ratings).toHaveLength(2);
    expect(combined.ratings.map(({ reviewerId }) => reviewerId)).toEqual(['reviewer-a', 'reviewer-b']);
  });

  it('rejects inconsistent ratings and invalid reviewer IDs', async () => {
    runningServer = await startServer();

    const inconsistent = await request(runningServer.port, `/api/ratings/${blindIds[0]}`, {
      method: 'PUT',
      body: { reviewerId: 'reviewer-a', acceptable: true, wrongLocale: true },
    });
    const invalidReviewer = await request(runningServer.port, '/api/ratings?reviewerId=bad%20reviewer');
    const unknownSample = await request(runningServer.port, '/api/ratings/cccccccccccccccccccc', {
      method: 'PUT',
      body: { reviewerId: 'reviewer-a', acceptable: true, wrongLocale: false },
    });

    expect(inconsistent.status).toBe(400);
    expect(inconsistent.body.toString()).toContain('cannot also be acceptable');
    expect(invalidReviewer.status).toBe(400);
    expect(unknownSample.status).toBe(400);
  });

  it('refuses to read review input outside the artifact directory', () => {
    const result = spawnSync(process.execPath, [serverScript, '--input', resolve(root, 'assets')], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Review input must be a child of .artifacts.');
  });
});
