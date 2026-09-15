import { createFeedbackQueue } from './queue';
import { feedbackFixture } from './fixtures';

function storage() {
  const data = new Map<string, string>();
  return { getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { data.set(key, value); }) };
}

it('preserves offline submissions across restart and retains sent history after acknowledgement', async () => {
  const disk = storage();
  const offline = createFeedbackQueue(disk, async () => { throw new Error('offline'); });
  await offline.enqueue(feedbackFixture());
  await offline.flush();
  const send = jest.fn(async () => ({ status: 'sent' as const }));
  const restarted = createFeedbackQueue(disk, send);
  expect(await restarted.list()).toHaveLength(1);
  expect(await restarted.flush()).toEqual([]);
  expect(send).toHaveBeenCalledWith(feedbackFixture());
  const afterRestart = createFeedbackQueue(disk, send);
  expect(await afterRestart.list()).toEqual([]);
  expect(await afterRestart.history()).toEqual([expect.objectContaining({
    report: feedbackFixture(), submittedAt: expect.any(String), sentAt: expect.any(String),
  })]);
  await afterRestart.flush();
  expect(send).toHaveBeenCalledTimes(1);
});

it('serializes concurrent retries and prevents duplicate enqueue', async () => {
  const send = jest.fn(async () => ({ status: 'sent' as const }));
  const queue = createFeedbackQueue(storage(), send);
  await Promise.all([queue.enqueue(feedbackFixture()), queue.enqueue(feedbackFixture())]);
  await Promise.all([queue.flush(), queue.flush()]);
  expect(send).toHaveBeenCalledTimes(1);
});

it('retains rejected reports for removal and still delivers subsequent reports', async () => {
  const send = jest.fn().mockResolvedValueOnce({ status: 'rejected' }).mockResolvedValue({ status: 'sent' });
  const queue = createFeedbackQueue(storage(), send);
  await queue.enqueue(feedbackFixture());
  await queue.enqueue(feedbackFixture({ id: '33333333-3333-4333-8333-333333333333' }));
  const remaining = await queue.flush();
  expect(remaining).toHaveLength(1);
  expect(remaining[0].error).toBeTruthy();
  await queue.flush();
  expect(send).toHaveBeenCalledTimes(2);
  await queue.remove(remaining[0].report.id);
  expect(await queue.list()).toEqual([]);
});

it('does not claim a report is saved when persistence fails', async () => {
  const disk = storage();
  disk.setItem.mockRejectedValueOnce(new Error('full'));
  const queue = createFeedbackQueue(disk, async () => ({ status: 'sent' }));
  await expect(queue.enqueue(feedbackFixture())).rejects.toThrow('full');
  expect(await queue.list()).toEqual([]);
});

it('retains reports during throttling and recovers without changing report IDs', async () => {
  const send = jest.fn().mockResolvedValueOnce({ status: 'retry' }).mockResolvedValue({ status: 'sent' });
  const queue = createFeedbackQueue(storage(), send);
  await queue.enqueue(feedbackFixture());
  expect(await queue.flush()).toHaveLength(1);
  expect(await queue.flush()).toHaveLength(0);
  expect(send.mock.calls[0][0].id).toBe(send.mock.calls[1][0].id);
});

it('preserves legacy pending reports without inventing their submission date', async () => {
  const disk = storage();
  await disk.setItem('wordfold.feedback.pending.v1', JSON.stringify([{ report: feedbackFixture() }]));
  const queue = createFeedbackQueue(disk, async () => ({ status: 'sent' }));
  expect(await queue.history()).toEqual([{ report: feedbackFixture(), submittedAt: null }]);
  await queue.flush();
  expect(await queue.history()).toEqual([expect.objectContaining({ submittedAt: null, sentAt: expect.any(String) })]);
});

it('shows newest submissions first and excludes sent history from the pending limit', async () => {
  const queue = createFeedbackQueue(storage(), async () => ({ status: 'sent' }));
  for (let i = 0; i < 21; i++) {
    await queue.enqueue(feedbackFixture({ id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`, message: `Report ${i}` }));
    await queue.flush();
  }
  const history = await queue.history();
  expect(history).toHaveLength(21);
  expect(history[0].report.message).toBe('Report 20');
  expect(history[20].report.message).toBe('Report 0');
});

it('does not lose history if persisting an acknowledgement fails', async () => {
  const disk = storage();
  const send = jest.fn(async () => ({ status: 'sent' as const }));
  const queue = createFeedbackQueue(disk, send);
  await queue.enqueue(feedbackFixture());
  disk.setItem.mockRejectedValueOnce(new Error('disk full'));
  await expect(queue.flush()).rejects.toThrow('disk full');
  const restarted = createFeedbackQueue(disk, send);
  expect(await restarted.list()).toHaveLength(1);
  await restarted.flush();
  expect(await restarted.history()).toHaveLength(1);
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
});
