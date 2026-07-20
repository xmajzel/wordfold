import { createContext, useContext, type PropsWithChildren } from 'react';

import type { PronunciationCacheScope } from '@/features/pronunciation/cache';

const PronunciationCacheScopeContext = createContext<PronunciationCacheScope>({ type: 'guest' });

export function PronunciationCacheScopeContextProvider({ children, scope }: PropsWithChildren<{
  scope: PronunciationCacheScope;
}>) {
  return <PronunciationCacheScopeContext.Provider value={scope}>
    {children}
  </PronunciationCacheScopeContext.Provider>;
}

export function usePronunciationCacheScope() {
  return useContext(PronunciationCacheScopeContext);
}
