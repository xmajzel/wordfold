import { useEffect, useMemo, useRef, type PropsWithChildren } from 'react';

import { clearPronunciationAccountCache, type PronunciationCacheScope } from '@/features/pronunciation/cache';
import { PronunciationCacheScopeContextProvider } from '@/features/pronunciation/cache-scope';
import { useAuth } from '@/providers/auth-provider';

export function PronunciationCacheScopeProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  const previousUserId = useRef<string | null>(null);
  const scope = useMemo<PronunciationCacheScope>(
    () => userId ? { type: 'account', userId } : { type: 'guest' },
    [userId],
  );

  useEffect(() => {
    const previous = previousUserId.current;
    previousUserId.current = userId;
    if (previous && previous !== userId) {
      void clearPronunciationAccountCache(previous).catch((error) => {
        console.warn('Could not clear the previous account pronunciation cache.', error);
      });
    }
  }, [userId]);

  return <PronunciationCacheScopeContextProvider scope={scope}>
    {children}
  </PronunciationCacheScopeContextProvider>;
}
