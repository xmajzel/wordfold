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

    expect(result).toEqual({ type: 'error', message: 'This sign-in or password reset link has expired or is invalid. Request a new link.' });
    expect(JSON.stringify(result)).not.toContain('sensitive-provider-detail');
  });

  it('rejects an incomplete expected callback', () => {
    expect(parseAuthCallbackUrl('wordfold://account#access_token=access-only', redirect)).toEqual({
      type: 'error',
      message: 'This sign-in or password reset link is incomplete or has expired. Request a new link.',
    });
  });
});

it('recognizes a recovery link and ignores an ordinary account visit', () => {
  expect(parseAuthCallbackUrl('wordfold://account#type=recovery&access_token=a&refresh_token=r', 'wordfold://account')).toEqual({ type: 'session', accessToken: 'a', refreshToken: 'r', recovery: true });
  expect(parseAuthCallbackUrl('wordfold://account', 'wordfold://account')).toEqual({ type: 'unrelated' });
});
