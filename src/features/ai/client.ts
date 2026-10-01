import { FunctionsHttpError } from '@supabase/supabase-js';
import { isWordSuggestion, object, UUID, type SuggestionInput, type WordSuggestion } from '../../../supabase/functions/_shared/ai-word';
export type { SuggestionInput, WordSuggestion };
export type AiBalance = { balance: number; revenuecatId: string; paidGrant: boolean; creditPackCount?: number; purchaseVerificationUnavailable?: boolean; purchaseClaimedElsewhere?: boolean };
export type CreditPurchaseBalance = AiBalance & { creditPurchaseStatus: 'pending' | 'credited' | 'refunded' };
export type AiResult = { status: 'pending' | 'failed'; balance: number } | { status: 'completed'; balance: number; suggestion: WordSuggestion };
export class AiError extends Error {
  constructor(public readonly code: string) {
    super(({ no_credits: 'No AI credits remaining. You can still use the dictionary or add words manually.',
      unauthorized: 'Sign in to use AI suggestions.', limited: 'AI requests are temporarily limited. Please try again later.',
      invalid_input: 'Check the word and context, then try again.', request_conflict: 'This request no longer matches the word. Start a new suggestion.',
    } as Record<string, string>)[code] ?? 'AI could not be reached. Retry to recover your suggestion without paying twice.');
  }
}
async function invoke(body: Record<string, unknown>): Promise<unknown> {
  const { supabase } = await import('@/data/supabase/client');
  if (!supabase) throw new AiError('unavailable');
  const { data, error } = await supabase.functions.invoke('ai-word', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const parsed = await error.context.json().catch(() => null);
      throw new AiError(parsed?.error?.code ?? (error.context.status === 401 ? 'unauthorized' : 'unavailable'));
    }
    throw new AiError('unavailable');
  }
  return data;
}
export async function fetchAiBalance(verifyPurchase = false): Promise<AiBalance> {
  const data = await invoke({ action: verifyPurchase ? 'verify_purchase' : 'balance' });
  return parseBalance(data);
}
function parseBalance(data: unknown): AiBalance {
  if (!object(data) || !Number.isInteger(data.balance) || (data.balance as number) < 0
    || typeof data.revenuecatId !== 'string' || !UUID.test(data.revenuecatId) || typeof data.paidGrant !== 'boolean'
    || (data.creditPackCount !== undefined && (!Number.isInteger(data.creditPackCount) || (data.creditPackCount as number) < 0))) throw new AiError('invalid_response');
  return data as AiBalance;
}
export async function fetchCreditPurchaseStatus(transactionId: string): Promise<CreditPurchaseBalance> {
  const data = await invoke({ action: 'credit_purchase_status', transactionId });
  const account = parseBalance(data);
  if (!object(data) || !['pending', 'credited', 'refunded'].includes(String(data.creditPurchaseStatus))) throw new AiError('invalid_response');
  return { ...account, creditPurchaseStatus: data.creditPurchaseStatus as CreditPurchaseBalance['creditPurchaseStatus'] };
}
export async function generateSuggestion(requestId: string, input: SuggestionInput): Promise<AiResult> {
  const data = await invoke({ action: 'generate', requestId, input });
  if (!object(data) || !Number.isInteger(data.balance) || (data.balance as number) < 0
    || !['pending', 'failed', 'completed'].includes(String(data.status))
    || (data.status === 'completed' && !isWordSuggestion(data.suggestion))) throw new AiError('invalid_response');
  return data as AiResult;
}
