export type AuthCallbackResult =
  | { type: 'unrelated' }
  | { type: 'session'; accessToken: string; refreshToken: string; recovery?: true }
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
  if (!parameters.has('error') && !parameters.has('error_code') && !parameters.has('access_token') && !parameters.has('refresh_token')) return { type: 'unrelated' };
  const callbackError = parameters.get('error_code') ?? parameters.get('error');
  if (callbackError) {
    return { type: 'error', message: 'This sign-in or password reset link has expired or is invalid. Request a new link.' };
  }

  const accessToken = parameters.get('access_token');
  const refreshToken = parameters.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return { type: 'error', message: 'This sign-in or password reset link is incomplete or has expired. Request a new link.' };
  }

  return { type: 'session', accessToken, refreshToken, ...(parameters.get('type') === 'recovery' ? { recovery: true as const } : {}) };
}
