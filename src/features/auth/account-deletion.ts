import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

export class AccountDeletionError extends Error {
  constructor(public readonly code: 'configuration' | 'session_expired' | 'unavailable') {
    super(code === 'configuration'
      ? 'Cloud account deletion is not configured in this build.'
      : code === 'session_expired'
        ? 'Your session expired. Sign in again before deleting the account.'
        : 'The cloud account could not be deleted. Your account and local copy are unchanged; please try again.');
    this.name = 'AccountDeletionError';
  }
}

type FunctionClient = Pick<SupabaseClient, 'functions'>;

export async function requestCloudAccountDeletion(client?: FunctionClient | null) {
  const clientValue = client === undefined
    ? (await import('@/data/supabase/client')).supabase
    : client;
  if (!clientValue) throw new AccountDeletionError('configuration');
  try {
    const response = await clientValue.functions.invoke('account-delete', {
      method: 'POST',
      body: {},
    });
    if (!response.error) return;
    if (response.error instanceof FunctionsHttpError && response.error.context.status === 401) {
      throw new AccountDeletionError('session_expired');
    }
    throw new AccountDeletionError('unavailable');
  } catch (error) {
    if (error instanceof AccountDeletionError) throw error;
    throw new AccountDeletionError('unavailable');
  }
}
