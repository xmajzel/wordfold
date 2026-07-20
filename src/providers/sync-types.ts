export type SyncPhase = 'unavailable' | 'signedOut' | 'connecting' | 'connected' | 'offline' | 'error';

export interface SyncContextValue {
  phase: SyncPhase;
  hasSynced: boolean;
  lastSyncedAt: Date | null;
  message: string | null;
  clearBeforeSignOut(): Promise<void>;
}
