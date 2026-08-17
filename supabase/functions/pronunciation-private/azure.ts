import {
  CONTENT_TYPE,
  OUTPUT_FORMAT,
  SafePronunciationError,
  type SynthesisResult,
} from '../pronunciation-public/core.ts';
import type { PrivatePronunciationLocale } from './core.ts';

export type PrivateAzureSpeechConfig = {
  key: string;
  region: string;
  tier: string;
  timeoutMs?: number;
  endpoint?: string;
  fetchImplementation?: typeof fetch;
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function createPrivateAzureSpeechSynthesizer(config: PrivateAzureSpeechConfig) {
  let customEndpoint: URL | undefined;
  try {
    customEndpoint = config.endpoint ? new URL(config.endpoint) : undefined;
  } catch {
    throw new SafePronunciationError('provider_auth', 502);
  }
  if (!config.key
    || !/^[a-z0-9-]+$/.test(config.region)
    || config.tier !== 'S0'
    || (customEndpoint && !['http:', 'https:'].includes(customEndpoint.protocol))) {
    throw new SafePronunciationError('provider_auth', 502);
  }
  const fetchImplementation = config.fetchImplementation ?? fetch;
  const endpoint = customEndpoint?.toString()
    ?? `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const timeoutMs = config.timeoutMs ?? 10_000;

  return async ({
    text,
    locale,
    voiceId,
  }: {
    text: string;
    locale: PrivatePronunciationLocale;
    voiceId: string;
  }): Promise<SynthesisResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImplementation(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/ssml+xml',
          'Ocp-Apim-Subscription-Key': config.key,
          'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
          'User-Agent': 'wordfold-pronunciation-private',
        },
        body: `<speak version="1.0" xml:lang="${locale}"><voice name="${voiceId}">${escapeXml(text)}</voice></speak>`,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new SafePronunciationError('provider_auth', 502);
        }
        if (response.status === 400) {
          throw new SafePronunciationError('provider_rejected', 502);
        }
        throw new SafePronunciationError('provider_unavailable', 502);
      }
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? '',
      };
    } catch (error) {
      if (error instanceof SafePronunciationError) throw error;
      if (controller.signal.aborted) {
        throw new SafePronunciationError('provider_timeout', 502);
      }
      throw new SafePronunciationError('provider_unavailable', 502);
    } finally {
      clearTimeout(timer);
    }
  };
}
