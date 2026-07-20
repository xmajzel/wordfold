import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import { PowerSyncUploader } from './uploader';

export class SupabasePowerSyncConnector implements PowerSyncBackendConnector {
  private readonly uploader: PowerSyncUploader;

  constructor(
    private readonly client: SupabaseClient,
    private readonly endpoint: string,
  ) {
    this.uploader = new PowerSyncUploader(client, async () => {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data.session) throw new Error('The synchronization session has expired.');
      return data.session.user.id;
    });
  }

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (!data.session) return null;

    return {
      endpoint: this.endpoint,
      token: data.session.access_token,
      expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000) : undefined,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    await this.uploader.uploadNext(database);
  }
}
