#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const CATALOG_PATH = resolve(ROOT, 'assets/catalog/cefr-catalog.json');
const CATALOG_MANIFEST_PATH = resolve(ROOT, 'assets/catalog/cefr-catalog-manifest.json');
const DEFAULT_OUTPUT = resolve(ROOT, '.artifacts/pronunciation-offline-manifest');
const SUPABASE_BIN = resolve(ROOT, 'node_modules/.bin/supabase');

export const SCHEMA_VERSION = 1;
export const CATALOG_SHA256 = '7a2bddcc85b7c638af7acef0209763871a8b94d37b4dbf4eee71bc458301ed8b';
export const SYNTHESIS_VERSION = 'azure-public-preview-v1';
export const PROVIDER = 'azure';
export const MODEL_TIER = 'Standard Neural S0';
export const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
export const CONTENT_TYPE = 'audio/mpeg';
export const BUCKET = 'pron-manifests';
export const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
export const VOICES = {
  'en-US': 'en-US-AvaNeural',
  'en-GB': 'en-GB-RyanNeural',
};
export const LOCALES = Object.keys(VOICES).sort();

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ROW_QUERY = `
select
  a.catalog_sense_id,
  a.locale,
  a.provider,
  a.voice_id,
  a.model_tier,
  a.output_format,
  a.synthesis_version,
  a.request_key,
  a.content_hash,
  a.sha256,
  a.byte_length,
  a.object_key,
  a.status,
  c.catalog_sha256
from public.pronunciation_assets a
join public.pronunciation_catalog_inputs c using (catalog_sense_id)
order by a.locale, a.catalog_sense_id;
`.trim();

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
    if (['execute', 'linked'].includes(name)) {
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

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read JSON at ${path}: ${safeMessage(error)}`);
  }
}

function catalogEntries(payload) {
  return Array.isArray(payload) ? payload : payload?.entries;
}

async function loadCatalog() {
  const [catalogBytes, catalogManifest] = await Promise.all([
    readFile(CATALOG_PATH),
    readJson(CATALOG_MANIFEST_PATH),
  ]);
  if (sha256(catalogBytes) !== CATALOG_SHA256
    || catalogManifest.catalogSha256 !== CATALOG_SHA256) {
    throw new Error('The CEFR catalog does not match the pinned pronunciation build.');
  }
  const entries = catalogEntries(JSON.parse(catalogBytes.toString('utf8')));
  if (!Array.isArray(entries) || entries.length !== 8_300) {
    throw new Error('The pinned catalog must contain exactly 8,300 entries.');
  }
  const ids = entries.map((entry) => entry?.catalogSenseId);
  if (ids.some((id) => typeof id !== 'string' || !id)
    || new Set(ids).size !== entries.length) {
    throw new Error('The pinned catalog contains invalid or duplicate identities.');
  }
  return { entries, ids: [...ids].sort() };
}

function requireString(row, key) {
  const value = row?.[key];
  if (typeof value !== 'string') throw new Error(`Asset row requires ${key}.`);
  return value;
}

function validateRows(rows, catalogIds) {
  if (!Array.isArray(rows)) throw new Error('Pronunciation asset input must be an array.');
  const expectedIds = new Set(catalogIds);
  const rowsByLocale = new Map(LOCALES.map((locale) => [locale, new Map()]));
  const requestKeys = new Set();
  for (const row of rows) {
    const catalogSenseId = requireString(row, 'catalog_sense_id');
    const locale = requireString(row, 'locale');
    const contentHash = requireString(row, 'content_hash');
    const audioSha256 = requireString(row, 'sha256');
    const byteLength = row?.byte_length;
    if (!Object.hasOwn(VOICES, locale)) throw new Error(`Unsupported asset locale ${locale}.`);
    if (!expectedIds.has(catalogSenseId)) throw new Error(`Unknown catalog identity ${catalogSenseId}.`);
    if (rowsByLocale.get(locale).has(catalogSenseId)) {
      throw new Error(`Duplicate ${locale} asset for ${catalogSenseId}.`);
    }
    if (row.status !== 'ready'
      || row.catalog_sha256 !== CATALOG_SHA256
      || row.provider !== PROVIDER
      || row.voice_id !== VOICES[locale]
      || row.model_tier !== MODEL_TIER
      || row.output_format !== OUTPUT_FORMAT
      || row.synthesis_version !== SYNTHESIS_VERSION
      || !SHA256_PATTERN.test(contentHash)
      || row.request_key !== contentHash
      || !SHA256_PATTERN.test(audioSha256)
      || !Number.isInteger(byteLength)
      || byteLength < 101
      || byteLength > 1_048_576
      || row.object_key !== `${SYNTHESIS_VERSION}/${contentHash}.mp3`) {
      throw new Error(`Invalid ready asset metadata for ${catalogSenseId} (${locale}).`);
    }
    if (requestKeys.has(contentHash)) throw new Error(`Duplicate request key ${contentHash}.`);
    requestKeys.add(contentHash);
    rowsByLocale.get(locale).set(catalogSenseId, [
      catalogSenseId,
      contentHash,
      audioSha256,
      byteLength,
    ]);
  }
  for (const locale of LOCALES) {
    const assets = rowsByLocale.get(locale);
    if (assets.size !== catalogIds.length
      || catalogIds.some((catalogSenseId) => !assets.has(catalogSenseId))) {
      throw new Error(`${locale} must contain every one of the ${catalogIds.length} catalog assets.`);
    }
  }
  if (rows.length !== catalogIds.length * LOCALES.length) {
    throw new Error(`Expected ${catalogIds.length * LOCALES.length} total asset rows.`);
  }
  return rowsByLocale;
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
}

function shardObjectPath(locale, shardSha256) {
  return `${SYNTHESIS_VERSION}/${CATALOG_SHA256}/${locale}/${shardSha256}.json`;
}

function indexObjectPath(indexSha256) {
  return `${SYNTHESIS_VERSION}/${CATALOG_SHA256}/index/${indexSha256}.json`;
}

export function buildArtifacts(rows, catalogIds) {
  const rowsByLocale = validateRows(rows, catalogIds);
  const files = {};
  const shards = {};
  for (const locale of LOCALES) {
    const assets = catalogIds.map((catalogSenseId) => rowsByLocale.get(locale).get(catalogSenseId));
    const totalAudioBytes = assets.reduce((total, asset) => total + asset[3], 0);
    const shard = {
      schemaVersion: SCHEMA_VERSION,
      catalogSha256: CATALOG_SHA256,
      synthesisVersion: SYNTHESIS_VERSION,
      locale,
      voiceId: VOICES[locale],
      assetCount: assets.length,
      totalAudioBytes,
      assets,
    };
    const bytes = jsonBytes(shard);
    if (bytes.byteLength > MAX_MANIFEST_BYTES) throw new Error(`${locale} shard exceeds 8 MiB.`);
    const shardSha256 = sha256(bytes);
    const fileName = `shard-${locale}-${shardSha256}.json`;
    const objectPath = shardObjectPath(locale, shardSha256);
    files[fileName] = bytes;
    shards[locale] = {
      locale,
      voiceId: VOICES[locale],
      assetCount: assets.length,
      totalAudioBytes,
      byteLength: bytes.byteLength,
      sha256: shardSha256,
      objectPath,
    };
  }
  const index = {
    schemaVersion: SCHEMA_VERSION,
    catalogSha256: CATALOG_SHA256,
    synthesisVersion: SYNTHESIS_VERSION,
    contentType: CONTENT_TYPE,
    bucket: BUCKET,
    assetCount: catalogIds.length * LOCALES.length,
    totalAudioBytes: Object.values(shards).reduce((total, shard) => total + shard.totalAudioBytes, 0),
    shards,
  };
  const indexBytes = jsonBytes(index);
  const indexSha256 = sha256(indexBytes);
  const indexFileName = `index-${indexSha256}.json`;
  files[indexFileName] = indexBytes;
  const publication = {
    schemaVersion: SCHEMA_VERSION,
    bucket: BUCKET,
    index: {
      fileName: indexFileName,
      objectPath: indexObjectPath(indexSha256),
      sha256: indexSha256,
      byteLength: indexBytes.byteLength,
    },
    shards: Object.fromEntries(LOCALES.map((locale) => [locale, {
      fileName: `shard-${locale}-${shards[locale].sha256}.json`,
      ...shards[locale],
    }])),
  };
  files['publication.json'] = jsonBytes(publication);
  return { files, publication, index };
}

async function writeAtomic(path, bytes) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, bytes, { flag: 'wx' });
  await rename(temporaryPath, path);
}

async function writeArtifacts(output, artifacts) {
  await mkdir(output, { recursive: true });
  for (const [fileName, bytes] of Object.entries(artifacts.files)) {
    const destination = resolve(output, fileName);
    try {
      const existing = await readFile(destination);
      if (!existing.equals(bytes)) throw new Error(`Existing artifact differs: ${destination}.`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await writeAtomic(destination, bytes);
    }
  }
}

async function runSupabase(arguments_, capture = false) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(SUPABASE_BIN, arguments_, {
      cwd: ROOT,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`Supabase CLI failed (${signal ?? `exit ${code}`}): ${safeMessage(stderr)}`));
    });
  });
}

async function queryLinkedRows() {
  const result = await runSupabase(['db', 'query', '--linked', ROW_QUERY], true);
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error('Supabase asset query returned invalid JSON.');
  }
  if (!Array.isArray(payload?.rows)) throw new Error('Supabase asset query returned no rows.');
  return payload.rows;
}

async function verifyArtifactDirectory(input, catalogIds) {
  const publication = await readJson(resolve(input, 'publication.json'));
  if (publication?.schemaVersion !== SCHEMA_VERSION || publication.bucket !== BUCKET) {
    throw new Error('Publication descriptor is invalid.');
  }
  if (!publication.index
    || publication.index.fileName !== `index-${publication.index.sha256}.json`
    || publication.index.objectPath !== indexObjectPath(publication.index.sha256)
    || !publication.shards
    || Object.keys(publication.shards).sort().join(',') !== LOCALES.join(',')) {
    throw new Error('Publication descriptor paths are invalid.');
  }
  const entries = [publication.index, ...LOCALES.map((locale) => {
    const entry = publication.shards[locale];
    if (!entry
      || entry.locale !== locale
      || entry.voiceId !== VOICES[locale]
      || entry.assetCount !== catalogIds.length
      || entry.fileName !== `shard-${locale}-${entry.sha256}.json`
      || entry.objectPath !== shardObjectPath(locale, entry.sha256)) {
      throw new Error(`Publication descriptor is invalid for ${locale}.`);
    }
    return entry;
  })];
  const loaded = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.fileName !== 'string' || typeof entry.objectPath !== 'string'
      || !SHA256_PATTERN.test(entry.sha256) || !Number.isInteger(entry.byteLength)
      || entry.byteLength < 1 || entry.byteLength > MAX_MANIFEST_BYTES) {
      throw new Error('Publication descriptor contains an invalid artifact.');
    }
    const bytes = await readFile(resolve(input, entry.fileName));
    if (bytes.byteLength !== entry.byteLength || sha256(bytes) !== entry.sha256) {
      throw new Error(`Artifact integrity failed for ${entry.fileName}.`);
    }
    loaded.set(entry.fileName, JSON.parse(bytes.toString('utf8')));
  }
  const index = loaded.get(publication.index.fileName);
  if (index?.schemaVersion !== SCHEMA_VERSION
    || index.catalogSha256 !== CATALOG_SHA256
    || index.synthesisVersion !== SYNTHESIS_VERSION
    || index.contentType !== CONTENT_TYPE
    || index.bucket !== BUCKET
    || index.assetCount !== catalogIds.length * LOCALES.length
    || !index.shards) {
    throw new Error('Published index contents are invalid.');
  }
  let indexTotalBytes = 0;
  for (const locale of LOCALES) {
    const descriptor = publication.shards[locale];
    const shard = loaded.get(descriptor.fileName);
    if (JSON.stringify(index.shards[locale]) !== JSON.stringify({
      locale: descriptor.locale,
      voiceId: descriptor.voiceId,
      assetCount: descriptor.assetCount,
      totalAudioBytes: descriptor.totalAudioBytes,
      byteLength: descriptor.byteLength,
      sha256: descriptor.sha256,
      objectPath: descriptor.objectPath,
    }) || shard?.schemaVersion !== SCHEMA_VERSION
      || shard.catalogSha256 !== CATALOG_SHA256
      || shard.synthesisVersion !== SYNTHESIS_VERSION
      || shard.locale !== locale
      || shard.voiceId !== VOICES[locale]
      || shard.assetCount !== catalogIds.length
      || shard.totalAudioBytes !== descriptor.totalAudioBytes
      || !Array.isArray(shard.assets)
      || shard.assets.length !== catalogIds.length) {
      throw new Error(`Published shard contents are invalid for ${locale}.`);
    }
    let audioBytes = 0;
    const contentHashes = new Set();
    for (let indexPosition = 0; indexPosition < shard.assets.length; indexPosition += 1) {
      const asset = shard.assets[indexPosition];
      if (!Array.isArray(asset) || asset.length !== 4
        || asset[0] !== catalogIds[indexPosition]
        || typeof asset[1] !== 'string' || !SHA256_PATTERN.test(asset[1])
        || contentHashes.has(asset[1])
        || typeof asset[2] !== 'string' || !SHA256_PATTERN.test(asset[2])
        || !Number.isInteger(asset[3]) || asset[3] < 101 || asset[3] > 1_048_576) {
        throw new Error(`Published shard asset is invalid for ${locale}.`);
      }
      contentHashes.add(asset[1]);
      audioBytes += asset[3];
    }
    if (audioBytes !== shard.totalAudioBytes) throw new Error(`${locale} audio total is invalid.`);
    indexTotalBytes += audioBytes;
  }
  if (index.totalAudioBytes !== indexTotalBytes) throw new Error('Published index audio total is invalid.');
  return publication;
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

async function supabaseOrigin() {
  let values = {};
  for (const filename of ['.env', '.env.local']) {
    try { values = { ...values, ...parseEnv(await readFile(resolve(ROOT, filename), 'utf8')) }; }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  const raw = process.env.EXPO_PUBLIC_SUPABASE_URL ?? values.EXPO_PUBLIC_SUPABASE_URL;
  let url;
  try { url = new URL(raw); } catch { throw new Error('EXPO_PUBLIC_SUPABASE_URL is missing or invalid.'); }
  if (url.protocol !== 'https:') throw new Error('Supabase manifest publishing requires HTTPS.');
  return url.origin;
}

function publicUrl(origin, objectPath) {
  return `${origin}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

async function remoteMatches(url, expectedSha256, expectedBytes) {
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 404) return false;
  if (response.status === 400) {
    let body;
    try { body = await response.json(); } catch { /* Safe status handling below. */ }
    if (body?.statusCode === '404' && body?.error === 'not_found') return false;
  }
  if (!response.ok) throw new Error(`Manifest probe failed with HTTP ${response.status}.`);
  if (response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new Error('Published manifest has an unexpected content type.');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== expectedBytes || sha256(bytes) !== expectedSha256) {
    throw new Error('An existing manifest object does not match its immutable path.');
  }
  return true;
}

async function publishArtifacts(input, publication) {
  const origin = await supabaseOrigin();
  const entries = [publication.index, ...LOCALES.map((locale) => publication.shards[locale])];
  for (const entry of entries) {
    const url = publicUrl(origin, entry.objectPath);
    if (!await remoteMatches(url, entry.sha256, entry.byteLength)) {
      await runSupabase([
        '--experimental', 'storage', 'cp', '--linked',
        '--content-type', 'application/json',
        '--cache-control', 'max-age=31536000,immutable',
        resolve(input, entry.fileName),
        `ss:///${BUCKET}/${entry.objectPath}`,
      ]);
    }
    if (!await remoteMatches(url, entry.sha256, entry.byteLength)) {
      throw new Error(`Published manifest could not be verified: ${entry.objectPath}.`);
    }
  }
}

function printHelp() {
  console.log(`Wordfold pronunciation offline manifest

Commands:
  build --input asset-rows.json [--output directory]
  export --linked [--output directory]
  verify [--input directory]
  publish --execute [--input directory]

build and export write deterministic local artifacts. Only publish --execute mutates Storage.`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'help' || command === '--help') {
    assertOptions(options, []);
    return printHelp();
  }
  const catalog = await loadCatalog();
  if (command === 'build') {
    assertOptions(options, ['input', 'output']);
    if (!options.input) throw new Error('build requires --input asset-rows.json.');
    const payload = await readJson(resolve(options.input));
    const rows = Array.isArray(payload) ? payload : payload?.rows;
    const artifacts = buildArtifacts(rows, catalog.ids);
    const output = resolve(options.output ?? DEFAULT_OUTPUT);
    await writeArtifacts(output, artifacts);
    console.log(JSON.stringify(artifacts.publication, null, 2));
    return;
  }
  if (command === 'export') {
    assertOptions(options, ['linked', 'output']);
    if (!options.linked) throw new Error('export requires --linked.');
    const rows = await queryLinkedRows();
    const artifacts = buildArtifacts(rows, catalog.ids);
    const output = resolve(options.output ?? DEFAULT_OUTPUT);
    await writeArtifacts(output, artifacts);
    console.log(JSON.stringify(artifacts.publication, null, 2));
    return;
  }
  if (command === 'verify') {
    assertOptions(options, ['input']);
    const input = resolve(options.input ?? DEFAULT_OUTPUT);
    const publication = await verifyArtifactDirectory(input, catalog.ids);
    console.log(`Verified offline manifest ${publication.index.sha256}.`);
    return;
  }
  if (command === 'publish') {
    assertOptions(options, ['execute', 'input']);
    if (!options.execute) throw new Error('Remote manifest publishing is disabled. Add --execute.');
    const input = resolve(options.input ?? DEFAULT_OUTPUT);
    const publication = await verifyArtifactDirectory(input, catalog.ids);
    await publishArtifacts(input, publication);
    console.log(`Published and verified offline manifest ${publication.index.sha256}.`);
    return;
  }
  throw new Error(`Unknown command: ${command}.`);
}

const isEntrypoint = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(`Error: ${safeMessage(error)}`);
    process.exitCode = 1;
  });
}
