import { readPowerSyncConfiguration } from './config';

describe('PowerSync configuration', () => {
  it('accepts a replaceable HTTPS endpoint and removes trailing slashes', () => {
    expect(readPowerSyncConfiguration(' https://sync.example.com/// ')).toEqual({
      configuration: { endpoint: 'https://sync.example.com' },
      error: null,
    });
  });

  it('allows local HTTP development endpoints', () => {
    expect(readPowerSyncConfiguration('http://127.0.0.1:8080').configuration).toEqual({
      endpoint: 'http://127.0.0.1:8080',
    });
  });

  it('rejects missing, invalid, and insecure remote endpoints', () => {
    expect(readPowerSyncConfiguration(undefined).configuration).toBeNull();
    expect(readPowerSyncConfiguration('not a URL').configuration).toBeNull();
    expect(readPowerSyncConfiguration('http://sync.example.com').configuration).toBeNull();
  });
});
