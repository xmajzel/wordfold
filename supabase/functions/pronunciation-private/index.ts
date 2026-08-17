// @ts-nocheck -- This entrypoint is checked by the Deno/Supabase runtime, not the Expo TypeScript build.
import { withSupabase } from 'npm:@supabase/server@1.4.0';

import { createPrivateAzureSpeechSynthesizer } from './azure.ts';
import {
  PRIVATE_SIGNED_URL_SECONDS,
  PRIVATE_SYNTHESIS_VERSION,
  handlePrivatePronunciationRequest,
} from './core.ts';
import {
  MODEL_TIER,
  OUTPUT_FORMAT,
  PROVIDER,
} from '../pronunciation-public/core.ts';

const BUCKET = 'pron-private';

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
    async claim(input: any) {
      const { data, error } = await supabaseAdmin.rpc('claim_private_pronunciation', {
        p_owner_user_id: input.ownerUserId,
        p_locale: input.locale,
        p_provider: PROVIDER,
        p_voice_id: input.voiceId,
        p_model_tier: MODEL_TIER,
        p_output_format: OUTPUT_FORMAT,
        p_synthesis_version: PRIVATE_SYNTHESIS_VERSION,
        p_request_key: input.requestKey,
        p_lease_seconds: 120,
      });
      if (error || !data) throw error ?? new Error('Missing private pronunciation claim');
      return data;
    },

    async authorize(input: any) {
      const { data, error } = await supabaseAdmin.rpc('authorize_private_pronunciation_request', {
        p_user_id: input.userId,
        p_locale: input.locale,
        p_request_key: input.requestKey,
        p_request_kind: input.requestKind,
        p_billed_characters: input.billedCharacters,
        p_user_hourly_request_limit: input.limits.userHourlyRequests,
        p_user_daily_character_limit: input.limits.userDailyCharacters,
        p_global_daily_character_limit: input.limits.globalDailyCharacters,
      });
      if (error || !data) throw error ?? new Error('Missing private pronunciation budget decision');
      return data;
    },

    async complete(
      ownerUserId: string,
      requestKey: string,
      leaseToken: string,
      sha256: string,
      byteLength: number,
    ) {
      const { data, error } = await supabaseAdmin.rpc('complete_private_pronunciation', {
        p_owner_user_id: ownerUserId,
        p_request_key: requestKey,
        p_lease_token: leaseToken,
        p_sha256: sha256,
        p_byte_length: byteLength,
      });
      if (error || !data) throw error ?? new Error('Missing completed private pronunciation asset');
      return data;
    },

    async fail(ownerUserId: string, requestKey: string, leaseToken: string, failureCode: string) {
      const { error } = await supabaseAdmin.rpc('fail_private_pronunciation', {
        p_owner_user_id: ownerUserId,
        p_request_key: requestKey,
        p_lease_token: leaseToken,
        p_failure_code: failureCode,
      });
      if (error) throw error;
    },

    async listOwnerObjectKeys(ownerUserId: string) {
      const objectKeys: string[] = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabaseAdmin
          .from('pronunciation_private_assets')
          .select('object_key')
          .eq('owner_user_id', ownerUserId)
          .order('object_key')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        objectKeys.push(...(data ?? []).map((row: any) => row.object_key));
        if (!data || data.length < pageSize) return objectKeys;
      }
    },

    async deleteOwnerMetadata(ownerUserId: string) {
      const { error } = await supabaseAdmin.rpc('delete_private_pronunciation_metadata', {
        p_owner_user_id: ownerUserId,
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
        { cacheControl: '3600', contentType: 'audio/mpeg', upsert: false },
      );
      if (!error) return bytes;

      const { data: existing, error: downloadError } = await bucket.download(objectKey);
      if (downloadError || !existing) throw downloadError ?? error;
      return new Uint8Array(await existing.arrayBuffer());
    },

    async createSignedUrl(objectKey: string, expiresInSeconds: number) {
      if (expiresInSeconds !== PRIVATE_SIGNED_URL_SECONDS) {
        throw new Error('Invalid private pronunciation URL lifetime');
      }
      const { data, error } = await bucket.createSignedUrl(objectKey, expiresInSeconds);
      if (error || !data?.signedUrl) throw error ?? new Error('Missing private pronunciation URL');
      return data.signedUrl;
    },

    async remove(objectKeys: string[]) {
      for (let offset = 0; offset < objectKeys.length; offset += 500) {
        const { error } = await bucket.remove(objectKeys.slice(offset, offset + 500));
        if (error) throw error;
      }
    },
  };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    try {
      const fakeProvider = Deno.env.get('PRONUNCIATION_FAKE_PROVIDER') === 'true';
      const synthesize = createPrivateAzureSpeechSynthesizer({
        key: Deno.env.get('AZURE_SPEECH_KEY') ?? '',
        region: Deno.env.get('AZURE_SPEECH_REGION') ?? '',
        tier: Deno.env.get('AZURE_SPEECH_TIER') ?? '',
        endpoint: fakeProvider ? (Deno.env.get('AZURE_SPEECH_ENDPOINT') ?? 'invalid') : undefined,
      });
      return await handlePrivatePronunciationRequest(request, {
        userId: context.userClaims?.id,
        limits: {
          userHourlyRequests: positiveInteger('PRONUNCIATION_USER_HOURLY_REQUEST_LIMIT', 20, 20_000),
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
