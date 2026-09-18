// @ts-nocheck -- Checked by Deno, separately from the Expo TypeScript build.
import { withSupabase } from 'npm:@supabase/server@1.4.0';
import { AI_HEADERS, handleAiWord } from './core.ts';

const authenticated = withSupabase({ auth: 'user' }, async (request, ctx) => handleAiWord(request, {
    userId: ctx.userClaims?.id,
    openaiKey: Deno.env.get('OPENAI_API_KEY'),
    revenuecatKey: Deno.env.get('REVENUECAT_SECRET_API_KEY'),
    model: Deno.env.get('AI_WORD_MODEL') || 'gpt-5.6-sol',
    fetch,
    rpc: async (name, args) => {
      const { data, error } = await ctx.supabaseAdmin.rpc(name, args);
      if (error || !data) throw new Error('database_unavailable');
      return data;
    },
  }));
export default {
  fetch(request: Request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: AI_HEADERS });
    return authenticated(request);
  },
};
