#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const CATALOG_PATH = resolve(ROOT, 'assets/catalog/cefr-catalog.json');
const MANIFEST_PATH = resolve(ROOT, 'assets/catalog/cefr-catalog-manifest.json');
const CHECKPOINT_PATH = resolve(ROOT, '.artifacts/pronunciation-backfill/checkpoint.json');
const ATTEMPT_JOURNAL_PATH = resolve(ROOT, '.artifacts/pronunciation-backfill/attempts.ndjson');
const SUPABASE_BIN = resolve(ROOT, 'node_modules/.bin/supabase');

export const CATALOG_SHA256 = '7a2bddcc85b7c638af7acef0209763871a8b94d37b4dbf4eee71bc458301ed8b';
export const SYNTHESIS_VERSION = 'azure-public-preview-v1';
export const LOCALES = ['en-US', 'en-GB'];
export const CONCURRENCY = 4;
export const PRICE_USD_PER_MILLION_CHARACTERS = 15;
export const HARD_COST_CEILING_USD = 2;
export const NORMAL_LIMITS = {
  userHourlyRequests: 20,
  userDailyCharacters: 1_000,
  globalDailyCharacters: 10_000,
};
export const BULK_LIMITS = {
  userHourlyRequests: 20_000,
  userDailyCharacters: 125_000,
  globalDailyCharacters: 125_000,
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeMessage(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500);
}

function parseArguments(argv) {
  const normalized = argv[0] === '--' ? argv.slice(1) : argv;
  const [command = 'help', ...tokens] = normalized;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--') continue;
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (['execute', 'json'].includes(name)) {
      options[name] = true;
      continue;
    }
    const value = tokens[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value.`);
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

function assertOptions(options, allowed) {
  const unknown = Object.keys(options).filter((name) => !allowed.includes(name));
  if (unknown.length) throw new Error(`Unsupported option: --${unknown[0]}.`);
}

function catalogEntries(payload) {
  return Array.isArray(payload) ? payload : payload?.entries;
}

export async function loadPlan(catalogPath = CATALOG_PATH, manifestPath = MANIFEST_PATH) {
  const [catalogBytes, manifestBytes] = await Promise.all([
    readFile(catalogPath),
    readFile(manifestPath),
  ]);
  const catalogHash = sha256(catalogBytes);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (catalogHash !== CATALOG_SHA256 || manifest.catalogSha256 !== CATALOG_SHA256) {
    throw new Error(`Catalog checksum mismatch; this runner is pinned to ${CATALOG_SHA256}.`);
  }
  const entries = catalogEntries(JSON.parse(catalogBytes.toString('utf8')));
  if (!Array.isArray(entries) || entries.length !== 8_300) {
    throw new Error('The pinned catalog must contain exactly 8,300 entries.');
  }
  const ids = new Set();
  let charactersPerLocale = 0;
  for (const entry of entries) {
    if (typeof entry?.catalogSenseId !== 'string' || !entry.catalogSenseId.trim()
      || ids.has(entry.catalogSenseId)) {
      throw new Error('Every catalog entry requires a unique catalogSenseId.');
    }
    if (typeof entry.term !== 'string' || entry.term !== entry.term.trim()
      || entry.term.length < 1 || entry.term.length > 200) {
      throw new Error(`${entry.catalogSenseId} has invalid pronunciation text.`);
    }
    ids.add(entry.catalogSenseId);
    charactersPerLocale += entry.term.length;
  }
  const requests = entries.length * LOCALES.length;
  const billableCharacters = charactersPerLocale * LOCALES.length;
  const estimatedCostUsd = Number((
    billableCharacters * PRICE_USD_PER_MILLION_CHARACTERS / 1_000_000
  ).toFixed(6));
  return {
    schemaVersion: 1,
    catalogSha256: catalogHash,
    synthesisVersion: SYNTHESIS_VERSION,
    locales: [...LOCALES],
    catalogEntries: entries.length,
    requests,
    charactersPerLocale,
    billableCharacters,
    priceUsdPerMillionCharacters: PRICE_USD_PER_MILLION_CHARACTERS,
    estimatedCostUsd,
    hardCostCeilingUsd: HARD_COST_CEILING_USD,
    entries,
  };
}

function publicPlan(plan) {
  const { entries: _entries, ...summary } = plan;
  return summary;
}

function planIdentity(plan) {
  return sha256(JSON.stringify({
    schemaVersion: plan.schemaVersion,
    catalogSha256: plan.catalogSha256,
    synthesisVersion: plan.synthesisVersion,
    locales: plan.locales,
    requests: plan.requests,
    billableCharacters: plan.billableCharacters,
  }));
}

function workKey(catalogSenseId, locale) {
  return `${catalogSenseId}\u0000${locale}`;
}

function checkpointPayload(plan, completedKeys) {
  return {
    schemaVersion: 1,
    planIdentity: planIdentity(plan),
    catalogSha256: plan.catalogSha256,
    synthesisVersion: plan.synthesisVersion,
    locales: [...plan.locales],
    requests: plan.requests,
    completedKeys: [...completedKeys].sort(),
    updatedAt: new Date().toISOString(),
  };
}

export function validateCheckpoint(plan, checkpoint) {
  if (checkpoint?.schemaVersion !== 1
    || checkpoint.planIdentity !== planIdentity(plan)
    || checkpoint.catalogSha256 !== plan.catalogSha256
    || checkpoint.synthesisVersion !== plan.synthesisVersion
    || JSON.stringify(checkpoint.locales) !== JSON.stringify(plan.locales)
    || checkpoint.requests !== plan.requests
    || !Array.isArray(checkpoint.completedKeys)) {
    throw new Error('Existing checkpoint does not match the pinned backfill plan.');
  }
  const possibleKeys = new Set(plan.entries.flatMap((entry) => (
    plan.locales.map((locale) => workKey(entry.catalogSenseId, locale))
  )));
  const completed = new Set(checkpoint.completedKeys);
  if (completed.size !== checkpoint.completedKeys.length
    || [...completed].some((key) => !possibleKeys.has(key))) {
    throw new Error('Existing checkpoint contains invalid or duplicate work keys.');
  }
  return completed;
}

async function readCheckpoint(plan, checkpointPath) {
  try {
    return validateCheckpoint(plan, JSON.parse(await readFile(checkpointPath, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return new Set();
    if (error instanceof SyntaxError) throw new Error('Existing checkpoint is not valid JSON.');
    throw error;
  }
}

async function writeCheckpoint(plan, checkpointPath, completedKeys) {
  await mkdir(resolve(checkpointPath, '..'), { recursive: true });
  const temporaryPath = `${checkpointPath}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(checkpointPayload(plan, completedKeys), null, 2)}\n`,
    'utf8',
  );
  await rename(temporaryPath, checkpointPath);
}

export async function executeBackfill({
  plan,
  checkpointPath,
  invoke,
  concurrency = CONCURRENCY,
  signal,
  onProgress = () => {},
}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > CONCURRENCY) {
    throw new Error(`Concurrency must be between 1 and ${CONCURRENCY}.`);
  }
  const completed = await readCheckpoint(plan, checkpointPath);
  const pending = plan.entries.flatMap((entry) => plan.locales.map((locale) => ({
    catalogSenseId: entry.catalogSenseId,
    locale,
    characters: entry.term.length,
    key: workKey(entry.catalogSenseId, locale),
  }))).filter((item) => !completed.has(item.key));
  let cursor = 0;
  let completedSinceWrite = 0;
  let fatalError;
  let activeFlush;

  const flush = async (force = false) => {
    if (activeFlush) await activeFlush;
    if (!force && completedSinceWrite < 100) return;
    const snapshot = new Set(completed);
    completedSinceWrite = 0;
    activeFlush = writeCheckpoint(plan, checkpointPath, snapshot);
    try {
      await activeFlush;
    } finally {
      activeFlush = undefined;
    }
  };

  const worker = async () => {
    while (!fatalError && !signal?.aborted) {
      const item = pending[cursor];
      cursor += 1;
      if (!item) return;
      try {
        await invoke(item);
        completed.add(item.key);
        completedSinceWrite += 1;
        onProgress(completed.size, plan.requests);
        if (completedSinceWrite >= 100) await flush();
      } catch (error) {
        fatalError = error;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    await flush(true);
  }
  if (fatalError) throw fatalError;
  if (signal?.aborted) throw new Error('Backfill interrupted; progress was checkpointed.');
  if (completed.size !== plan.requests) {
    throw new Error(`Backfill stopped after ${completed.size} of ${plan.requests} ready assets.`);
  }
  return { completed: completed.size, checkpointPath };
}

export async function createAttemptBudget(plan, journalPath, maxCostUsd) {
  const maximumCharacters = Math.floor(
    maxCostUsd * 1_000_000 / PRICE_USD_PER_MILLION_CHARACTERS,
  );
  const characterByKey = new Map(plan.entries.flatMap((entry) => plan.locales.map((locale) => [
    workKey(entry.catalogSenseId, locale),
    entry.term.length,
  ])));
  const header = {
    schemaVersion: 1,
    type: 'header',
    planIdentity: planIdentity(plan),
    maximumCharacters,
  };
  let journalText;
  try {
    journalText = await readFile(journalPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(resolve(journalPath, '..'), { recursive: true });
    const temporaryPath = `${journalPath}.${process.pid}.tmp`;
    journalText = `${JSON.stringify(header)}\n`;
    await writeFile(temporaryPath, journalText, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, journalPath);
  }
  const lines = journalText.trimEnd().split('\n');
  let existingHeader;
  try {
    existingHeader = JSON.parse(lines[0]);
  } catch {
    throw new Error('Attempt journal header is invalid.');
  }
  if (JSON.stringify(existingHeader) !== JSON.stringify(header)) {
    throw new Error('Attempt journal does not match the pinned plan and cost ceiling.');
  }
  let attemptedCharacters = 0;
  for (const line of lines.slice(1)) {
    let attempt;
    try {
      attempt = JSON.parse(line);
    } catch {
      throw new Error('Attempt journal contains invalid JSON.');
    }
    if (attempt?.type !== 'attempt'
      || characterByKey.get(attempt.key) !== attempt.characters) {
      throw new Error('Attempt journal contains invalid work.');
    }
    attemptedCharacters += attempt.characters;
  }
  if (attemptedCharacters > maximumCharacters) {
    throw new Error('Attempt journal already exceeds the approved cost ceiling.');
  }
  const handle = await open(journalPath, 'a');
  let writeChain = Promise.resolve();
  return {
    get attemptedCharacters() { return attemptedCharacters; },
    maximumCharacters,
    async record(item) {
      const operation = writeChain.then(async () => {
        const characters = characterByKey.get(item.key);
        if (characters !== item.characters) throw new Error('Cannot budget unknown backfill work.');
        if (attemptedCharacters + characters > maximumCharacters) {
          throw new Error(
            `The durable $${maxCostUsd} attempt ceiling has been reached; no request was sent.`,
          );
        }
        await handle.write(`${JSON.stringify({
          type: 'attempt', key: item.key, characters,
        })}\n`);
        await handle.sync();
        attemptedCharacters += characters;
      });
      writeChain = operation;
      return operation;
    },
    async close() {
      try {
        await writeChain.catch(() => {});
      } finally {
        await handle.close();
      }
    },
  };
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function loadPublicSupabaseConfiguration() {
  let fileValues = {};
  for (const filename of ['.env', '.env.local']) {
    try {
      fileValues = { ...fileValues, ...parseEnv(await readFile(resolve(ROOT, filename), 'utf8')) };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL
    ?? fileValues.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? fileValues.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is missing or invalid.');
  }
  if (parsedUrl.protocol !== 'https:' || !publishableKey?.trim()) {
    throw new Error('Public Supabase URL/key configuration is missing or invalid.');
  }
  return { url: parsedUrl.origin, publishableKey: publishableKey.trim() };
}

async function promptLine(label) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error('The paid backfill must be started from an interactive terminal.');
  }
  const input = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  try {
    return (await input.question(label)).trim();
  } finally {
    input.close();
  }
}

async function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode || !process.stderr.isTTY) {
    throw new Error('The paid backfill must be started from an interactive terminal.');
  }
  process.stderr.write(label);
  const previousRawMode = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolvePromise, rejectPromise) => {
    let value = '';
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(Boolean(previousRawMode));
      process.stdin.pause();
      process.stderr.write('\n');
    };
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\r' || character === '\n') {
          cleanup();
          resolvePromise(value);
          return;
        }
        if (character === '\u0003') {
          cleanup();
          rejectPromise(new Error('Authentication cancelled.'));
          return;
        }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function authenticate(configuration) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(configuration.url, configuration.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const email = await promptLine('Supabase account email: ');
  let password = await promptHidden('Supabase account password (hidden): ');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  password = '';
  if (error || !data.session) throw new Error(`Supabase authentication failed: ${safeMessage(error)}`);
  let session = data.session;
  let refreshPromise;
  const accessToken = async (forceRefresh = false) => {
    if (forceRefresh || !session.expires_at || session.expires_at * 1000 - Date.now() < 120_000) {
      refreshPromise ??= supabase.auth.refreshSession({ refresh_token: session.refresh_token })
        .then(({ data: refreshed, error: refreshError }) => {
          if (refreshError || !refreshed.session) {
            throw new Error(`Supabase session refresh failed: ${safeMessage(refreshError)}`);
          }
          session = refreshed.session;
        })
        .finally(() => { refreshPromise = undefined; });
      await refreshPromise;
    }
    return session.access_token;
  };
  return { accessToken };
}

function delay(milliseconds, signal) {
  return new Promise((resolvePromise, rejectPromise) => {
    if (signal?.aborted) return rejectPromise(new Error('Backfill interrupted.'));
    const timeout = setTimeout(resolvePromise, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      rejectPromise(new Error('Backfill interrupted.'));
    }, { once: true });
  });
}

function safeResponseCode(body) {
  const code = body?.error?.code;
  return typeof code === 'string' && /^[a-z0-9_]{1,80}$/.test(code) ? code : 'unknown_error';
}

function createInvoker(configuration, authentication, attemptBudget, signal) {
  const endpoint = `${configuration.url}/functions/v1/pronunciation-public`;
  return async (item) => {
    let transientAttempts = 0;
    let pendingAttempts = 0;
    let refreshedAfterUnauthorized = false;
    while (true) {
      if (signal.aborted) throw new Error('Backfill interrupted.');
      await attemptBudget.record(item);
      let response;
      try {
        const accessToken = await authentication.accessToken(false);
        const timeoutSignal = AbortSignal.timeout(45_000);
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            apikey: configuration.publishableKey,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            catalogSenseId: item.catalogSenseId,
            locale: item.locale,
          }),
          signal: AbortSignal.any([signal, timeoutSignal]),
        });
      } catch (error) {
        if (signal.aborted) throw new Error('Backfill interrupted.');
        transientAttempts += 1;
        if (transientAttempts > 5) throw new Error(`Function network retry limit reached: ${safeMessage(error)}`);
        await delay(2 ** (transientAttempts - 1) * 1_000, signal);
        continue;
      }

      let body = {};
      try { body = await response.json(); } catch { /* Safe status handling below. */ }
      if (response.status === 200
        && body?.status === 'ready'
        && body.asset?.locale === item.locale
        && body.asset?.synthesisVersion === SYNTHESIS_VERSION
        && typeof body.asset?.sha256 === 'string'
        && body.asset.sha256.length === 64) {
        return;
      }
      if (response.status === 202 && body?.status === 'pending') {
        pendingAttempts += 1;
        if (pendingAttempts > 75) throw new Error('Pending pronunciation retry limit reached.');
        const retryAfter = Number(response.headers.get('retry-after'));
        await delay(Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter, 1), 5) * 1_000 : 2_000, signal);
        continue;
      }
      if (response.status === 401 && !refreshedAfterUnauthorized) {
        refreshedAfterUnauthorized = true;
        await authentication.accessToken(true);
        continue;
      }
      if ([408, 425, 500, 502, 503, 504].includes(response.status)) {
        transientAttempts += 1;
        if (transientAttempts <= 5) {
          await delay(2 ** (transientAttempts - 1) * 1_000, signal);
          continue;
        }
      }
      throw new Error(`Pronunciation function failed with HTTP ${response.status} (${safeResponseCode(body)}).`);
    }
  };
}

function limitArguments(limits) {
  return [
    `PRONUNCIATION_USER_HOURLY_REQUEST_LIMIT=${limits.userHourlyRequests}`,
    `PRONUNCIATION_USER_DAILY_CHARACTER_LIMIT=${limits.userDailyCharacters}`,
    `PRONUNCIATION_GLOBAL_DAILY_CHARACTER_LIMIT=${limits.globalDailyCharacters}`,
  ];
}

async function setRemoteLimits(limits) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(SUPABASE_BIN, ['secrets', 'set', ...limitArguments(limits)], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Supabase limit update failed (${signal ?? `exit ${code}`}).`));
    });
  });
}

function assertPaidExecution(options, plan) {
  if (!options.execute) throw new Error('Paid generation is disabled. Add --execute after reviewing the plan.');
  const maximum = Number(options['max-cost-usd']);
  if (!Number.isFinite(maximum) || maximum <= 0) {
    throw new Error('--max-cost-usd must be a positive number.');
  }
  if (maximum > HARD_COST_CEILING_USD) {
    throw new Error(`--max-cost-usd cannot exceed the hard $${HARD_COST_CEILING_USD} ceiling.`);
  }
  if (plan.estimatedCostUsd > maximum) {
    throw new Error(`Estimated $${plan.estimatedCostUsd} cost exceeds the supplied $${maximum} cap.`);
  }
}

function printHelp() {
  console.log(`Wordfold pronunciation catalog backfill

Commands:
  plan [--json]
  run --execute --max-cost-usd 2
  restore-limits

Only run --execute can contact the pronunciation function and incur Azure usage.
The runner is pinned to 8,300 catalog entries, en-US + en-GB, concurrency 4, and a $2 ceiling.`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'help' || command === '--help') {
    assertOptions(options, []);
    return printHelp();
  }
  if (command === 'restore-limits') {
    assertOptions(options, []);
    await setRemoteLimits(NORMAL_LIMITS);
    console.log('Restored normal pronunciation limits (20/hour, 1,000 user/day, 10,000 global/day).');
    return;
  }
  const catalogPath = options.catalog ? resolve(options.catalog) : CATALOG_PATH;
  const plan = await loadPlan(catalogPath);
  if (command === 'plan') {
    assertOptions(options, ['json', 'catalog']);
    if (options.json) console.log(JSON.stringify(publicPlan(plan), null, 2));
    else console.log(`${plan.requests} MP3s, ${plan.billableCharacters} characters, estimated $${plan.estimatedCostUsd.toFixed(6)}.`);
    return;
  }
  if (command !== 'run') throw new Error(`Unknown command: ${command}.`);
  assertOptions(options, ['execute', 'max-cost-usd', 'catalog']);
  assertPaidExecution(options, plan);

  const configuration = await loadPublicSupabaseConfiguration();
  const authentication = await authenticate(configuration);
  const maximumCostUsd = Number(options['max-cost-usd']);
  const attemptBudget = await createAttemptBudget(
    plan,
    ATTEMPT_JOURNAL_PATH,
    maximumCostUsd,
  );
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let remoteLimitsMayHaveChanged = false;
  let primaryError;
  try {
    console.log('Temporarily raising development pronunciation limits for the bounded batch...');
    remoteLimitsMayHaveChanged = true;
    await setRemoteLimits(BULK_LIMITS);
    await delay(5_000, controller.signal);
    let lastReported = -1;
    const result = await executeBackfill({
      plan,
      checkpointPath: CHECKPOINT_PATH,
      invoke: createInvoker(configuration, authentication, attemptBudget, controller.signal),
      signal: controller.signal,
      onProgress(completed, total) {
        const percent = Math.floor(completed * 100 / total);
        if (percent !== lastReported) {
          lastReported = percent;
          console.log(`Ready: ${completed}/${total} (${percent}%)`);
        }
      },
    });
    console.log(`Backfill verified ${result.completed}/${plan.requests} ready responses.`);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    try {
      if (remoteLimitsMayHaveChanged) {
        try {
          console.log('Restoring normal development pronunciation limits...');
          await setRemoteLimits(NORMAL_LIMITS);
        } catch (restoreError) {
          const recovery = 'Run: pnpm pronunciation:backfill:restore-limits';
          if (primaryError) console.error(`Warning: ${safeMessage(restoreError)} ${recovery}`);
          else throw new Error(`${safeMessage(restoreError)} ${recovery}`);
        }
      }
    } finally {
      await attemptBudget.close();
    }
  }
}

const isEntrypoint = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(`Error: ${safeMessage(error)}`);
    process.exitCode = 1;
  });
}
