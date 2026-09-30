import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { nextGardenTree, summarizeGarden, type ProgressEvent, type GardenTree } from '@/features/progress/model';
import type { SyncRepositoryDatabase } from '@/data/sync/repository';

const HISTORY_SQL = `SELECT type, NULL AS value, MIN(occurred_at) AS occurred_at,
    COALESCE(practice_date, date(occurred_at)) AS practice_date, COUNT(*) AS action_count
  FROM learning_events WHERE type IN ('rating', 'game_answered', 'game_missed')
  GROUP BY type, COALESCE(practice_date, date(occurred_at))
  UNION ALL
  SELECT type, value, occurred_at, practice_date, 0 AS action_count
  FROM learning_events WHERE type = 'garden_tree'`;

// Same milestone on two offline devices has the same remote primary key.
export async function gardenTreeId(userId: string, ordinal: number) {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, `wordfold:garden:${userId}:${ordinal}`);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

export async function getGuestGardenProgress(database: SQLiteDatabase) {
  return summarizeGarden(await database.getAllAsync<ProgressEvent>(HISTORY_SQL));
}

export async function plantGuestGardenTree(database: SQLiteDatabase) {
  let planted: GardenTree | null = null;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const tree = nextGardenTree(await transaction.getAllAsync<ProgressEvent>(HISTORY_SQL));
    if (!tree) return;
    const result = await transaction.runAsync(
      `INSERT OR IGNORE INTO learning_events (word_id, type, value, occurred_at, practice_date)
       VALUES (NULL, 'garden_tree', ?, ?, ?)`, String(tree.ordinal), tree.plantedAt, tree.earnedOn,
    );
    if (result.changes > 0) planted = tree;
  });
  return planted;
}

export async function getSyncGardenProgress(database: SyncRepositoryDatabase) {
  return summarizeGarden(await database.getAll<ProgressEvent>(HISTORY_SQL));
}

export async function plantSyncGardenTree(database: SyncRepositoryDatabase, userId: string) {
  return database.writeTransaction(async (transaction) => {
    const tree = nextGardenTree(await transaction.getAll<ProgressEvent>(HISTORY_SQL));
    if (!tree) return null;
    await transaction.execute(
      `INSERT OR IGNORE INTO learning_events (id, user_id, word_id, type, value, occurred_at, practice_date)
       VALUES (?, ?, NULL, 'garden_tree', ?, ?, ?)`,
      [await gardenTreeId(userId, tree.ordinal), userId, String(tree.ordinal), tree.plantedAt, tree.earnedOn],
    );
    return tree;
  });
}
