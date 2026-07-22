import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { getCefrEntries, getCefrEntry } from '@/data/cefr-catalog';
import { cefrLevels } from '@/data/cefr-levels';
import type { CefrLevel } from '@/domain/types';
import type { NeuralPronunciationLocale } from '@/features/pronunciation/cloud';
import {
  fetchOfflineManifestIndex,
  fetchOfflineManifestShard,
} from '@/features/pronunciation/offline-manifest';
import {
  buildOfflinePackPlan,
  downloadOfflinePack,
  inspectOfflinePack,
  offlineAvailableDiskSpace,
  OFFLINE_DOWNLOAD_DISK_RESERVE_BYTES,
  removeOfflineLocale,
  removeOfflinePack,
  type OfflinePackInspection,
  type OfflinePackPlan,
} from '@/features/pronunciation/offline-store';

export const OFFLINE_PRONUNCIATION_LOCALES = ['en-US', 'en-GB'] as const;

export type OfflinePackViewState = Omit<OfflinePackInspection, 'plan' | 'availableCatalogSenseIds'>;

export type OfflineDownloadJob = {
  locale: NeuralPronunciationLocale;
  levels: CefrLevel[];
  currentLevel: CefrLevel;
  stage: 'preparing' | 'verifying' | 'downloading' | 'cancelling';
  assetCount: number;
  totalBytes: number;
  completedCount: number;
  completedBytes: number;
};

type OfflineDownloadsContextValue = {
  packs: Record<string, OfflinePackViewState>;
  preparing: boolean;
  preparationError: string | null;
  availableDiskBytes: number | null;
  job: OfflineDownloadJob | null;
  prepareManifests(): Promise<void>;
  downloadLevel(locale: NeuralPronunciationLocale, level: CefrLevel): Promise<void>;
  downloadLocale(locale: NeuralPronunciationLocale): Promise<void>;
  cancelDownload(): void;
  removeLevel(locale: NeuralPronunciationLocale, level: CefrLevel): Promise<void>;
  removeLocale(locale: NeuralPronunciationLocale): Promise<void>;
  hasAsset(catalogSenseId: string, locale: NeuralPronunciationLocale): boolean;
};

const OfflineDownloadsContext = createContext<OfflineDownloadsContextValue | null>(null);

export function offlinePackKey(locale: NeuralPronunciationLocale, level: CefrLevel) {
  return `${locale}:${level}`;
}

function emptyPacks() {
  return Object.fromEntries(OFFLINE_PRONUNCIATION_LOCALES.flatMap((locale) => (
    cefrLevels.map((level) => [offlinePackKey(locale, level), {
      locale,
      level,
      state: 'not_downloaded' as const,
      assetCount: getCefrEntries(level).length,
      totalAudioBytes: null,
      downloadedCount: 0,
      downloadedBytes: 0,
    }])
  )));
}

function viewState(inspection: OfflinePackInspection): OfflinePackViewState {
  const { plan: _plan, availableCatalogSenseIds: _available, ...view } = inspection;
  return view;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Offline pronunciation could not be prepared.';
}

export function OfflinePronunciationDownloadsProvider({ children }: { children: ReactNode }) {
  const [packs, setPacks] = useState<Record<string, OfflinePackViewState>>(emptyPacks);
  const [preparing, setPreparing] = useState(false);
  const [preparationError, setPreparationError] = useState<string | null>(null);
  const [availableDiskBytes, setAvailableDiskBytes] = useState<number | null>(null);
  const [job, setJob] = useState<OfflineDownloadJob | null>(null);
  const inspectionsRef = useRef(new Map<string, OfflinePackInspection>());
  const plansRef = useRef(new Map<string, OfflinePackPlan>());
  const preparationPromiseRef = useRef<Promise<void> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const applyInspection = useCallback((inspection: OfflinePackInspection) => {
    const key = offlinePackKey(inspection.locale, inspection.level);
    inspectionsRef.current.set(key, inspection);
    if (inspection.plan) plansRef.current.set(key, inspection.plan);
    const knownPlan = inspection.plan ?? plansRef.current.get(key);
    setPacks((current) => ({
      ...current,
      [key]: {
        ...viewState(inspection),
        assetCount: knownPlan?.assetCount ?? inspection.assetCount,
        totalAudioBytes: inspection.totalAudioBytes ?? knownPlan?.totalAudioBytes ?? null,
      },
    }));
  }, []);

  const refreshPack = useCallback(async (locale: NeuralPronunciationLocale, level: CefrLevel) => {
    const inspection = await inspectOfflinePack(locale, level);
    applyInspection(inspection);
    return inspection;
  }, [applyInspection]);

  const refreshInstalled = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const inspections = await Promise.all(OFFLINE_PRONUNCIATION_LOCALES.flatMap((locale) => (
      cefrLevels.map((level) => inspectOfflinePack(locale, level))
    )));
    for (const inspection of inspections) applyInspection(inspection);
    setAvailableDiskBytes(offlineAvailableDiskSpace());
  }, [applyInspection]);

  useEffect(() => {
    const timeout = setTimeout(() => void refreshInstalled().catch(() => undefined), 0);
    return () => clearTimeout(timeout);
  }, [refreshInstalled]);

  const prepareManifests = useCallback(async () => {
    if (Platform.OS === 'web') return;
    if (preparationPromiseRef.current) return preparationPromiseRef.current;
    const operation = (async () => {
      setPreparing(true);
      setPreparationError(null);
      try {
        const index = await fetchOfflineManifestIndex();
        const shards = await Promise.all(OFFLINE_PRONUNCIATION_LOCALES.map(async (locale) => ({
          locale,
          shard: await fetchOfflineManifestShard(index, locale),
          sha256: index.shards[locale].sha256,
        })));
        for (const { locale, shard, sha256 } of shards) {
          for (const level of cefrLevels) {
            const key = offlinePackKey(locale, level);
            const plan = buildOfflinePackPlan(shard, level, sha256);
            plansRef.current.set(key, plan);
            setPacks((current) => ({
              ...current,
              [key]: {
                ...(current[key] ?? viewState({
                  locale,
                  level,
                  state: 'not_downloaded',
                  assetCount: plan.assetCount,
                  totalAudioBytes: plan.totalAudioBytes,
                  downloadedCount: 0,
                  downloadedBytes: 0,
                  availableCatalogSenseIds: [],
                  plan: null,
                })),
                assetCount: plan.assetCount,
                totalAudioBytes: plan.totalAudioBytes,
              },
            }));
          }
        }
      } catch (error) {
        setPreparationError(errorMessage(error));
        throw error;
      } finally {
        setAvailableDiskBytes(offlineAvailableDiskSpace());
        setPreparing(false);
        preparationPromiseRef.current = null;
      }
    })();
    preparationPromiseRef.current = operation;
    return operation;
  }, []);

  const ensurePlans = useCallback(async (
    locale: NeuralPronunciationLocale,
    levels: CefrLevel[],
  ) => {
    if (levels.some((level) => !plansRef.current.has(offlinePackKey(locale, level)))) {
      await prepareManifests();
    }
    return levels.map((level) => {
      const plan = plansRef.current.get(offlinePackKey(locale, level));
      if (!plan) throw new Error(`The ${locale} ${level} pronunciation pack is unavailable.`);
      return plan;
    });
  }, [prepareManifests]);

  const runDownload = useCallback(async (
    locale: NeuralPronunciationLocale,
    levels: CefrLevel[],
  ) => {
    if (Platform.OS === 'web') throw new Error('Offline pronunciation downloads require Android or iOS.');
    if (controllerRef.current) throw new Error('Another pronunciation download is already running.');
    const controller = new AbortController();
    controllerRef.current = controller;
    let currentLevel = levels[0];
    try {
      setJob({
        locale,
        levels,
        currentLevel,
        stage: 'preparing',
        assetCount: 0,
        totalBytes: 0,
        completedCount: 0,
        completedBytes: 0,
      });
      const plans = await ensurePlans(locale, levels);
      const inspections = await Promise.all(levels.map((level) => refreshPack(locale, level)));
      const remainingBytes = plans.reduce((total, plan, index) => (
        total + Math.max(0, plan.totalAudioBytes - inspections[index].downloadedBytes)
      ), 0);
      if (remainingBytes > 0
        && offlineAvailableDiskSpace() < remainingBytes + OFFLINE_DOWNLOAD_DISK_RESERVE_BYTES) {
        throw new Error('Not enough free device storage for this pronunciation download.');
      }
      const assetCount = plans.reduce((total, plan) => total + plan.assetCount, 0);
      const totalBytes = plans.reduce((total, plan) => total + plan.totalAudioBytes, 0);
      let completedBefore = 0;
      let bytesBefore = 0;
      for (const plan of plans) {
        currentLevel = plan.level;
        await downloadOfflinePack(plan, {
          signal: controller.signal,
          onProgress: (progress) => setJob((current) => current ? {
            ...current,
            currentLevel,
            stage: progress.stage,
            assetCount,
            totalBytes,
            completedCount: completedBefore + progress.completedCount,
            completedBytes: bytesBefore + progress.completedBytes,
          } : current),
        });
        completedBefore += plan.assetCount;
        bytesBefore += plan.totalAudioBytes;
        await refreshPack(locale, plan.level);
      }
    } catch (error) {
      if (!controller.signal.aborted
        && !(error instanceof Error && error.name === 'AbortError')) throw error;
    } finally {
      controllerRef.current = null;
      setJob(null);
      await Promise.all(levels.map((level) => refreshPack(locale, level))).catch(() => undefined);
      setAvailableDiskBytes(offlineAvailableDiskSpace());
    }
  }, [ensurePlans, refreshPack]);

  const downloadLevel = useCallback((locale: NeuralPronunciationLocale, level: CefrLevel) => (
    runDownload(locale, [level])
  ), [runDownload]);

  const downloadLocale = useCallback((locale: NeuralPronunciationLocale) => (
    runDownload(locale, [...cefrLevels])
  ), [runDownload]);

  const cancelDownload = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    setJob((current) => current ? { ...current, stage: 'cancelling' } : current);
    controller.abort();
  }, []);

  const removeLevel = useCallback(async (
    locale: NeuralPronunciationLocale,
    level: CefrLevel,
  ) => {
    if (controllerRef.current) throw new Error('Cancel the active pronunciation download first.');
    removeOfflinePack(locale, level);
    await refreshPack(locale, level);
    setAvailableDiskBytes(offlineAvailableDiskSpace());
  }, [refreshPack]);

  const removeLocale = useCallback(async (locale: NeuralPronunciationLocale) => {
    if (controllerRef.current) throw new Error('Cancel the active pronunciation download first.');
    removeOfflineLocale(locale);
    await Promise.all(cefrLevels.map((level) => refreshPack(locale, level)));
    setAvailableDiskBytes(offlineAvailableDiskSpace());
  }, [refreshPack]);

  const hasAsset = useCallback((catalogSenseId: string, locale: NeuralPronunciationLocale) => {
    const entry = getCefrEntry(catalogSenseId);
    if (!entry) return false;
    return inspectionsRef.current
      .get(offlinePackKey(locale, entry.level))
      ?.availableCatalogSenseIds.includes(catalogSenseId) ?? false;
  }, []);

  const value = useMemo<OfflineDownloadsContextValue>(() => ({
    packs,
    preparing,
    preparationError,
    availableDiskBytes,
    job,
    prepareManifests,
    downloadLevel,
    downloadLocale,
    cancelDownload,
    removeLevel,
    removeLocale,
    hasAsset,
  }), [
    packs, preparing, preparationError, availableDiskBytes, job, prepareManifests, downloadLevel,
    downloadLocale, cancelDownload, removeLevel, removeLocale, hasAsset,
  ]);

  return <OfflineDownloadsContext.Provider value={value}>
    {children}
  </OfflineDownloadsContext.Provider>;
}

export function useOfflinePronunciationDownloads() {
  const value = useContext(OfflineDownloadsContext);
  if (!value) throw new Error('Offline pronunciation downloads are not available outside their provider.');
  return value;
}
