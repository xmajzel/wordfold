// @ts-nocheck -- This entrypoint is checked by the Deno/Supabase runtime, not the Expo TypeScript build.
import { withSupabase } from 'npm:@supabase/server@1.4.0';

import {
  PRIVATE_CLEANUP_BATCH_LIMIT,
  handlePrivatePronunciationCleanup,
} from './core.ts';

const BUCKET = 'pron-private';

function createRepository(supabaseAdmin: any) {
  return {
    async claimExpired(limit: number, leaseSeconds: number) {
      const { data, error } = await supabaseAdmin.rpc(
        'claim_expired_private_pronunciations',
        {
          p_limit: limit,
          p_lease_seconds: leaseSeconds,
        },
      );
      if (error || !data) throw error ?? new Error('Missing private cleanup claim');
      return data;
    },

    async finalize(assetIds: string[], cleanupToken: string) {
      const { data, error } = await supabaseAdmin.rpc(
        'finalize_expired_private_pronunciations',
        {
          p_asset_ids: assetIds,
          p_cleanup_token: cleanupToken,
        },
      );
      if (error || typeof data !== 'number') {
        throw error ?? new Error('Missing private cleanup finalization');
      }
      return data;
    },

    async release(assetIds: string[], cleanupToken: string) {
      const { data, error } = await supabaseAdmin.rpc(
        'release_expired_private_pronunciations',
        {
          p_asset_ids: assetIds,
          p_cleanup_token: cleanupToken,
        },
      );
      if (error || typeof data !== 'number') {
        throw error ?? new Error('Missing private cleanup release');
      }
      return data;
    },

    async pruneRequests(limit: number) {
      const { data, error } = await supabaseAdmin.rpc('prune_pronunciation_requests', {
        p_limit: limit,
      });
      if (error || typeof data !== 'number') {
        throw error ?? new Error('Missing pronunciation request pruning');
      }
      return data;
    },
  };
}

function createStorage(supabaseAdmin: any) {
  const bucket = supabaseAdmin.storage.from(BUCKET);
  return {
    async remove(objectKey: string) {
      const { error } = await bucket.remove([objectKey]);
      if (error) throw error;
    },
  };
}

export default {
  fetch: withSupabase({ auth: 'secret' }, async (request, context) => (
    handlePrivatePronunciationCleanup(request, {
      batchLimit: PRIVATE_CLEANUP_BATCH_LIMIT,
      repository: createRepository(context.supabaseAdmin),
      storage: createStorage(context.supabaseAdmin),
    })
  )),
};
