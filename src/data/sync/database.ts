import { PowerSyncDatabase } from '@powersync/react-native';

import { syncSchema } from './schema';

export const powerSyncDatabase = new PowerSyncDatabase({
  schema: syncSchema,
  database: { dbFilename: 'wordfold-sync.sqlite' },
});
