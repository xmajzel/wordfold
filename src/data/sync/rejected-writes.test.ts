import type { AbstractPowerSyncDatabase } from '@powersync/react-native';

import { acknowledgeRejectedWriteGroup, loadRejectedWriteGroup } from './rejected-writes';

const rows = [
  { id: 'newest', table_name: 'words', operation: 'PATCH', error_code: '22000', safe_message: 'Already removed', created_at: '2026-09-25T10:00:03.000Z' },
  { id: 'different', table_name: 'words', operation: 'PATCH', error_code: '42501', safe_message: 'Already removed', created_at: '2026-09-25T10:00:02.000Z' },
  { id: 'matching', table_name: 'collections', operation: 'PATCH', error_code: '22000', safe_message: 'Already removed', created_at: '2026-09-25T10:00:01.000Z' },
];

function setup() {
  const getAll = jest.fn(async (_sql: string, _parameters: unknown[]) => rows);
  const execute = jest.fn(async (_sql: string, _parameters: unknown[]) => undefined);
  const database = { getAll, execute } as unknown as AbstractPowerSyncDatabase;
  return { database, getAll, execute };
}

describe('rejected write notices', () => {
  it('groups only identical pending notices for the signed-in account', async () => {
    const { database, getAll } = setup();

    const group = await loadRejectedWriteGroup(database, 'current-user');

    expect(getAll).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = ? AND acknowledged_at IS NULL'),
      ['current-user'],
    );
    expect(group).toEqual({
      id: 'newest', tableName: 'words', operation: 'PATCH', safeMessage: 'Already removed',
      createdAt: '2026-09-25T10:00:03.000Z', similarCount: 2, matchingIds: ['newest', 'matching'],
    });
  });

  it('acknowledges exactly the matching notices shown, leaving different and newer notices alone', async () => {
    const { database, execute } = setup();
    const group = await loadRejectedWriteGroup(database, 'current-user');
    expect(group).not.toBeNull();

    await acknowledgeRejectedWriteGroup(database, 'current-user', group!);

    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, parameters] = execute.mock.calls[0];
    expect(sql).toContain('WHERE user_id = ? AND acknowledged_at IS NULL AND id IN (?, ?)');
    expect(parameters.slice(1)).toEqual(['current-user', 'newest', 'matching']);
    expect(parameters).not.toContain('different');
  });

  it('does not hide a database failure', async () => {
    const { database, execute } = setup();
    execute.mockRejectedValueOnce(new Error('database unavailable'));
    const group = await loadRejectedWriteGroup(database, 'current-user');

    await expect(acknowledgeRejectedWriteGroup(database, 'current-user', group!))
      .rejects.toThrow('database unavailable');
  });
});
