#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

export const SAMPLE_TEXT = 'Hello! Learning a new language opens the door to new ideas, new places, and new conversations.';
export const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
export const SAMPLES = [
  { locale: 'en-US', voiceId: 'en-US-AvaNeural', fileName: 'ava-en-US.mp3' },
  { locale: 'en-GB', voiceId: 'en-GB-RyanNeural', fileName: 'ryan-en-GB.mp3' },
];

const OUTPUT_DIRECTORY = resolve(import.meta.dirname, '../assets/pronunciation/voice-samples');

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validateConfiguration() {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_SPEECH_REGION?.trim();
  if (!key || !region) throw new Error('Azure generation requires AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.');
  if (process.env.AZURE_SPEECH_TIER !== 'S0') {
    throw new Error('Azure generation requires AZURE_SPEECH_TIER=S0; free-tier output is not permitted.');
  }
  if (!/^[a-z0-9-]+$/i.test(region)) throw new Error('AZURE_SPEECH_REGION contains invalid characters.');
  return { key, region };
}

async function synthesize({ key, region }, sample) {
  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/ssml+xml',
      'Ocp-Apim-Subscription-Key': key,
      'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
      'User-Agent': 'wordfold-voice-samples/1.0',
    },
    body: `<speak version="1.0" xml:lang="${sample.locale}"><voice name="${sample.voiceId}">${escapeXml(SAMPLE_TEXT)}</voice></speak>`,
  });
  if (!response.ok) throw new Error(`Azure synthesis failed for ${sample.locale} with HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'audio/mpeg') throw new Error(`Azure returned an invalid content type for ${sample.locale}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mp3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
    || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (!mp3 || bytes.byteLength < 1_000 || bytes.byteLength > 1_000_000) {
    throw new Error(`Azure returned invalid MP3 audio for ${sample.locale}.`);
  }
  return bytes;
}

async function main() {
  if (!process.argv.slice(2).includes('--execute')) {
    throw new Error('Pass --execute to generate the two approved bundled voice samples.');
  }
  const configuration = validateConfiguration();
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const generated = await Promise.all(SAMPLES.map(async (sample) => {
    const bytes = await synthesize(configuration, sample);
    return {
      ...sample,
      text: SAMPLE_TEXT,
      outputFormat: OUTPUT_FORMAT,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      bytes,
    };
  }));
  for (const sample of generated) {
    const outputPath = resolve(OUTPUT_DIRECTORY, sample.fileName);
    const temporaryPath = `${outputPath}.tmp`;
    await writeFile(temporaryPath, sample.bytes);
    await rename(temporaryPath, outputPath);
  }
  const manifestPath = resolve(OUTPUT_DIRECTORY, 'manifest.json');
  const manifestSamples = generated.map(({ bytes: _bytes, ...sample }) => sample);
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, samples: manifestSamples }, null, 2)}\n`, 'utf8');
  for (const sample of generated) {
    process.stdout.write(`${sample.locale} ${sample.voiceId}: ${sample.byteLength} bytes ${sample.sha256}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
