import { handleAiWord, paidPurchaseId } from '../../../supabase/functions/ai-word/core';
import { parseSuggestionInput } from '../../../supabase/functions/_shared/ai-word';
const input = { term: 'tenacity', context: '', sourceLanguageCode: 'en', targetLanguageCode: 'sk' };
const requestId = '11111111-1111-4111-8111-111111111111';
const suggestion = { definition: 'Determination despite difficulties.', translation: 'húževnatosť', example: 'Her tenacity helped her finish a very difficult project.', partOfSpeech: 'noun' };
const request = (body: unknown) => new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) });
function deps() {
  return { userId: 'user', openaiKey: 'test-key', fetch: jest.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ status: 'completed', model: 'gpt-6-sol', usage: { input_tokens: 200, output_tokens: 80 },
    output: [{ content: [{ type: 'output_text', text: JSON.stringify(suggestion) }] }] })),
  rpc: jest.fn(async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => name === 'ai_reserve' ? { status: 'reserved', balance: 9 }
    : { status: args.p_result ? 'completed' : 'failed', suggestion: args.p_result, balance: args.p_result ? 9 : 10 }) };
}
it('reserves before generating, validates the output, and commits the complete card', async () => {
  const d = deps(); const response = await handleAiWord(request({ action: 'generate', requestId, input }), d);
  expect(await response.json()).toMatchObject({ status: 'completed', suggestion, balance: 9 });
  expect(d.rpc.mock.calls[0]).toEqual(['ai_reserve', { p_user_id: 'user', p_request_id: requestId, p_input: input }]);
  const body = JSON.parse(d.fetch.mock.calls[0]?.[1]?.body as string);
  expect(body.model).toBe('gpt-6-sol'); expect(body.store).toBe(false);
});
it.each(['pending', 'completed', 'failed'])('does not call OpenAI again for an existing %s request', async (status) => {
  const d = deps(); d.rpc.mockResolvedValueOnce({ status, balance: 9, suggestion });
  await handleAiWord(request({ action: 'generate', requestId, input }), d);
  expect(d.fetch).not.toHaveBeenCalled(); expect(d.rpc).toHaveBeenCalledTimes(1);
});
it.each([['empty',402],['limited',429],['conflict',409]])('rejects %s before spending provider tokens', async (status, code) => {
  const d = deps(); d.rpc.mockResolvedValueOnce({ status });
  expect((await handleAiWord(request({ action: 'generate', requestId, input }), d)).status).toBe(code);
  expect(d.fetch).not.toHaveBeenCalled();
});
it('refunds an upstream failure', async () => {
  const d = deps(); d.fetch.mockRejectedValueOnce(new Error('timeout'));
  const response = await handleAiWord(request({ action: 'generate', requestId, input }), d);
  expect(await response.json()).toMatchObject({ status: 'failed', balance: 10 });
  expect(d.rpc).toHaveBeenLastCalledWith('ai_finish', expect.objectContaining({ p_result: null }));
});
it('refunds malformed model output', async () => {
  const d = deps(); d.fetch.mockResolvedValueOnce(Response.json({ status: 'completed', output: [] }));
  expect(await (await handleAiWord(request({ action: 'generate', requestId, input }), d)).json()).toMatchObject({ status: 'failed' });
});
it('does not refund an uncertain successful commit', async () => {
  const d = deps(); d.rpc.mockResolvedValueOnce({ status: 'reserved' }).mockRejectedValueOnce(new Error('connection lost'));
  expect((await handleAiWord(request({ action: 'generate', requestId, input }), d)).status).toBe(503);
  expect(d.rpc).toHaveBeenCalledTimes(2);
});
it('requires authentication and bounded supported inputs', async () => {
  const d = deps();
  expect((await handleAiWord(request({ action: 'generate', requestId, input }), { ...d, userId: undefined })).status).toBe(401);
  expect((await handleAiWord(request({ action: 'generate', requestId, input: { ...input, context: 'a'.repeat(1001) } }), d)).status).toBe(400);
  expect(parseSuggestionInput({ ...input, sourceLanguageCode: '__proto__' })).toBeNull();
  expect(d.fetch).not.toHaveBeenCalled();
});
it('never trusts client paid flags or a supplied RevenueCat identity', async () => {
  const d = deps(); d.rpc.mockResolvedValueOnce({ balance: 10, revenuecatId: requestId, paidGrant: false });
  await handleAiWord(request({ action: 'balance', paid: true, revenuecatId: 'someone-else' }), d);
  expect(d.rpc).toHaveBeenCalledTimes(1); expect(d.rpc).toHaveBeenCalledWith('ai_account', { p_user_id: 'user' });
});
it('requires a real, active, non-sandbox lifetime purchase for the bonus', () => {
  const record = { subscriber: { entitlements: { unlimited_words: { product_identifier: 'wordfold_lifetime', expires_date: null } },
    non_subscriptions: { wordfold_lifetime: [{ id: 'transaction-1', store: 'play_store', is_sandbox: false }] } } };
  expect(paidPurchaseId(record)).toBe('play_store:wordfold_lifetime:transaction-1');
  record.subscriber.non_subscriptions.wordfold_lifetime[0].is_sandbox = true;
  expect(paidPurchaseId(record)).toBeNull();
  expect(paidPurchaseId({ subscriber: { entitlements: record.subscriber.entitlements } })).toBeNull();
});
