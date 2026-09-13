// @ts-nocheck -- This entrypoint is checked by the Deno/Supabase runtime, not the Expo TypeScript build.
import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
import { feedbackEmail, sendFeedbackNotifications } from './core.ts';

Deno.serve(async (request) => {
  const secret = Deno.env.get('FEEDBACK_WORKER_SECRET');
  if (!secret || request.headers.get('x-feedback-worker-secret') !== secret) return new Response(null, { status: 401 });
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('FEEDBACK_FROM_EMAIL');
  if (!apiKey || !from) return Response.json({ error: 'Email is not configured' }, { status: 503 });
  const client = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  try {
    const result = await sendFeedbackNotifications({
      async claim() {
        const { data, error } = await client.rpc('claim_feedback_emails');
        if (error) throw error;
        return data;
      },
      async send(report) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `wordfold-feedback/${report.id}` },
          body: JSON.stringify(feedbackEmail(report, from)),
        });
        if (!response.ok) throw new Error('Email provider unavailable');
        const data = await response.json();
        if (typeof data.id !== 'string' || !data.id) throw new Error('Missing email acknowledgement');
        return data.id;
      },
      async finish(row, providerId) {
        const { error } = await client.from('feedback_reports').update({
          email_status: providerId ? 'sent' : 'pending', email_provider_id: providerId,
          email_error: providerId ? null : 'Provider request failed; retry scheduled', email_lease: null,
        }).eq('id', row.id).eq('email_lease', row.email_lease);
        if (error) throw error;
      },
    });
    return Response.json(result);
  } catch { return Response.json({ error: 'Notification worker unavailable' }, { status: 503 }); }
});
