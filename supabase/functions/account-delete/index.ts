// @ts-nocheck -- This entrypoint is checked by the Deno/Supabase runtime, not the Expo TypeScript build.
import { withSupabase } from 'npm:@supabase/server@1.4.0';

import { handleAccountDelete } from './core.ts';

const PRIVATE_BUCKET = 'pron-private';

export default {
  fetch: withSupabase({ auth: 'user' }, async (request, context) => {
    const supabaseAdmin = context.supabaseAdmin;
    return handleAccountDelete(request, {
      userId: context.userClaims?.id,
      async listPrivateObjectKeys(userId: string) {
        const objectKeys: string[] = [];
        const pageSize = 500;
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await supabaseAdmin
            .from('pronunciation_private_assets')
            .select('object_key')
            .eq('owner_user_id', userId)
            .order('object_key')
            .range(from, from + pageSize - 1);
          if (error) throw error;
          objectKeys.push(...(data ?? []).map((row: any) => row.object_key));
          if (!data || data.length < pageSize) return objectKeys;
        }
      },
      async removePrivateObjects(objectKeys: string[]) {
        if (objectKeys.length === 0) return;
        const { error } = await supabaseAdmin.storage.from(PRIVATE_BUCKET).remove(objectKeys);
        if (error) throw error;
      },
      async deleteUser(userId: string) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId, false);
        if (error) throw error;
      },
    });
  }),
};
