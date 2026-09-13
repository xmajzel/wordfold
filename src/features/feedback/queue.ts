import { isFeedbackReport, type FeedbackReport } from '../../../supabase/functions/_shared/feedback';

export type PendingFeedback = { report: FeedbackReport; error?: string };
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
  const read = async (): Promise<PendingFeedback[]> => {
    const raw = await storage.getItem(KEY);
    if (!raw) return [];
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.every((row) => row && isFeedbackReport(row.report))) {
      throw new Error('Saved feedback could not be read. Please try again.');
    }
    return rows;
  };
  const write = (rows: PendingFeedback[]) => storage.setItem(KEY, JSON.stringify(rows));
  return {
    list: () => serial(read),
    enqueue: (report: FeedbackReport) => serial(async () => {
      if (!isFeedbackReport(report)) throw new Error('Please check your feedback fields.');
      const rows = await read();
      if (rows.some((row) => row.report.id === report.id)) return;
      if (rows.length >= 20) throw new Error('Please send or remove saved feedback before adding more.');
      await write([...rows, { report }]);
    }),
    remove: (id: string) => serial(async () => write((await read()).filter((row) => row.report.id !== id))),
    flush: () => serial(async () => {
      let rows = await read();
      for (const row of [...rows]) {
        if (row.error) continue;
        let result: DeliveryResult;
        try { result = await deliver(row.report); } catch { break; }
        if (result.status === 'retry') break;
        rows = result.status === 'sent'
          ? rows.filter((item) => item.report.id !== row.report.id)
          : rows.map((item) => item.report.id === row.report.id
            ? { ...item, error: result.message ?? 'This report could not be accepted. Remove it and submit a new report.' } : item);
        // Persist each acknowledgement before attempting the next report.
        await write(rows);
      }
      return rows;
    }),
  };
}
