import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const OMW_ES_2_SHA256 = 'd8450d42885cd51f3db39fe64219a7a003eeb432b4caa00428285fe6ab224303';
export const OMW_EN_2_SHA256 = '0e09dfb7f096bc3f10b9de68ffecf13839fa22ae46fd9b227cec890d204ca1dc';
export const WORDNET_3_COPYRIGHT = 'WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.';
export const WORDNET_3_LICENSE_PATH = 'assets/licenses/WORDNET_3_0_LICENSE.txt';
export const WORDNET_3_LICENSE_TEXT = readFileSync(new URL('../assets/licenses/WORDNET_3_0_LICENSE.txt', import.meta.url), 'utf8');

const sha256Pattern = /^[a-f0-9]{64}$/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Payload(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function normalizeSpanishTerm(value) {
  assert(typeof value === 'string', 'Spanish term must be a string.');
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es');
}

function findOmwSource(manifest) {
  return manifest.sources.find((source) => source.id === 'omw-es' || source.id === 'omw-es:2.0');
}

export function validateSourceManifest(manifest) {
  assert(isPlainObject(manifest), 'Source manifest must be an object.');
  assert(manifest.schemaVersion === 1, 'Source manifest schemaVersion must be 1.');
  assert(Array.isArray(manifest.sources) && manifest.sources.length >= 2, 'Source manifest must contain at least PCIC and OMW sources.');

  const sourceIds = new Set();
  for (const [index, source] of manifest.sources.entries()) {
    const label = `Source ${index + 1}`;
    assert(isPlainObject(source), `${label} must be an object.`);
    for (const key of ['id', 'version', 'url', 'sha256', 'license', 'attribution', 'redistributionScope']) {
      assert(nonEmptyString(source[key]), `${label} ${key} is required.`);
    }
    const isHttpsUrl = /^https:\/\//u.test(source.url);
    const isSafeWordfoldDoc = source.id.startsWith('wordfold-')
      && /^docs\/(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u.test(source.url);
    assert(isHttpsUrl || isSafeWordfoldDoc, `${label} url must use HTTPS or a safe repo-relative docs/ path for a Wordfold source.`);
    assert(sha256Pattern.test(source.sha256), `${label} sha256 must be a lowercase 64-character SHA-256.`);
    assert(Array.isArray(source.transformations) && source.transformations.length > 0, `${label} transformations must be a non-empty array.`);
    assert(source.transformations.every(nonEmptyString), `${label} transformations must contain only non-empty strings.`);
    assert(!sourceIds.has(source.id), `${source.id}: duplicate source ID.`);
    sourceIds.add(source.id);
  }

  const pcicSource = manifest.sources.find((source) => /pcic|plan-curricular/iu.test(source.id));
  assert(pcicSource, 'Source manifest must record the PCIC framework permission.');
  assert(/permission|framework|reference/iu.test(`${pcicSource.license} ${pcicSource.redistributionScope}`), 'PCIC source must describe its permission/framework-only scope.');

  const omwSource = findOmwSource(manifest);
  assert(omwSource, 'Source manifest must contain the omw-es version 2.0 source.');
  assert(omwSource.version === '2.0', 'OMW Spanish source version must be 2.0.');
  assert(omwSource.url === 'https://github.com/omwn/omw-data/releases/download/v2.0/omw-es-2.0.tar.xz', 'OMW Spanish release URL is not the pinned v2.0 asset.');
  assert(omwSource.sha256 === OMW_ES_2_SHA256, 'OMW Spanish archive SHA-256 does not match the pinned release.');
  assert(/(?:CC BY 3\.0|Creative Commons Attribution 3\.0)/iu.test(omwSource.license), 'OMW Spanish license must be recorded as CC BY 3.0.');
  const english = manifest.sources.find((source) => source.id === 'omw-en:2.0');
  assert(english, 'Source manifest must contain the omw-en:2.0 semantic source.');
  assert(english.version === '2.0' && english.sha256 === OMW_EN_2_SHA256, 'OMW English version/archive SHA-256 is not pinned.');
  assert(english.url === 'https://github.com/omwn/omw-data/releases/download/v2.0/omw-en-2.0.tar.xz', 'OMW English URL is not pinned.');
  assert(english.license === 'WordNet 3.0 license' && english.licensePath === WORDNET_3_LICENSE_PATH, 'OMW English full WordNet license metadata is required.');
  assert(english.copyright === WORDNET_3_COPYRIGHT, 'OMW English copyright notice is required.');
  assert(/all copies/iu.test(english.redistributionScope) && /disclaimer/iu.test(english.redistributionScope) && /advertising/iu.test(english.redistributionScope), 'OMW English redistribution obligations are incomplete.');

  return {
    sourceManifestSha256: sha256Payload(manifest),
    sourceIds,
    omwSourceId: omwSource.id,
  };
}
