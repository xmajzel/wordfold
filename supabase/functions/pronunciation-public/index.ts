// @ts-nocheck -- This entrypoint is checked by the Deno/Supabase runtime, not the Expo TypeScript build.
import { withSupabase } from 'npm:@supabase/server@1.4.0';

import { createAzureSpeechSynthesizer } from './azure.ts';
import {
  MODEL_TIER,
  OUTPUT_FORMAT,
  PROVIDER,
  SYNTHESIS_VERSION,
  handlePronunciationRequest,
} from './core.ts';

const BUCKET = 'pron-public';

function positiveInteger(name: string, fallback: number, maximum: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

function createRepository(supabaseAdmin: any) {
  return {
    async getCatalogInput(catalogSenseId: string) {
      const { data, error } = await supabaseAdmin
        .from('pronunciation_catalog_inputs')
        .select('catalog_sense_id,text')
        .eq('catalog_sense_id', catalogSenseId)
        .eq('enabled', true)
        .maybeSingle();
      if (error) throw error;
      return data ? { catalogSenseId: data.catalog_sense_id, text: data.text } : null;
    },

    async claim(input: any) {
      const { data, error } = await supabaseAdmin.rpc('claim_public_pronunciation', {
        p_catalog_sense_id: input.catalogSenseId,
        p_locale: input.locale,
        p_provider: PROVIDER,
        p_voice_id: input.voiceId,
        p_model_tier: MODEL_TIER,
        p_output_format: OUTPUT_FORMAT,
        p_synthesis_version: SYNTHESIS_VERSION,
        p_request_key: input.requestKey,
        p_lease_seconds: 120,
      });
      if (error || !data) throw error ?? new Error('Missing pronunciation claim');
      return data;
    },

    async authorize(input: any) {
      const { data, error } = await supabaseAdmin.rpc('authorize_public_pronunciation_request', {
        p_user_id: input.userId,
        p_catalog_sense_id: input.catalogSenseId,
        p_locale: input.locale,
        p_request_key: input.requestKey,
        p_request_kind: input.requestKind,
        p_billed_characters: input.billedCharacters,
        p_user_hourly_request_limit: input.limits.userHourlyRequests,
        p_user_daily_character_limit: input.limits.userDailyCharacters,
        p_global_daily_character_limit: input.limits.globalDailyCharacters,
      });
      if (error || !data) throw error ?? new Error('Missing pronunciation budget decision');
      return data;
    },

    async complete(requestKey: string, leaseToken: string, sha256: string, byteLength: number) {
      const { data, error } = await supabaseAdmin.rpc('complete_public_pronunciation', {
        p_request_key: requestKey,
        p_lease_token: leaseToken,
        p_sha256: sha256,
        p_byte_length: byteLength,
      });
      if (error || !data) throw error ?? new Error('Missing completed pronunciation asset');
      return data;
    },

    async fail(requestKey: string, leaseToken: string, failureCode: string) {
      const { error } = await supabaseAdmin.rpc('fail_public_pronunciation', {
        p_request_key: requestKey,
        p_lease_token: leaseToken,
        p_failure_code: failureCode,
      });
      if (error) throw error;
    },
  };
}

function createStorage(supabaseAdmin: any) {
  const bucket = supabaseAdmin.storage.from(BUCKET);
  return {
    async putImmutable(objectKey: string, bytes: Uint8Array) {
      const { error } = await bucket.upload(
        objectKey,
        new Blob([bytes], { type: 'audio/mpeg' }),
        { cacheControl: '31536000', contentType: 'audio/mpeg', upsert: false },
      );
      if (!error) return bytes;

      // An earlier upload may have succeeded before its metadata transaction failed.
      const { data: existing, error: downloadError } = await bucket.download(objectKey);
      if (downloadError || !existing) throw downloadError ?? error;
      return new Uint8Array(await existing.arrayBuffer());
    },

    getPublicUrl(objectKey: string) {
      return bucket.getPublicUrl(objectKey).data.publicUrl;
    },
  };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    try {
      const fakeProvider = Deno.env.get('PRONUNCIATION_FAKE_PROVIDER') === 'true';
      const synthesize = createAzureSpeechSynthesizer({
        key: Deno.env.get('AZURE_SPEECH_KEY') ?? '',
        region: Deno.env.get('AZURE_SPEECH_REGION') ?? '',
        tier: Deno.env.get('AZURE_SPEECH_TIER') ?? '',
        endpoint: fakeProvider ? (Deno.env.get('AZURE_SPEECH_ENDPOINT') ?? 'invalid') : undefined,
      });
      return await handlePronunciationRequest(request, {
        userId: context.userClaims?.id,
        limits: {
          userHourlyRequests: positiveInteger('PRONUNCIATION_USER_HOURLY_REQUEST_LIMIT', 20, 1000),
          userDailyCharacters: positiveInteger('PRONUNCIATION_USER_DAILY_CHARACTER_LIMIT', 1000, 1_000_000),
          globalDailyCharacters: positiveInteger('PRONUNCIATION_GLOBAL_DAILY_CHARACTER_LIMIT', 10_000, 100_000_000),
        },
        repository: createRepository(context.supabaseAdmin),
        storage: createStorage(context.supabaseAdmin),
        synthesize,
      });
    } catch {
      return Response.json(
        { error: { code: 'configuration_error' } },
        { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
  }),
};
