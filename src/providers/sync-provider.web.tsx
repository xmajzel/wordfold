import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';

import { useAuth } from '@/providers/auth-provider';
import type { SyncContextValue } from '@/providers/sync-types';

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const value = useMemo<SyncContextValue>(() => ({
    phase: auth.status === 'signedIn' ? 'unavailable' : 'signedOut',
    hasSynced: false,
    lastSyncedAt: null,
    message: auth.status === 'signedIn' ? 'Data synchronization is not enabled on web.' : null,
    clearBeforeSignOut: async () => undefined,
  }), [auth.status]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
