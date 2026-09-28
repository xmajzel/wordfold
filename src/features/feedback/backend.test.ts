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

it('formats a readable email with a standalone prompt and no empty fields', () => {
  const email = feedbackEmail(feedbackFixture({
    id: '036696c1-9593-423e-bfee-6ae1ad72e89d', category: 'idea',
    message: 'Kartičky mi pridu trochu moc priesvitne, text už dosť splýva so slovom na ďalšej kartičke',
    context: { ...feedbackFixture().context, screen: 'settings', appVersion: '1.0.8', build: 'unknown' },
  }), 'Wordfold <notifications@feedback.wordfold.app>');
  expect(email.to).toEqual(['jozefmajzel1@gmail.com']);
  expect(email.subject).toBe('[Wordfold feedback] I have an improvement idea');
  expect(email).not.toHaveProperty('reply_to');
  expect(email.text).toContain('USER REPORT\nKartičky mi pridu trochu moc priesvitne');
  expect(email.text).toContain('COPY INTO CODEX\n----------------\nInvestigate and fix this Wordfold feedback');
  expect(email.text).toContain('User report\n> Kartičky mi pridu trochu moc priesvitne');
  expect(email.text).toContain('Screen: Settings\nApp version: 1.0.8\nBuild: unknown\nPlatform: Android');
  expect(email.text).not.toContain('Suggested correction: —');
  expect(email.text).not.toContain('"word": null');
  expect(email.html).toContain('Copy into Codex</h2><pre');
  expect(email.html).toContain('Kartičky mi pridu trochu moc priesvitne');
  expect(email.html).not.toContain('Report details</h2>');
});

it('includes relevant word details and escapes user text in HTML', () => {
  const report = feedbackFixture({
    category: 'content', reason: 'Translation', message: 'Wrong <script> & word',
    correction: 'First line\nSecond <line>', contactEmail: 'learner@example.com',
    context: { ...feedbackFixture().context, word: {
      id: 'local-word', term: '<hello>', definition: 'A greeting', translation: 'ahoj',
      example: null, catalogSenseId: 'hello-sense', source: 'manual', sourceLanguageCode: 'en', targetLanguageCode: 'sk',
    } },
  });
  const email = feedbackEmail(report, 'sender');
  expect(email.reply_to).toBe('learner@example.com');
  expect(email.text).toContain('Suggested correction: First line\nSecond <line>');
  expect(email.text).toContain('Word: <hello>\nDefinition: A greeting\nTranslation: ahoj');
  expect(email.text).toContain('Word source: manual\nWord ID: local-word\nCatalog sense ID: hello-sense');
  expect(email.text).toContain('Suggested correction\n> First line\n> Second <line>');
  expect(email.html).toContain('Wrong &lt;script&gt; &amp; word');
  expect(email.html).toContain('First line<br>Second &lt;line&gt;');
  expect(email.html).toContain('&lt;hello&gt;');
  expect(email.html).not.toContain('<script>');
  expect(email.html).not.toContain('Example</th>');
});

it('labels a missing-language request in the email and prompt', () => {
  const email = feedbackEmail(feedbackFixture({
    category: 'missing', reason: 'Language', message: '', requestedItem: 'French', languageRole: 'hints',
  }), 'sender');
  expect(email.text).toContain('USER REPORT\n(No written description)');
  expect(email.text).toContain('Requested item: French\nLanguage request: Use this language for hints');
  expect(email.text).toContain('Requested item\n> French\n\nLanguage request\n> Use this language for hints');
  expect(email.html).toContain('Requested item</th>');
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
