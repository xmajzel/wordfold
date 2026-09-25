import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { SyncStatus } from '@powersync/react-native';

import { SupabasePowerSyncConnector } from '@/data/sync/connector';
import { MISSING_COLLECTION_MAPPING_MESSAGE } from '@/data/sync/collection-id';
import { powerSyncConfiguration, powerSyncConfigurationError } from '@/data/sync/config';
import { powerSyncDatabase } from '@/data/sync/database';
import { createSyncLifecycle } from '@/data/sync/lifecycle';
import { acknowledgeRejectedWriteGroup, loadRejectedWriteGroup } from '@/data/sync/rejected-writes';
import { supabase } from '@/data/supabase/client';
import { useAuth } from '@/providers/auth-provider';
import type { SyncContextValue } from '@/providers/sync-types';

interface DatabaseSyncState {
  connected: boolean;
  connecting: boolean;
  hasSynced: boolean;
  lastSyncedAt: Date | null;
  downloadError: boolean;
  uploading: boolean;
  uploadError: string | null;
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
    uploading: status.dataFlowStatus.uploading === true,
    uploadError: status.dataFlowStatus.uploadError?.message ?? null,
  };
}

export function SyncProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [databaseState, setDatabaseState] = useState(() => snapshot(powerSyncDatabase.currentStatus));
  const [lifecycleError, setLifecycleError] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [rejectedWrite, setRejectedWrite] = useState<SyncContextValue['rejectedWrite']>(null);
  const refreshRequest = useRef(0);

  const refreshUploadState = useCallback(async () => {
    const request = ++refreshRequest.current;
    const userId = auth.status === 'signedIn' ? auth.user?.id : null;
    if (!userId) {
      setPendingUploads(0);
      setRejectedWrite(null);
      return;
    }
    const [queue, rejected] = await Promise.all([
      powerSyncDatabase.getUploadQueueStats(),
      loadRejectedWriteGroup(powerSyncDatabase, userId),
    ]);
    if (request !== refreshRequest.current) return;
    setPendingUploads(queue.count);
    setRejectedWrite(rejected);
  }, [auth.status, auth.user?.id]);

  useEffect(() => {
    const disposeStatus = powerSyncDatabase.registerListener({
      statusChanged: (status) => {
        setDatabaseState(snapshot(status));
        void refreshUploadState().catch(() => undefined);
      },
    });
    const disposeErrors = powerSyncDatabase.onChange({
      onChange: () => void refreshUploadState().catch(() => undefined),
    }, { tables: ['sync_write_errors'], throttleMs: 100 });
    return () => { disposeStatus(); disposeErrors(); };
  }, [refreshUploadState]);

  useEffect(() => {
    if (auth.status === 'loading') return;
    const userId = auth.status === 'signedIn' ? auth.user?.id ?? null : null;
    void lifecycle.transitionTo(userId).then(
      () => setLifecycleError(false),
      () => setLifecycleError(true),
    );
  }, [auth.status, auth.user?.id]);

  useEffect(() => {
    const timeout = setTimeout(() => void refreshUploadState().catch(() => undefined), 0);
    return () => clearTimeout(timeout);
  }, [databaseState.uploading, refreshUploadState]);

  const clearBeforeSignOut = useCallback(() => lifecycle.clearBeforeSignOut(), []);
  const acknowledgeRejectedWrite = useCallback(async () => {
    const userId = auth.status === 'signedIn' ? auth.user?.id : null;
    if (!rejectedWrite || !userId) return;
    try {
      await acknowledgeRejectedWriteGroup(powerSyncDatabase, userId, rejectedWrite);
    } finally {
      await refreshUploadState();
    }
  }, [auth.status, auth.user?.id, refreshUploadState, rejectedWrite]);

  const uploadFields = useMemo(() => ({
    uploading: databaseState.uploading,
    pendingUploads,
    uploadErrorMessage: databaseState.uploadError === MISSING_COLLECTION_MAPPING_MESSAGE
      ? databaseState.uploadError
      : databaseState.uploadError ? 'Some changes could not be uploaded yet. Wordfold will retry.' : null,
    rejectedWrite,
    refreshUploadState,
    acknowledgeRejectedWrite,
  }), [acknowledgeRejectedWrite, databaseState.uploadError, databaseState.uploading, pendingUploads, refreshUploadState, rejectedWrite]);

  const value = useMemo<SyncContextValue>(() => {
    if (auth.status === 'unavailable' || !supabase || !powerSyncConfiguration) {
      return {
        phase: 'unavailable', hasSynced: false, lastSyncedAt: null,
        message: powerSyncConfigurationError ?? 'Synchronization is unavailable.', clearBeforeSignOut,
        ...uploadFields,
      };
    }
    if (auth.status !== 'signedIn') {
      return { phase: 'signedOut', hasSynced: false, lastSyncedAt: null, message: null, clearBeforeSignOut, ...uploadFields };
    }
    if (lifecycleError || databaseState.downloadError) {
      return {
        phase: 'error', hasSynced: databaseState.hasSynced, lastSyncedAt: databaseState.lastSyncedAt,
        message: 'Synchronization could not connect. Your local vocabulary is still available.', clearBeforeSignOut,
        ...uploadFields,
      };
    }
    if (databaseState.connected && databaseState.hasSynced) {
      return {
        phase: 'connected', hasSynced: true, lastSyncedAt: databaseState.lastSyncedAt,
        message: pendingUploads > 0 ? 'PowerSync is connected and uploading local changes.' : 'Your vocabulary is synchronized.',
        clearBeforeSignOut, ...uploadFields,
      };
    }
    if (!databaseState.connected && databaseState.hasSynced) {
      return {
        phase: 'offline', hasSynced: true, lastSyncedAt: databaseState.lastSyncedAt,
        message: pendingUploads > 0
          ? `${pendingUploads} local ${pendingUploads === 1 ? 'change is' : 'changes are'} safely queued until you reconnect.`
          : 'PowerSync is offline. Previously downloaded sync data remains on this device.',
        clearBeforeSignOut, ...uploadFields,
      };
    }
    return {
      phase: 'connecting', hasSynced: false, lastSyncedAt: databaseState.lastSyncedAt,
      message: databaseState.connecting ? 'Connecting to PowerSync…' : 'Preparing PowerSync…', clearBeforeSignOut,
      ...uploadFields,
    };
  }, [auth.status, clearBeforeSignOut, databaseState, lifecycleError, pendingUploads, uploadFields]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
