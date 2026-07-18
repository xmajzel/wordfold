import { parseAuthCallbackUrl } from './auth-callback';

describe('parseAuthCallbackUrl', () => {
  const redirect = 'wordfold://account';

  it('extracts a session from the expected confirmation callback', () => {
    expect(parseAuthCallbackUrl('wordfold://account#access_token=access-secret&refresh_token=refresh-secret', redirect)).toEqual({
      type: 'session',
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
    });
  });

  it('ignores URLs outside the account callback', () => {
    expect(parseAuthCallbackUrl('wordfold://word/123#access_token=secret&refresh_token=secret', redirect)).toEqual({ type: 'unrelated' });
  });

  it('returns a safe error without exposing callback details', () => {
    const result = parseAuthCallbackUrl('wordfold://account#error=access_denied&error_description=sensitive-provider-detail', redirect);

    expect(result).toEqual({ type: 'error', message: 'The email confirmation link could not be completed. Please try signing in.' });
    expect(JSON.stringify(result)).not.toContain('sensitive-provider-detail');
  });

  it('rejects an incomplete expected callback', () => {
    expect(parseAuthCallbackUrl('wordfold://account#access_token=access-only', redirect)).toEqual({
      type: 'error',
      message: 'This confirmation link is incomplete or has expired. Please try signing in.',
    });
  });
});
