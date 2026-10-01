export { AI_CREDIT_PACK_SIZE, AI_CREDIT_PRODUCT_ID } from '../../../supabase/functions/_shared/ai-credit-purchases';

// Android's original purchase JSON contains the store order ID used by RevenueCat webhooks.
// The SDK transactionIdentifier can instead be RevenueCat's own ID; never use it for fulfillment.
export function creditStoreTransactionId(transaction: { originalJson: string | null }): string | null {
  try {
    const purchase: unknown = JSON.parse(transaction.originalJson ?? 'null');
    if (purchase && typeof purchase === 'object' && 'orderId' in purchase
      && typeof purchase.orderId === 'string' && purchase.orderId.trim() && purchase.orderId.length <= 1000) return purchase.orderId;
  } catch { /* Payment can still be fulfilled by the webhook after the app closes. */ }
  return null;
}
