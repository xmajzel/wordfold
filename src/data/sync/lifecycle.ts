interface SyncLifecycleDatabase {
  connect(connector: unknown): Promise<void>;
  disconnectAndClear(): Promise<void>;
}

export function createSyncLifecycle(database: SyncLifecycleDatabase, connector: unknown | null) {
  let activeUserId: string | null | undefined;
  let tail: Promise<void> = Promise.resolve();

  const enqueue = (operation: () => Promise<void>) => {
    const result = tail.then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    transitionTo(userId: string | null) {
      return enqueue(async () => {
        if (activeUserId === userId) return;

        if (userId === null || activeUserId !== undefined) {
          await database.disconnectAndClear();
        }

        if (userId !== null && connector) {
          await database.connect(connector);
        }
        activeUserId = userId;
      });
    },

    clearBeforeSignOut() {
      return enqueue(async () => {
        await database.disconnectAndClear();
        activeUserId = null;
      });
    },
  };
}
