// @ts-nocheck -- This entrypoint is checked by the Deno/Supabase runtime, not the Expo TypeScript build.
import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
import { handleCreditWebhook } from './core.ts';

Deno.serve((request) => handleCreditWebhook(request, {
  secret: Deno.env.get('REVENUECAT_CREDITS_WEBHOOK_SECRET'),
  appId: Deno.env.get('REVENUECAT_ANDROID_APP_ID'),
  environment: Deno.env.get('REVENUECAT_CREDIT_ENVIRONMENT') || 'PRODUCTION',
  async rpc(name, args) {
    const client = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const { data, error } = await client.rpc(name, args);
    if (error || !data) throw new Error('database_unavailable');
    return data;
  },
}));
