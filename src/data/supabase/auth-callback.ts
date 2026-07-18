export type AuthCallbackResult =
  | { type: 'unrelated' }
  | { type: 'session'; accessToken: string; refreshToken: string }
  | { type: 'error'; message: string };

function normalizedTarget(url: URL) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.protocol}//${url.host}${path}`;
}

function callbackParameters(url: URL) {
  const parameters = new URLSearchParams(url.search);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  for (const [key, value] of new URLSearchParams(hash)) parameters.set(key, value);
  return parameters;
}

export function parseAuthCallbackUrl(value: string, expectedRedirectUrl: string): AuthCallbackResult {
  let url: URL;
  let expected: URL;
  try {
    url = new URL(value);
    expected = new URL(expectedRedirectUrl);
  } catch {
    return { type: 'unrelated' };
  }

  if (normalizedTarget(url) !== normalizedTarget(expected)) return { type: 'unrelated' };

  const parameters = callbackParameters(url);
  const callbackError = parameters.get('error_code') ?? parameters.get('error');
  if (callbackError) {
    return { type: 'error', message: 'The email confirmation link could not be completed. Please try signing in.' };
  }

  const accessToken = parameters.get('access_token');
  const refreshToken = parameters.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return { type: 'error', message: 'This confirmation link is incomplete or has expired. Please try signing in.' };
  }

  return { type: 'session', accessToken, refreshToken };
}
