// @ts-nocheck -- This entrypoint is checked by the Deno/Supabase runtime, not the Expo TypeScript build.
import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
import { handleFeedbackSubmit } from './core.ts';

Deno.serve(async (request) => handleFeedbackSubmit(request, {
  async accept(report) {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const client = createClient(Deno.env.get('SUPABASE_URL'), serviceKey, { auth: { persistSession: false } });
    // Store a salted network fingerprint, never the raw address. Global quota remains a backstop.
    const network = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ?? 'unknown';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(network));
    const networkHash = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
    const { data, error } = await client.rpc('accept_feedback', { p_report: report, p_network_hash: networkHash });
    if (error || !['accepted', 'conflict', 'limited'].includes(data)) throw new Error('Could not store report');
    return data;
  },
}));
