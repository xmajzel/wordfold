import { object, UUID } from '../_shared/ai-word.ts';
import { AI_CREDIT_PRODUCT_ID, creditPurchaseHash } from '../_shared/ai-credit-purchases.ts';

type Dependencies = {
  secret?: string;
  appId?: string;
  environment?: string;
  rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
};

export async function handleCreditWebhook(request: Request, deps: Dependencies): Promise<Response> {
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!deps.secret || request.headers.get('authorization') !== `Bearer ${deps.secret}`) return reply({ error: 'unauthorized' }, 401);
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  if (!deps.appId || !['PRODUCTION', 'SANDBOX'].includes(deps.environment ?? 'PRODUCTION')) return reply({ error: 'not_configured' }, 503);
  try {
    if (Number(request.headers.get('content-length')) > 64000) return reply({ error: 'invalid_input' }, 400);
    const raw = await request.text();
    if (raw.length > 64000) return reply({ error: 'invalid_input' }, 400);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'invalid_input' }, 400); }
    if (!object(body) || !object(body.event)) return reply({ error: 'invalid_input' }, 400);
    const event = body.event;
    if (event.type === 'TEST') return reply({ status: 'test' });
    if (event.app_id !== deps.appId || event.environment !== (deps.environment ?? 'PRODUCTION')
      || event.store !== 'PLAY_STORE' || event.product_id !== AI_CREDIT_PRODUCT_ID
      || !['NON_RENEWING_PURCHASE', 'CANCELLATION'].includes(String(event.type))) return reply({ status: 'ignored' });
    if (typeof event.transaction_id !== 'string' || !event.transaction_id.trim() || event.transaction_id.length > 1000) {
      return reply({ error: 'invalid_input' }, 400);
    }
    // Current identity takes precedence. Aliases are a fallback, never an instruction to transfer a wallet.
    const identities = [...new Set([event.app_user_id, event.original_app_user_id,
      ...(Array.isArray(event.aliases) ? event.aliases : [])].filter((id): id is string => typeof id === 'string' && UUID.test(id)))];
    const result = await deps.rpc('ai_apply_credit_purchase', {
      p_revenuecat_ids: identities,
      p_purchase_hash: await creditPurchaseHash(event.transaction_id),
      p_refunded: event.type === 'CANCELLATION',
    });
    // RevenueCat retries unsuccessful responses; never acknowledge an unfulfilled purchase.
    return reply(result, result.status === 'unmapped' ? 503 : 200);
  } catch { return reply({ error: 'unavailable' }, 503); }
}
