import { feedbackCategories, type FeedbackReport } from '../_shared/feedback.ts';

export type ClaimedFeedback = { id: string; report: FeedbackReport; email_lease: string };
export function feedbackEmail(report: FeedbackReport, from: string) {
  return {
    from, to: ['jozefmajzel1@gmail.com'],
    subject: `[Wordfold feedback] ${feedbackCategories[report.category]}`,
    ...(report.contactEmail ? { reply_to: report.contactEmail } : {}),
    text: [
      `Report: ${report.id}`, `Category: ${feedbackCategories[report.category]}`, `Reason: ${report.reason || '—'}`,
      '', report.message || '(No additional description)',
      '', `Suggested correction: ${report.correction || '—'}`, `Requested item: ${report.requestedItem || '—'}`,
      `Language request: ${report.languageRole || '—'}`, `Reply address: ${report.contactEmail || 'Not provided'}`,
      '', 'Context supplied by the app:', JSON.stringify(report.context, null, 2),
    ].join('\n'),
  };
}

export async function sendFeedbackNotifications(deps: {
  claim(): Promise<ClaimedFeedback[]>;
  send(report: FeedbackReport): Promise<string>;
  finish(row: ClaimedFeedback, providerId: string | null): Promise<void>;
}) {
  const rows = await deps.claim();
  let sent = 0; let failed = 0;
  for (const row of rows) {
    let providerId: string | null = null;
    try { providerId = await deps.send(row.report); } catch { /* Retain the report for retry. */ }
    try {
      await deps.finish(row, providerId);
      if (providerId) sent++; else failed++;
    } catch { failed++; /* Lease expiry allows a retry with the same Resend idempotency key. */ }
  }
  return { sent, failed };
}
