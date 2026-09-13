import { isFeedbackReport, type FeedbackReport } from '../_shared/feedback.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const respond = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

export async function handleFeedbackSubmit(request: Request, deps: {
  accept(report: FeedbackReport): Promise<'accepted' | 'conflict' | 'limited'>;
}) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed' });
  try {
    // Bound streamed bodies too; Content-Length is optional and untrusted.
    const reader = request.body?.getReader();
    if (!reader) return respond(400, { error: 'Missing report' });
    const decoder = new TextDecoder();
    let bytes = 0; let text = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 48000) { await reader.cancel(); return respond(413, { error: 'Report too large' }); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    let report: unknown;
    try { report = JSON.parse(text); } catch { return respond(400, { error: 'Invalid JSON' }); }
    if (!isFeedbackReport(report)) return respond(422, { error: 'Invalid report' });
    const result = await deps.accept(report);
    if (result === 'limited') return respond(429, { error: 'Please try later' });
    if (result === 'conflict') return respond(409, { error: 'Report identifier already used' });
    return respond(200, { accepted: true, id: report.id });
  } catch { return respond(503, { error: 'Feedback temporarily unavailable' }); }
}
