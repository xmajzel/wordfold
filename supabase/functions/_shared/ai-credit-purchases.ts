export const AI_CREDIT_PRODUCT_ID = 'wordfold_ai_credits_100';
export const AI_CREDIT_PACK_SIZE = 100;

export async function creditPurchaseHash(transactionId: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`play_store:${AI_CREDIT_PRODUCT_ID}:${transactionId}`));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
