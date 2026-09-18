import { makeReviewQueue, parseReviewQueue, reviewQueueKey } from './review-queue';
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
it('preserves editorial fields and flags duplicate lines for guided review', () => {
  const q = makeReviewQueue('tenacity\ntenacity\ntolerance | allowed difference | tolerancia | A small tolerance.', 'en', 'class');
  expect(q.rows[0]).toMatchObject({ term: 'tenacity', prepared: false });
  expect(q.rows[1].error).toBe('Duplicate in this paste');
  expect(q.rows[2]).toMatchObject({ prepared: true, translation: 'tolerancia' });
  expect(parseReviewQueue(JSON.stringify({ ...q, index: 1, added: 1 }))).toMatchObject({ index: 1, added: 1 });
});
it('isolates account/course queues and rejects corrupt storage', () => {
  expect(reviewQueueKey('a','en-sk')).not.toBe(reviewQueueKey('b','en-sk'));
  expect(reviewQueueKey('a','en-sk')).not.toBe(reviewQueueKey('a','es-sk'));
  expect(parseReviewQueue('{bad')).toBeNull();
  expect(parseReviewQueue(JSON.stringify({ ...makeReviewQueue('test','en','c'), index: 20 }))).toBeNull();
});
