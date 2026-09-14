import { handleFeedbackSubmit } from '../../../supabase/functions/feedback-submit/core';
import { feedbackEmail, sendFeedbackNotifications } from '../../../supabase/functions/feedback-notify/core';
import { isFeedbackReport } from '../../../supabase/functions/_shared/feedback';
import { feedbackFixture } from './fixtures';

function request(body: unknown) {
  return new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) });
}

it('accepts guest feedback without an account and returns only an acknowledgement', async () => {
  const accept = jest.fn(async () => 'accepted' as const);
  const response = await handleFeedbackSubmit(request(feedbackFixture()), { accept });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ accepted: true, id: feedbackFixture().id });
  expect(accept).toHaveBeenCalledTimes(1);
});

it.each([
  { message: '' }, { category: '__proto__' }, { contactEmail: 'bad\r\nBcc:other@test.com' },
  { extra: 'do not accept arbitrary metadata' }, { message: 'a'.repeat(4001) },
])('rejects invalid feedback before persistence: %s', async (overrides) => {
  const accept = jest.fn();
  const response = await handleFeedbackSubmit(request({ ...feedbackFixture(), ...overrides }), { accept });
  expect(response.status).toBe(422);
  expect(accept).not.toHaveBeenCalled();
});

it('bounds bodies even without Content-Length', async () => {
  const accept = jest.fn();
  const response = await handleFeedbackSubmit(request({ text: 'a'.repeat(48001) }), { accept });
  expect(response.status).toBe(413);
  expect(accept).not.toHaveBeenCalled();
});

it.each([['limited', 429], ['conflict', 409]] as const)('returns %s without exposing stored data', async (result, status) => {
  const response = await handleFeedbackSubmit(request(feedbackFixture()), { accept: async () => result });
  expect(response.status).toBe(status);
  expect(await response.json()).not.toHaveProperty('report');
});

it('accepts a contextual content report without requiring a written correction', () => {
  const report = feedbackFixture({ category: 'content', reason: 'Translation', message: '' });
  expect(isFeedbackReport(report)).toBe(false);
  report.context.word = { id: 'local-word', term: 'hello', definition: 'A greeting', translation: 'ahoj',
    example: null, catalogSenseId: 'hello-sense', source: 'manual', sourceLanguageCode: 'en', targetLanguageCode: 'sk' };
  expect(isFeedbackReport(report)).toBe(true);
});

it('distinguishes requested learning languages from hint languages', () => {
  const report = feedbackFixture({ category: 'missing', reason: 'Language', message: '', requestedItem: 'French' });
  expect(isFeedbackReport(report)).toBe(false);
  expect(isFeedbackReport({ ...report, languageRole: 'hints' })).toBe(true);
});

it('sends only to the configured owner with optional reply-to and plain-text context', () => {
  const email = feedbackEmail(feedbackFixture({ contactEmail: 'learner@example.com', message: '<script>test</script>' }), 'Wordfold <notifications@feedback.wordfold.app>');
  expect(email.to).toEqual(['jozefmajzel1@gmail.com']);
  expect(email.reply_to).toBe('learner@example.com');
  expect(email.text).toContain('<script>test</script>');
  expect(email).not.toHaveProperty('html');
  expect(feedbackEmail(feedbackFixture(), 'sender')).not.toHaveProperty('reply_to');
});

it('retains failed email jobs and continues sending the remaining claimed reports', async () => {
  const first = { id: feedbackFixture().id, report: feedbackFixture(), email_lease: 'lease-1' };
  const second = { ...first, id: 'other', email_lease: 'lease-2' };
  const finish = jest.fn(async () => undefined);
  const send = jest.fn().mockRejectedValueOnce(new Error('provider offline')).mockResolvedValueOnce('email-id');
  expect(await sendFeedbackNotifications({ claim: async () => [first, second], send, finish })).toEqual({ sent: 1, failed: 1 });
  expect(finish).toHaveBeenNthCalledWith(1, first, null);
  expect(finish).toHaveBeenNthCalledWith(2, second, 'email-id');
});
