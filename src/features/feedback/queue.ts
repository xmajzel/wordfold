import { isFeedbackReport, type FeedbackReport } from '../../../supabase/functions/_shared/feedback';

export type PendingFeedback = { report: FeedbackReport; error?: string };
export type FeedbackHistoryEntry = PendingFeedback & { submittedAt: string | null; sentAt?: string };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown> };
export type DeliveryResult = { status: 'sent' | 'retry' | 'rejected'; message?: string };
const KEY = 'wordfold.feedback.pending.v1';

export function createFeedbackQueue(storage: Storage, deliver: (report: FeedbackReport) => Promise<DeliveryResult>) {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const result = tail.then(action);
    tail = result.catch(() => undefined);
    return result;
  };
  const read = async (): Promise<FeedbackHistoryEntry[]> => {
    const raw = await storage.getItem(KEY);
    if (!raw) return [];
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.every((row) => row && isFeedbackReport(row.report)
      && (row.submittedAt == null || (typeof row.submittedAt === 'string' && Number.isFinite(Date.parse(row.submittedAt))))
      && (row.sentAt === undefined || (typeof row.sentAt === 'string' && Number.isFinite(Date.parse(row.sentAt)))))) {
      throw new Error('Saved feedback could not be read. Please try again.');
    }
    // Older app versions stored pending reports without a submission date.
    return rows.map((row) => ({ ...row, submittedAt: row.submittedAt ?? null }));
  };
  const write = (rows: FeedbackHistoryEntry[]) => storage.setItem(KEY, JSON.stringify(rows));
  return {
    list: () => serial<PendingFeedback[]>(async () => (await read()).filter((row) => !row.sentAt)),
    history: () => serial(async () => (await read()).reverse()),
    enqueue: (report: FeedbackReport) => serial(async () => {
      if (!isFeedbackReport(report)) throw new Error('Please check your feedback fields.');
      const rows = await read();
      if (rows.some((row) => row.report.id === report.id)) return;
      if (rows.filter((row) => !row.sentAt).length >= 20) throw new Error('Please send or remove saved feedback before adding more.');
      await write([...rows, { report, submittedAt: new Date().toISOString() }]);
    }),
    remove: (id: string) => serial(async () => write((await read()).filter((row) => row.report.id !== id))),
    flush: () => serial<PendingFeedback[]>(async () => {
      let rows = await read();
      for (const row of [...rows]) {
        if (row.error || row.sentAt) continue;
        let result: DeliveryResult;
        try { result = await deliver(row.report); } catch { break; }
        if (result.status === 'retry') break;
        rows = rows.map((item) => item.report.id === row.report.id
          ? result.status === 'sent'
            ? { ...item, sentAt: new Date().toISOString() }
            : { ...item, error: result.message ?? 'This report could not be accepted. Remove it and submit a new report.' }
          : item);
        // Persist each acknowledgement before attempting the next report.
        await write(rows);
      }
      return rows.filter((row) => !row.sentAt);
    }),
  };
}
