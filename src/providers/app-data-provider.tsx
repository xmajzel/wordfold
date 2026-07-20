import { createContext, PropsWithChildren, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import type { CatalogSense, Collection, DashboardStats, LearningFilter, LearningPreferences, LearningRating, LearningState, ReminderSettings, Word } from '@/domain/types';
import { lookupSenses } from '@/data/catalog';
import { getCefrTranslation } from '@/data/cefr-catalog';
import { migrateDatabase } from '@/data/database';
import * as repository from '@/data/repository';
import { applyRating } from '@/features/learning/algorithm';
import { createSerialMutationQueue } from '@/features/learning/mutation-queue';
import { translateEnglishToSlovak } from '@/features/translation/translator';
import { buildRecommendations, normalizeLearningPreferences, type Recommendation } from '@/features/recommendations/selector';
import { rebuildReminderSchedule } from '@/features/reminders/scheduler';
import { LaunchScreen } from '@/components/launch-screen';

interface AppDataValue {
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
  const [words, setWords] = useState<Word[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings | null>(null);
  const [learningPreferences, setLearningPreferences] = useState<LearningPreferences>({ levels: [], topics: [] });
  const [learningFilter, setLearningFilter] = useState<LearningFilter>('all');
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [databaseMutationQueue] = useState(createSerialMutationQueue);
  const [translationQueue] = useState(createSerialMutationQueue);
  const translationTasks = useRef(new Map<string, Promise<void>>());
  const backgroundTranslationAttempts = useRef(new Set<string>());
  const lastScheduleDay = useRef<string | null>(null);

  const runDatabaseMutation = useCallback(<T,>(mutation: () => Promise<T>) => (
    databaseMutationQueue.run(mutation)
  ), [databaseMutationQueue]);

  const refresh = useCallback(async () => {
    const [loadedWords, nextCollections, nextStats, nextSettings, nextPreferences, nextOnboarding, nextLearningFilter] = await Promise.all([
      repository.listWords(appDatabase), repository.listCollections(appDatabase), repository.getStats(appDatabase),
      repository.getReminderSettings(appDatabase), repository.getLearningPreferences(appDatabase),
      repository.isOnboardingComplete(appDatabase), repository.getLearningFilter(appDatabase),
    ]);
    const translationUpdates = loadedWords.flatMap((word) => {
      if (word.translation) return [];
      const translation = getBundledWordTranslation(word);
      return translation ? [{ id: word.id, translation }] : [];
    });
    const translationBackfill = await runDatabaseMutation(
      () => repository.updateMissingWordTranslations(appDatabase, translationUpdates),
    );
    const updatedIds = new Set(translationBackfill.updatedIds);
    const updatedTranslations = new Map(translationUpdates
      .filter((update) => updatedIds.has(update.id))
      .map((update) => [update.id, update.translation]));
    const synchronizedWords = translationUpdates.length === updatedIds.size
      ? loadedWords
      : await repository.listWords(appDatabase);
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
  }, [appDatabase, runDatabaseMutation]);

  const prepareWordTranslation = useCallback((word: Word) => {
    if (word.translation) return Promise.resolve();
    const existingTask = translationTasks.current.get(word.id);
    if (existingTask) return existingTask;
    const task = translationQueue.run(async () => {
      const currentWord = await repository.getWord(appDatabase, word.id) ?? word;
      if (currentWord.translation) return;
      const bundledTranslation = getBundledWordTranslation(currentWord);
      const translated = bundledTranslation ?? (await translateEnglishToSlovak(currentWord.term)).trim();
      if (!translated) throw new Error('Translation returned no text.');
      const updatedAt = await runDatabaseMutation(
        () => repository.updateWordTranslation(appDatabase, currentWord.id, translated),
      );
      setWords((current) => current.map((item) => item.id === currentWord.id && !item.translation
        ? { ...item, translation: translated, updatedAt }
        : item));
    }).finally(() => {
      translationTasks.current.delete(word.id);
    });
    translationTasks.current.set(word.id, task);
    return task;
  }, [appDatabase, runDatabaseMutation, translationQueue]);

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

  const reschedule = useCallback(async (nextWords?: Word[], nextSettings?: ReminderSettings) => {
    return runDatabaseMutation(async () => {
      const scheduleWords = nextWords ?? await repository.listWords(appDatabase);
      const scheduleSettings = nextSettings ?? await repository.getReminderSettings(appDatabase);
      return rebuildReminderSchedule(appDatabase, scheduleWords, scheduleSettings);
    });
  }, [appDatabase, runDatabaseMutation]);

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
    words, collections, stats, reminderSettings, learningPreferences, learningFilter, onboardingComplete, refresh,
    findSenses: (term) => lookupSenses(catalogDatabase, term),
    createWord: async (input) => {
      const id = await runDatabaseMutation(() => repository.addWord(appDatabase, input));
      await refresh(); await reschedule(); return id;
    },
    createWords: async (inputs) => {
      const ids = await runDatabaseMutation(() => repository.addWords(appDatabase, inputs));
      await refresh(); await reschedule(); return ids;
    },
    editWord: async (id, input) => {
      await runDatabaseMutation(() => repository.updateWord(appDatabase, id, input)); await refresh(); await reschedule();
    },
    saveWordTranslation: async (id, translation) => {
      const nextTranslation = translation.trim();
      if (!nextTranslation) throw new Error('Translation returned no text.');
      const updatedAt = await runDatabaseMutation(() => repository.updateWordTranslation(appDatabase, id, nextTranslation));
      setWords((current) => current.map((word) => word.id === id
        ? { ...word, translation: nextTranslation, updatedAt }
        : word));
    },
    prepareWordTranslation,
    removeWord: async (id) => {
      await runDatabaseMutation(() => repository.deleteWord(appDatabase, id)); await refresh(); await reschedule();
    },
    resetWord: async (id) => {
      await runDatabaseMutation(() => repository.resetWord(appDatabase, id)); await refresh(); await reschedule();
    },
    createCollection: async (name, color) => {
      const id = await runDatabaseMutation(() => repository.addCollection(appDatabase, name, color)); await refresh(); return id;
    },
    rateWord: async (word, rating) => {
      const currentWord = await repository.getWord(appDatabase, word.id) ?? word;
      const update = applyRating(currentWord, rating);
      await runDatabaseMutation(() => repository.saveRating(appDatabase, word.id, rating, update));
      setWords((current) => current.map((item) => item.id === word.id
        ? { ...item, ...update, updatedAt: update.lastRatedAt }
        : item));
      setStats((current) => updateRatingStats(current, currentWord.state, update.state));
      if (rating === 'learned') await reschedule();
    },
    markViewed: async (id) => {
      const occurredAt = new Date();
      await runDatabaseMutation(() => repository.recordView(appDatabase, id, occurredAt.toISOString()));
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
      const existing = await repository.listWords(appDatabase);
      const recommendations = buildRecommendations(preferences, existing.map((word) => word.normalizedTerm), 10);
      await runDatabaseMutation(() => repository.completeOnboardingSetup(appDatabase, preferences, recommendationsToInputs(recommendations)));
      await refresh(); await reschedule();
      return recommendations.length;
    },
    addRecommendedWords: async (limit = 10) => {
      const existing = await repository.listWords(appDatabase);
      const recommendations = buildRecommendations(learningPreferences, existing.map((word) => word.normalizedTerm), limit);
      if (recommendations.length === 0) return 0;
      await runDatabaseMutation(() => repository.addWords(appDatabase, recommendationsToInputs(recommendations)));
      await refresh(); await reschedule();
      return recommendations.length;
    },
    noteNotificationOpen: async (wordId) => {
      await runDatabaseMutation(() => repository.recordNotificationOpen(appDatabase, wordId));
      setStats((current) => current ? { ...current, notificationOpens: current.notificationOpens + 1 } : current);
    },
  }), [appDatabase, catalogDatabase, collections, learningFilter, learningPreferences, onboardingComplete, prepareWordTranslation, refresh, reminderSettings, reschedule, runDatabaseMutation, stats, words]);

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
