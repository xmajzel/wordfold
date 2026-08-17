export type SyncPhase = 'unavailable' | 'signedOut' | 'connecting' | 'connected' | 'offline' | 'error';

export interface RejectedSyncWrite {
  id: string;
  tableName: string;
  operation: string;
  safeMessage: string;
  createdAt: string;
}

export interface SyncContextValue {
  phase: SyncPhase;
  hasSynced: boolean;
  lastSyncedAt: Date | null;
  message: string | null;
  uploading: boolean;
  pendingUploads: number;
  uploadErrorMessage: string | null;
  rejectedWrite: RejectedSyncWrite | null;
  refreshUploadState(): Promise<void>;
  acknowledgeRejectedWrite(): Promise<void>;
  clearBeforeSignOut(): Promise<void>;
}
