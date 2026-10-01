import { handleCreditWebhook } from '../../../supabase/functions/revenuecat-credits/core';
import { creditPurchaseHash } from '../../../supabase/functions/_shared/ai-credit-purchases';

const identity = '11111111-1111-4111-8111-111111111111';
const event = { type: 'NON_RENEWING_PURCHASE', app_id: 'app-wordfold', environment: 'PRODUCTION', store: 'PLAY_STORE',
  product_id: 'wordfold_ai_credits_100', transaction_id: 'GPA.order-1', app_user_id: identity, original_app_user_id: '$RCAnonymousID:old', aliases: [identity] };
const request = (value: unknown = event, authorization = 'Bearer test-secret') => new Request('https://example.test', {
  method: 'POST', headers: { authorization }, body: JSON.stringify({ event: value }),
});
const deps = () => ({ secret: 'test-secret', appId: 'app-wordfold', rpc: jest.fn(async () => ({ status: 'credited' })) });
beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: jest.requireActual('node:crypto').webcrypto, configurable: true }); });
it('fulfills an authenticated production pack with a fingerprint and server-owned identities', async () => {
  const d = deps();
  expect((await handleCreditWebhook(request(), d)).status).toBe(200);
  expect(d.rpc).toHaveBeenCalledWith('ai_apply_credit_purchase', { p_revenuecat_ids: [identity],
    p_purchase_hash: await creditPurchaseHash(event.transaction_id), p_refunded: false });
});
it.each(['', 'Bearer wrong'])('rejects invalid authorization %s without fulfillment', async (authorization) => {
  const d = deps(); expect((await handleCreditWebhook(request(event, authorization), d)).status).toBe(401);
  expect(d.rpc).not.toHaveBeenCalled();
});
it.each([{ environment: 'SANDBOX' }, { app_id: 'another-app' }, { store: 'APP_STORE' },
  { product_id: 'wordfold_lifetime' }, { type: 'TRANSFER' }, { type: 'TEMPORARY_ENTITLEMENT_GRANT' }])('ignores unrelated or unverified events %j', async (override) => {
  const d = deps(); expect(await (await handleCreditWebhook(request({ ...event, ...override }), d)).json()).toEqual({ status: 'ignored' });
  expect(d.rpc).not.toHaveBeenCalled();
});
it('uses the same fingerprint for a refund regardless of user transfers', async () => {
  const d = deps(); await handleCreditWebhook(request({ ...event, type: 'CANCELLATION', app_user_id: '$RCAnonymousID:new', aliases: [] }), d);
  expect(d.rpc).toHaveBeenCalledWith('ai_apply_credit_purchase', expect.objectContaining({
    p_purchase_hash: await creditPurchaseHash(event.transaction_id), p_refunded: true,
  }));
});
it('retains current identity priority and deduplicates valid aliases', async () => {
  const d = deps(); const other = '22222222-2222-4222-8222-222222222222';
  await handleCreditWebhook(request({ ...event, aliases: [other, identity, 'invalid'] }), d);
  expect(d.rpc).toHaveBeenCalledWith('ai_apply_credit_purchase', expect.objectContaining({ p_revenuecat_ids: [identity, other] }));
});
it('requests retry when mapping or the database is unavailable', async () => {
  const d = deps(); d.rpc.mockResolvedValueOnce({ status: 'unmapped' });
  expect((await handleCreditWebhook(request(), d)).status).toBe(503);
  d.rpc.mockRejectedValueOnce(new Error('offline'));
  expect((await handleCreditWebhook(request(), d)).status).toBe(503);
});
it('accepts sandbox fulfillment only when explicitly configured for a test backend', async () => {
  const d = deps(); expect((await handleCreditWebhook(request({ ...event, environment: 'SANDBOX' }), { ...d, environment: 'SANDBOX' })).status).toBe(200);
  expect(d.rpc).toHaveBeenCalledTimes(1);
});
it('validates payloads and fails closed when configuration is missing', async () => {
  const d = deps(); expect((await handleCreditWebhook(request({ ...event, transaction_id: '' }), d)).status).toBe(400);
  expect((await handleCreditWebhook(request({ ...event, transaction_id: 'x'.repeat(64000) }), d)).status).toBe(400);
  expect((await handleCreditWebhook(request(), { ...d, appId: undefined })).status).toBe(503);
  expect((await handleCreditWebhook(request(), { ...d, secret: undefined })).status).toBe(401);
  expect(d.rpc).not.toHaveBeenCalled();
});
