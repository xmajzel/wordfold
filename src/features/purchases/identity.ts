import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAiBalance } from '@/features/ai/client';
import { UUID } from '../../../supabase/functions/_shared/ai-word';

// Serialize SDK identity changes, purchases, and restoration across rapid auth changes.
let operations: Promise<unknown> = Promise.resolve();
export function withPurchaseLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.catch(() => undefined).then(operation);
  operations = next;
  return next;
}
export async function revenuecatIdentity(userId: string): Promise<string | null> {
  const key = `revenuecat-account-v1:${userId}`;
  try {
    const account = await fetchAiBalance();
    await AsyncStorage.setItem(key, account.revenuecatId);
    return account.revenuecatId;
  } catch {
    const cached = await AsyncStorage.getItem(key).catch(() => null);
    return cached && UUID.test(cached) ? cached : null;
  }
}
export async function reconcilePurchaseIdentity(
  sdk: { getAppUserID(): Promise<string>; logIn(id: string): Promise<unknown>; logOut(): Promise<unknown> },
  identity: string | null,
) {
  const current = await sdk.getAppUserID();
  if (identity) {
    if (current !== identity) await sdk.logIn(identity);
  } else if (!current.startsWith('$RCAnonymousID:')) await sdk.logOut();
}
