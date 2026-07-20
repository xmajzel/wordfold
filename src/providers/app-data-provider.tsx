import { createContext, PropsWithChildren, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import type { CatalogSense, Collection, DashboardStats, LearningFilter, LearningPreferences, LearningRating, LearningState, ReminderSettings, Word } from '@/domain/types';
import { lookupSenses } from '@/data/catalog';
import { getCefrTranslation } from '@/data/cefr-catalog';
import { migrateDatabase } from '@/data/database';
import * as repository from '@/data/repository';
import { GuestImportCancelledError, GuestImportService } from '@/data/sync/guest-import';
import { SupabaseGuestImportRemote } from '@/data/sync/guest-import-remote';
import { SyncCutoverCancelledError, SyncCutoverService } from '@/data/sync/cutover';
import type { SyncCutoverViewModel } from '@/data/sync/cutover-types';
import { powerSyncDatabase } from '@/data/sync/database';
import { emptyGuestImportCounts, type GuestImportConflictResolution, type GuestImportViewModel } from '@/data/sync/guest-import-types';
import { supabase } from '@/data/supabase/client';
import { createGuestVocabularyStore, createSyncVocabularyStore } from '@/data/vocabulary-store';
import { applyRating } from '@/features/learning/algorithm';
import { createSerialMutationQueue } from '@/features/learning/mutation-queue';
import { translateEnglishToSlovak } from '@/features/translation/translator';
import { buildRecommendations, normalizeLearningPreferences, type Recommendation } from '@/features/recommendations/selector';
import { clearScheduledReminders, rebuildReminderSchedule } from '@/features/reminders/scheduler';
import { LaunchScreen } from '@/components/launch-screen';
import { useAuth } from '@/providers/auth-provider';
import { useSync } from '@/providers/sync-provider';

interface AppDataValue {
  dataSource: 'loading' | 'guest' | 'reconciling' | 'synced';
  words: Word[];
  collections: Collection[];
  stats: DashboardStats | null;
  reminderSettings: ReminderSettings | null;
  learningPreferences: LearningPreferences;
  learningFilter: LearningFilter;
  onboardingComplete: boolean | null;
  refresh(): Promise<void>;
  findSenses(term: string): Promise<CatalogSense[]>;
  createWord(input: repository.NewWordInput): Promise<string>;
  createWords(inputs: repository.NewWordInput[]): Promise<string[]>;
  editWord(id: string, input: repository.NewWordInput): Promise<void>;
  saveWordTranslation(id: string, translation: string): Promise<void>;
  prepareWordTranslation(word: Word): Promise<void>;
  removeWord(id: string): Promise<void>;
  resetWord(id: string): Promise<void>;
  createCollection(name: string, color: string): Promise<string>;
  rateWord(word: Word, rating: LearningRating): Promise<void>;
  markViewed(id: string): Promise<void>;
  updateReminderSettings(settings: ReminderSettings): Promise<number>;
  updateLearningFilter(filter: LearningFilter): Promise<void>;
  saveLearningPreferences(preferences: LearningPreferences): Promise<void>;
  completePersonalizedOnboarding(preferences: LearningPreferences): Promise<number>;
  addRecommendedWords(limit?: number): Promise<number>;
  noteNotificationOpen(wordId: string | null): Promise<void>;
  guestImport: GuestImportViewModel;
  prepareGuestImport(): Promise<void>;
  resolveGuestImportConflict(localWordId: string, resolution: GuestImportConflictResolution): Promise<void>;
  runGuestImport(): Promise<void>;
  refreshGuestImport(): Promise<void>;
  pauseGuestImport(): Promise<void>;
  cutover: SyncCutoverViewModel;
  runSyncCutover(): Promise<void>;
  resolveSyncCutoverConflict(localWordId: string, resolution: GuestImportConflictResolution): Promise<void>;
  keepAccountRename(localWordId: string): Promise<void>;
  prepareForSignOut(): Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

const stateStatKeys: Record<LearningState, keyof Pick<DashboardStats,
  'newWords' | 'difficultWords' | 'understoodWords' | 'learnedWords'>> = {
  new: 'newWords',
  cannot_remember: 'difficultWords',
  understood: 'understoodWords',
  learned: 'learnedWords',
};

function updateRatingStats(stats: DashboardStats | null, previous: LearningState, next: LearningState) {
  if (!stats || previous === next) return stats;
  const previousKey = stateStatKeys[previous];
  const nextKey = stateStatKeys[next];
  return { ...stats, [previousKey]: Math.max(0, stats[previousKey] - 1), [nextKey]: stats[nextKey] + 1 };
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getBundledWordTranslation(word: Word) {
  return getCefrTranslation(word.catalogSenseId, word.cefrLevel ? word.normalizedTerm : null);
}

function recommendationsToInputs(recommendations: Recommendation[]): repository.NewWordInput[] {
  return recommendations.map(({ entry, topic }) => ({
    collectionId: 'my-words',
    term: entry.term,
    normalizedTerm: entry.normalizedTerm,
    definition: entry.definition,
    example: entry.example,
    translation: entry.translation,
    partOfSpeech: entry.partOfSpeech,
    catalogSenseId: entry.catalogSenseId,
    cefrLevel: entry.level,
    source: topic ?? 'manual',
  }));
}

function AppDataStateProvider({ appDatabase, catalogDatabase, children }: PropsWithChildren<{
  appDatabase: SQLiteDatabase;
  catalogDatabase: SQLiteDatabase;
}>) {
  const auth = useAuth();
  const sync = useSync();
  const authStatus = auth.status;
  const authUserId = auth.user?.id;
  const syncPhase = sync.phase;
  const syncHasSynced = sync.hasSynced;
  const [words, setWords] = useState<Word[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings | null>(null);
  const [learningPreferences, setLearningPreferences] = useState<LearningPreferences>({ levels: [], topics: [] });
  const [learningFilter, setLearningFilter] = useState<LearningFilter>('all');
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [guestImport, setGuestImport] = useState<GuestImportViewModel>({
    phase: 'loading', totals: emptyGuestImportCounts, uploaded: emptyGuestImportCounts,
    conflicts: [], message: null,
  });
  const [dataSource, setDataSource] = useState<AppDataValue['dataSource']>('loading');
  const [cutover, setCutover] = useState<SyncCutoverViewModel>({
    phase: 'checking', totals: emptyGuestImportCounts, uploaded: emptyGuestImportCounts,
    conflicts: [], message: null,
  });
  const [guestImportService] = useState(() => supabase
    ? new GuestImportService(appDatabase, new SupabaseGuestImportRemote(supabase), powerSyncDatabase)
    : null);
  const [cutoverService] = useState(() => supabase
    ? new SyncCutoverService(appDatabase, new SupabaseGuestImportRemote(supabase), powerSyncDatabase)
    : null);
  const [databaseMutationQueue] = useState(createSerialMutationQueue);
  const [translationQueue] = useState(createSerialMutationQueue);
  const translationTasks = useRef(new Map<string, Promise<void>>());
  const backgroundTranslationAttempts = useRef(new Set<string>());
  const lastScheduleDay = useRef<string | null>(null);
  const automaticCutover = useRef<string | null>(null);

  const vocabularyStore = useMemo(() => dataSource === 'synced' && authUserId
    ? createSyncVocabularyStore(powerSyncDatabase, authUserId)
    : createGuestVocabularyStore(appDatabase), [appDatabase, authUserId, dataSource]);

  const runDatabaseMutation = useCallback(<T,>(mutation: () => Promise<T>) => (
    databaseMutationQueue.run(mutation)
  ), [databaseMutationQueue]);

  const refreshGuestImport = useCallback(async () => {
    if (authStatus !== 'signedIn' || !authUserId || !guestImportService) {
      setGuestImport({
        phase: 'unavailable', totals: emptyGuestImportCounts, uploaded: emptyGuestImportCounts,
        conflicts: [], message: null,
      });
      return;
    }
    try {
      setGuestImport(await guestImportService.getViewModel(authUserId));
    } catch {
      setGuestImport((current) => ({
        ...current,
        phase: 'error',
        message: 'Import status could not be refreshed. Connect to synchronization and try again.',
      }));
    }
  }, [authStatus, authUserId, guestImportService]);

  const requireImportReady = useCallback(() => {
    if (authStatus !== 'signedIn' || !authUserId || !guestImportService) {
      throw new Error('Sign in before importing device vocabulary.');
    }
    if (syncPhase !== 'connected') {
      throw new Error('PowerSync must finish connecting before device vocabulary can be imported.');
    }
    return { accountId: authUserId, service: guestImportService };
  }, [authStatus, authUserId, guestImportService, syncPhase]);

  const prepareGuestImport = useCallback(async () => {
    const { accountId, service } = requireImportReady();
    const view = await runDatabaseMutation(() => service.prepare(accountId));
    setGuestImport(view);
  }, [requireImportReady, runDatabaseMutation]);

  const resolveGuestImportConflict = useCallback(async (
    localWordId: string,
    resolution: GuestImportConflictResolution,
  ) => {
    const { accountId, service } = requireImportReady();
    const view = await runDatabaseMutation(() => service.resolveConflict(accountId, localWordId, resolution));
    setGuestImport(view);
  }, [requireImportReady, runDatabaseMutation]);

  const runGuestImport = useCallback(async () => {
    const { accountId, service } = requireImportReady();
    try {
      const view = await runDatabaseMutation(() => service.run(accountId, setGuestImport));
      setGuestImport(view);
    } catch (error) {
      if (!(error instanceof GuestImportCancelledError)) throw error;
      await refreshGuestImport();
    }
  }, [refreshGuestImport, requireImportReady, runDatabaseMutation]);

  const pauseGuestImport = useCallback(async () => {
    await guestImportService?.cancelAndWait();
  }, [guestImportService]);

  const requireCutoverReady = useCallback(() => {
    if (authStatus !== 'signedIn' || !authUserId || !cutoverService) {
      throw new Error('Sign in before preparing synchronized vocabulary.');
    }
    if (syncPhase !== 'connected' || !syncHasSynced) {
      throw new Error('PowerSync must finish connecting before synchronization can be prepared.');
    }
    return { accountId: authUserId, service: cutoverService };
  }, [authStatus, authUserId, cutoverService, syncHasSynced, syncPhase]);

  const applyCutoverView = useCallback((view: SyncCutoverViewModel) => {
    setCutover(view);
    setDataSource(view.phase === 'ready' ? 'synced' : view.phase === 'waiting_import' ? 'guest' : 'reconciling');
  }, []);

  const runSyncCutover = useCallback(async () => {
    const { accountId, service } = requireCutoverReady();
    setDataSource('reconciling');
    try {
      let view = await runDatabaseMutation(() => service.run(accountId, setCutover));
      for (let recheck = 0; view.phase === 'checking' && recheck < 2; recheck += 1) {
        view = await runDatabaseMutation(() => service.run(accountId, setCutover));
      }
      applyCutoverView(view);
    } catch (error) {
      if (!(error instanceof SyncCutoverCancelledError)) throw error;
      applyCutoverView(await service.getViewModel(accountId));
    }
  }, [applyCutoverView, requireCutoverReady, runDatabaseMutation]);

  const resolveSyncCutoverConflict = useCallback(async (
    localWordId: string,
    resolution: GuestImportConflictResolution,
  ) => {
    const { accountId, service } = requireCutoverReady();
    const view = await runDatabaseMutation(() => service.resolveConflict(accountId, localWordId, resolution));
    applyCutoverView(view);
  }, [applyCutoverView, requireCutoverReady, runDatabaseMutation]);

  const keepAccountRename = useCallback(async (localWordId: string) => {
    const { accountId, service } = requireCutoverReady();
    const view = await runDatabaseMutation(() => service.keepAccountRename(accountId, localWordId));
    applyCutoverView(view);
  }, [applyCutoverView, requireCutoverReady, runDatabaseMutation]);

  useEffect(() => {
    let active = true;
    if (authStatus !== 'signedIn' || !authUserId || !cutoverService) {
      automaticCutover.current = null;
      void Promise.resolve().then(() => { if (active) setDataSource('guest'); });
      return () => { active = false; };
    }
    void cutoverService.getViewModel(authUserId).then((view) => {
      if (!active) return;
      applyCutoverView(view);
      if (view.phase === 'ready' || syncPhase !== 'connected' || !syncHasSynced) return;
      const key = `${authUserId}:${guestImport.phase}:${view.phase}`;
      if (automaticCutover.current === key) return;
      automaticCutover.current = key;
      void runSyncCutover().catch((error) => console.warn('Could not prepare synchronized vocabulary.', error));
    }).catch(() => {
      if (active) setDataSource('guest');
    });
    return () => { active = false; };
  }, [applyCutoverView, authStatus, authUserId, cutoverService, guestImport.phase, runSyncCutover, syncHasSynced, syncPhase]);

  const prepareForSignOut = useCallback(async () => {
    await guestImportService?.cancelAndWait();
    await cutoverService?.cancelAndWait();
    await clearScheduledReminders(appDatabase);
  }, [appDatabase, cutoverService, guestImportService]);

  const refresh = useCallback(async () => {
    const [loadedWords, nextCollections, nextStats, nextSettings, nextPreferences, nextOnboarding, nextLearningFilter] = await Promise.all([
      vocabularyStore.listWords(), vocabularyStore.listCollections(), vocabularyStore.getStats(),
      repository.getReminderSettings(appDatabase), repository.getLearningPreferences(appDatabase),
      repository.isOnboardingComplete(appDatabase), repository.getLearningFilter(appDatabase),
    ]);
    const translationUpdates = loadedWords.flatMap((word) => {
      if (word.translation) return [];
      const translation = getBundledWordTranslation(word);
      return translation ? [{ id: word.id, translation }] : [];
    });
    const translationBackfill = await runDatabaseMutation(
      () => vocabularyStore.updateMissingWordTranslations(translationUpdates),
    );
    const updatedIds = new Set(translationBackfill.updatedIds);
    const updatedTranslations = new Map(translationUpdates
      .filter((update) => updatedIds.has(update.id))
      .map((update) => [update.id, update.translation]));
    const synchronizedWords = translationUpdates.length === updatedIds.size
      ? loadedWords
      : await vocabularyStore.listWords();
    const backfillUpdatedAt = translationBackfill.updatedAt;
    const nextWords = backfillUpdatedAt ? synchronizedWords.map((word) => {
      const translation = updatedTranslations.get(word.id);
      return translation ? { ...word, translation, updatedAt: backfillUpdatedAt } : word;
    }) : synchronizedWords;
    setWords(nextWords);
    setCollections(nextCollections);
    setStats(nextStats);
    setReminderSettings(nextSettings);
    setLearningPreferences(nextPreferences);
    setOnboardingComplete(nextOnboarding);
    setLearningFilter(nextLearningFilter);
  }, [appDatabase, runDatabaseMutation, vocabularyStore]);

  const prepareWordTranslation = useCallback((word: Word) => {
    if (word.translation) return Promise.resolve();
    const existingTask = translationTasks.current.get(word.id);
    if (existingTask) return existingTask;
    const task = translationQueue.run(async () => {
      const currentWord = await vocabularyStore.getWord(word.id) ?? word;
      if (currentWord.translation) return;
      const bundledTranslation = getBundledWordTranslation(currentWord);
      const translated = bundledTranslation ?? (await translateEnglishToSlovak(currentWord.term)).trim();
      if (!translated) throw new Error('Translation returned no text.');
      const updatedAt = await runDatabaseMutation(
        () => vocabularyStore.saveWordTranslation(currentWord.id, translated),
      );
      setWords((current) => current.map((item) => item.id === currentWord.id && !item.translation
        ? { ...item, translation: translated, updatedAt }
        : item));
    }).finally(() => {
      translationTasks.current.delete(word.id);
    });
    translationTasks.current.set(word.id, task);
    return task;
  }, [runDatabaseMutation, translationQueue, vocabularyStore]);

  useEffect(() => {
    for (const word of words) {
      if (word.translation || getBundledWordTranslation(word)
        || backgroundTranslationAttempts.current.has(word.id)) continue;
      backgroundTranslationAttempts.current.add(word.id);
      void prepareWordTranslation(word).catch((error) => {
        console.warn(`Could not prepare a Slovak hint for ${word.term}.`, error);
      });
    }
  }, [prepareWordTranslation, words]);

  useEffect(() => {
    // The async refresh resolves after the effect body, so this does not cascade a synchronous render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch((error) => console.warn('Could not refresh app data.', error));
  }, [refresh]);

  useEffect(() => vocabularyStore.subscribe(() => {
    void refresh().catch((error) => console.warn('Could not refresh synchronized app data.', error));
  }), [refresh, vocabularyStore]);

  useEffect(() => {
    // The local import journal is restored after auth changes; conflict details require connectivity.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshGuestImport();
  }, [refreshGuestImport, syncHasSynced, syncPhase]);

  const reschedule = useCallback(async (nextWords?: Word[], nextSettings?: ReminderSettings) => {
    return runDatabaseMutation(async () => {
      const scheduleWords = nextWords ?? await vocabularyStore.listWords();
      const scheduleSettings = nextSettings ?? await repository.getReminderSettings(appDatabase);
      return rebuildReminderSchedule(appDatabase, scheduleWords, scheduleSettings);
    });
  }, [appDatabase, runDatabaseMutation, vocabularyStore]);

  const refreshReminderSchedule = useCallback(async (force = false) => {
    const settings = await repository.getReminderSettings(appDatabase);
    const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
    const scheduleDay = `${currentTimeZone}:${localDateKey(new Date())}`;
    if (!force && settings.timeZoneId === currentTimeZone && lastScheduleDay.current === scheduleDay) return;
    const nextSettings = settings.timeZoneId === currentTimeZone
      ? settings
      : { ...settings, timeZoneId: currentTimeZone };
    if (nextSettings !== settings) {
      await runDatabaseMutation(() => repository.saveReminderSettings(appDatabase, nextSettings));
      setReminderSettings(nextSettings);
    }
    await reschedule(undefined, nextSettings);
    lastScheduleDay.current = scheduleDay;
  }, [appDatabase, reschedule, runDatabaseMutation]);

  useEffect(() => {
    // The async database reads complete before any provider state is refreshed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshReminderSchedule(true).catch((error) => console.warn('Could not refresh reminder schedule.', error));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshReminderSchedule().catch((error) => console.warn('Could not refresh reminder schedule.', error));
      }
    });
    return () => subscription.remove();
  }, [refreshReminderSchedule]);

  const value = useMemo<AppDataValue>(() => ({
    dataSource, words, collections, stats, reminderSettings, learningPreferences, learningFilter, onboardingComplete, refresh,
    guestImport, prepareGuestImport, resolveGuestImportConflict, runGuestImport, refreshGuestImport, pauseGuestImport,
    cutover, runSyncCutover, resolveSyncCutoverConflict, keepAccountRename, prepareForSignOut,
    findSenses: (term) => lookupSenses(catalogDatabase, term),
    createWord: async (input) => {
      const id = await runDatabaseMutation(() => vocabularyStore.createWord(input));
      await refresh(); await reschedule(); return id;
    },
    createWords: async (inputs) => {
      const ids = await runDatabaseMutation(() => vocabularyStore.createWords(inputs));
      await refresh(); await reschedule(); return ids;
    },
    editWord: async (id, input) => {
      await runDatabaseMutation(() => vocabularyStore.editWord(id, input)); await refresh(); await reschedule();
    },
    saveWordTranslation: async (id, translation) => {
      const nextTranslation = translation.trim();
      if (!nextTranslation) throw new Error('Translation returned no text.');
      const updatedAt = await runDatabaseMutation(() => vocabularyStore.saveWordTranslation(id, nextTranslation));
      setWords((current) => current.map((word) => word.id === id
        ? { ...word, translation: nextTranslation, updatedAt }
        : word));
    },
    prepareWordTranslation,
    removeWord: async (id) => {
      await runDatabaseMutation(() => vocabularyStore.removeWord(id)); await refresh(); await reschedule();
    },
    resetWord: async (id) => {
      await runDatabaseMutation(() => vocabularyStore.resetWord(id)); await refresh(); await reschedule();
    },
    createCollection: async (name, color) => {
      const id = await runDatabaseMutation(() => vocabularyStore.createCollection(name, color)); await refresh(); return id;
    },
    rateWord: async (word, rating) => {
      const currentWord = await vocabularyStore.getWord(word.id) ?? word;
      const update = applyRating(currentWord, rating);
      await runDatabaseMutation(() => vocabularyStore.saveRating(word.id, rating, update));
      setWords((current) => current.map((item) => item.id === word.id
        ? { ...item, ...update, updatedAt: update.lastRatedAt }
        : item));
      setStats((current) => updateRatingStats(current, currentWord.state, update.state));
      if (rating === 'learned') await reschedule();
    },
    markViewed: async (id) => {
      const occurredAt = new Date();
      await runDatabaseMutation(() => vocabularyStore.recordView(id, occurredAt.toISOString()));
      setWords((current) => current.map((item) => item.id === id
        ? { ...item, viewCount: item.viewCount + 1, lastViewedAt: occurredAt.toISOString(), updatedAt: occurredAt.toISOString() }
        : item));
      setStats((current) => current ? {
        ...current,
        viewedToday: current.viewedToday + 1,
        viewedLifetime: current.viewedLifetime + 1,
        recentActivity: current.recentActivity.map((day) => day.date === localDateKey(occurredAt)
          ? { ...day, count: day.count + 1 }
          : day),
      } : current);
    },
    updateReminderSettings: async (settings) => {
      await runDatabaseMutation(() => repository.saveReminderSettings(appDatabase, settings)); await refresh();
      return reschedule(undefined, settings);
    },
    updateLearningFilter: async (filter) => {
      await runDatabaseMutation(() => repository.saveLearningFilter(appDatabase, filter)); setLearningFilter(filter);
    },
    saveLearningPreferences: async (preferences) => {
      const normalized = normalizeLearningPreferences(preferences);
      await runDatabaseMutation(() => repository.saveLearningPreferences(appDatabase, normalized));
      setLearningPreferences(normalized);
    },
    completePersonalizedOnboarding: async (preferences) => {
      const existing = await vocabularyStore.listWords();
      const recommendations = buildRecommendations(preferences, existing.map((word) => word.normalizedTerm), 10);
      await runDatabaseMutation(async () => {
        if (dataSource === 'synced') {
          await repository.saveLearningPreferences(appDatabase, preferences);
          await vocabularyStore.createWords(recommendationsToInputs(recommendations));
          await repository.completeOnboarding(appDatabase);
        } else {
          await repository.completeOnboardingSetup(appDatabase, preferences, recommendationsToInputs(recommendations));
        }
      });
      await refresh(); await reschedule();
      return recommendations.length;
    },
    addRecommendedWords: async (limit = 10) => {
      const existing = await vocabularyStore.listWords();
      const recommendations = buildRecommendations(learningPreferences, existing.map((word) => word.normalizedTerm), limit);
      if (recommendations.length === 0) return 0;
      await runDatabaseMutation(() => vocabularyStore.createWords(recommendationsToInputs(recommendations)));
      await refresh(); await reschedule();
      return recommendations.length;
    },
    noteNotificationOpen: async (wordId) => {
      await runDatabaseMutation(() => vocabularyStore.recordNotificationOpen(wordId));
      setStats((current) => current ? { ...current, notificationOpens: current.notificationOpens + 1 } : current);
    },
  }), [appDatabase, catalogDatabase, collections, cutover, dataSource, guestImport, keepAccountRename, learningFilter, learningPreferences, onboardingComplete, pauseGuestImport, prepareForSignOut, prepareGuestImport, prepareWordTranslation, refresh, refreshGuestImport, reminderSettings, reschedule, resolveGuestImportConflict, resolveSyncCutoverConflict, runDatabaseMutation, runGuestImport, runSyncCutover, stats, vocabularyStore, words]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

function CatalogBridge({ appDatabase, children }: PropsWithChildren<{ appDatabase: SQLiteDatabase }>) {
  const catalogDatabase = useSQLiteContext();
  return <AppDataStateProvider appDatabase={appDatabase} catalogDatabase={catalogDatabase}>{children}</AppDataStateProvider>;
}

function AppDatabaseBridge({ children }: PropsWithChildren) {
  const appDatabase = useSQLiteContext();
  const [catalogReady, setCatalogReady] = useState(false);
  const handleCatalogReady = useCallback(async () => setCatalogReady(true), []);

  return (
    <View style={styles.container}>
      {!catalogReady ? <LoadingDatabase /> : null}
      <SQLiteProvider
        databaseName="wordnet.sqlite"
        // Metro requires a static require so it can bundle the database as an asset.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        assetSource={{ assetId: require('../../assets/catalog/wordnet.sqlite') }}
        onInit={handleCatalogReady}>
        <CatalogBridge appDatabase={appDatabase}>{children}</CatalogBridge>
      </SQLiteProvider>
    </View>
  );
}

function LoadingDatabase() {
  return <LaunchScreen />;
}

export function AppDataProvider({ children }: PropsWithChildren) {
  return (
    <Suspense fallback={<LoadingDatabase />}>
      <SQLiteProvider databaseName="wordfold.sqlite" onInit={migrateDatabase} useSuspense>
        <AppDatabaseBridge>{children}</AppDatabaseBridge>
      </SQLiteProvider>
    </Suspense>
  );
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
