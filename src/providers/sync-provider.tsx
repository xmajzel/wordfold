import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { SyncStatus } from '@powersync/react-native';

import { SupabasePowerSyncConnector } from '@/data/sync/connector';
import { powerSyncConfiguration, powerSyncConfigurationError } from '@/data/sync/config';
import { powerSyncDatabase } from '@/data/sync/database';
import { createSyncLifecycle } from '@/data/sync/lifecycle';
import { supabase } from '@/data/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import type { SyncContextValue } from '@/providers/sync-types';

interface DatabaseSyncState {
  connected: boolean;
  connecting: boolean;
  hasSynced: boolean;
  lastSyncedAt: Date | null;
  downloadError: boolean;
}

const connector = supabase && powerSyncConfiguration
  ? new SupabasePowerSyncConnector(supabase, powerSyncConfiguration.endpoint)
  : null;
const lifecycle = createSyncLifecycle(powerSyncDatabase, connector);
const SyncContext = createContext<SyncContextValue | null>(null);

function snapshot(status: SyncStatus): DatabaseSyncState {
  return {
    connected: status.connected,
    connecting: status.connecting,
    hasSynced: status.hasSynced === true,
    lastSyncedAt: status.lastSyncedAt ?? null,
    downloadError: Boolean(status.dataFlowStatus.downloadError),
  };
}

export function SyncProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [databaseState, setDatabaseState] = useState(() => snapshot(powerSyncDatabase.currentStatus));
  const [lifecycleError, setLifecycleError] = useState(false);

  useEffect(() => powerSyncDatabase.registerListener({
    statusChanged: (status) => setDatabaseState(snapshot(status)),
  }), []);

  useEffect(() => {
    if (auth.status === 'loading') return;
    const userId = auth.status === 'signedIn' ? auth.user?.id ?? null : null;
    void lifecycle.transitionTo(userId).then(
      () => setLifecycleError(false),
      () => setLifecycleError(true),
    );
  }, [auth.status, auth.user?.id]);

  const clearBeforeSignOut = useCallback(() => lifecycle.clearBeforeSignOut(), []);

  const value = useMemo<SyncContextValue>(() => {
    if (auth.status === 'unavailable' || !supabase || !powerSyncConfiguration) {
      return {
        phase: 'unavailable', hasSynced: false, lastSyncedAt: null,
        message: powerSyncConfigurationError ?? 'Synchronization is unavailable.', clearBeforeSignOut,
      };
    }
    if (auth.status !== 'signedIn') {
      return { phase: 'signedOut', hasSynced: false, lastSyncedAt: null, message: null, clearBeforeSignOut };
    }
    if (lifecycleError || databaseState.downloadError) {
      return {
        phase: 'error', hasSynced: databaseState.hasSynced, lastSyncedAt: databaseState.lastSyncedAt,
        message: 'Synchronization could not connect. Your local vocabulary is still available.', clearBeforeSignOut,
      };
    }
    if (databaseState.connected && databaseState.hasSynced) {
      return {
        phase: 'connected', hasSynced: true, lastSyncedAt: databaseState.lastSyncedAt,
        message: 'PowerSync is connected. Local vocabulary import is the next step.', clearBeforeSignOut,
      };
    }
    if (!databaseState.connected && databaseState.hasSynced) {
      return {
        phase: 'offline', hasSynced: true, lastSyncedAt: databaseState.lastSyncedAt,
        message: 'PowerSync is offline. Previously downloaded sync data remains on this device.', clearBeforeSignOut,
      };
    }
    return {
      phase: 'connecting', hasSynced: false, lastSyncedAt: databaseState.lastSyncedAt,
      message: databaseState.connecting ? 'Connecting to PowerSync…' : 'Preparing PowerSync…', clearBeforeSignOut,
    };
  }, [auth.status, clearBeforeSignOut, databaseState, lifecycleError]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
