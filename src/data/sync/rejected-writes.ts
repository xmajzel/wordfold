import type { AbstractPowerSyncDatabase } from '@powersync/react-native';

interface RejectedWriteRow {
  id: string;
  table_name: string;
  operation: string;
  error_code: string;
  safe_message: string;
  created_at: string;
}

export interface RejectedWriteGroup {
  id: string;
  tableName: string;
  operation: string;
  safeMessage: string;
  createdAt: string;
  similarCount: number;
  matchingIds: string[];
}

type RejectedWriteDatabase = Pick<AbstractPowerSyncDatabase, 'getAll' | 'execute'>;

export async function loadRejectedWriteGroup(database: RejectedWriteDatabase, userId: string): Promise<RejectedWriteGroup | null> {
  const rows = await database.getAll<RejectedWriteRow>(
    `SELECT id, table_name, operation, error_code, safe_message, created_at
     FROM sync_write_errors
     WHERE user_id = ? AND acknowledged_at IS NULL
     ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  const latest = rows[0];
  if (!latest) return null;

  const matchingIds = rows
    .filter((row) => row.error_code === latest.error_code && row.safe_message === latest.safe_message)
    .map((row) => row.id);
  return {
    id: latest.id,
    tableName: latest.table_name,
    operation: latest.operation,
    safeMessage: latest.safe_message,
    createdAt: latest.created_at,
    similarCount: matchingIds.length,
    matchingIds,
  };
}

export async function acknowledgeRejectedWriteGroup(
  database: RejectedWriteDatabase,
  userId: string,
  group: RejectedWriteGroup,
) {
  const acknowledgedAt = new Date().toISOString();
  for (let offset = 0; offset < group.matchingIds.length; offset += 400) {
    const ids = group.matchingIds.slice(offset, offset + 400);
    const placeholders = ids.map(() => '?').join(', ');
    await database.execute(
      `UPDATE sync_write_errors SET acknowledged_at = ?
       WHERE user_id = ? AND acknowledged_at IS NULL AND id IN (${placeholders})`,
      [acknowledgedAt, userId, ...ids],
    );
  }
}
