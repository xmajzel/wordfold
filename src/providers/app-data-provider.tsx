import { createContext, PropsWithChildren, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import type { CatalogSense, Collection, DashboardStats, LearningFilter, LearningPreferences, LearningRating, LearningState, ReminderSettings, Word } from '@/domain/types';
import { lookupSenses } from '@/data/catalog';
import { migrateDatabase } from '@/data/database';
import * as repository from '@/data/repository';
import { applyRating } from '@/features/learning/algorithm';
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

function recommendationsToInputs(recommendations: Recommendation[]): repository.NewWordInput[] {
  return recommendations.map(({ entry, topic }) => ({
    collectionId: 'my-words',
    term: entry.term,
    normalizedTerm: entry.normalizedTerm,
    definition: entry.definition,
    example: entry.example,
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
  const lastScheduleDay = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextWords, nextCollections, nextStats, nextSettings, nextPreferences, nextOnboarding, nextLearningFilter] = await Promise.all([
      repository.listWords(appDatabase), repository.listCollections(appDatabase), repository.getStats(appDatabase),
      repository.getReminderSettings(appDatabase), repository.getLearningPreferences(appDatabase),
      repository.isOnboardingComplete(appDatabase), repository.getLearningFilter(appDatabase),
    ]);
    setWords(nextWords);
    setCollections(nextCollections);
    setStats(nextStats);
    setReminderSettings(nextSettings);
    setLearningPreferences(nextPreferences);
    setOnboardingComplete(nextOnboarding);
    setLearningFilter(nextLearningFilter);
  }, [appDatabase]);

  useEffect(() => {
    // The async refresh resolves after the effect body, so this does not cascade a synchronous render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const reschedule = useCallback(async (nextWords?: Word[], nextSettings?: ReminderSettings) => {
    const scheduleWords = nextWords ?? await repository.listWords(appDatabase);
    const scheduleSettings = nextSettings ?? await repository.getReminderSettings(appDatabase);
    return rebuildReminderSchedule(appDatabase, scheduleWords, scheduleSettings);
  }, [appDatabase]);

  const refreshReminderSchedule = useCallback(async (force = false) => {
    const settings = await repository.getReminderSettings(appDatabase);
    const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
    const scheduleDay = `${currentTimeZone}:${localDateKey(new Date())}`;
    if (!force && settings.timeZoneId === currentTimeZone && lastScheduleDay.current === scheduleDay) return;
    const nextSettings = settings.timeZoneId === currentTimeZone
      ? settings
      : { ...settings, timeZoneId: currentTimeZone };
    if (nextSettings !== settings) {
      await repository.saveReminderSettings(appDatabase, nextSettings);
      setReminderSettings(nextSettings);
    }
    await reschedule(undefined, nextSettings);
    lastScheduleDay.current = scheduleDay;
  }, [appDatabase, reschedule]);

  useEffect(() => {
    // The async database reads complete before any provider state is refreshed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshReminderSchedule(true);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshReminderSchedule();
    });
    return () => subscription.remove();
  }, [refreshReminderSchedule]);

  const value = useMemo<AppDataValue>(() => ({
    words, collections, stats, reminderSettings, learningPreferences, learningFilter, onboardingComplete, refresh,
    findSenses: (term) => lookupSenses(catalogDatabase, term),
    createWord: async (input) => {
      const id = await repository.addWord(appDatabase, input);
      await refresh(); await reschedule(); return id;
    },
    createWords: async (inputs) => {
      const ids = await repository.addWords(appDatabase, inputs);
      await refresh(); await reschedule(); return ids;
    },
    editWord: async (id, input) => {
      await repository.updateWord(appDatabase, id, input); await refresh(); await reschedule();
    },
    removeWord: async (id) => {
      await repository.deleteWord(appDatabase, id); await refresh(); await reschedule();
    },
    resetWord: async (id) => {
      await repository.resetWord(appDatabase, id); await refresh(); await reschedule();
    },
    createCollection: async (name, color) => {
      const id = await repository.addCollection(appDatabase, name, color); await refresh(); return id;
    },
    rateWord: async (word, rating) => {
      const currentWord = await repository.getWord(appDatabase, word.id) ?? word;
      const update = applyRating(currentWord, rating);
      await repository.saveRating(appDatabase, word.id, rating, update);
      setWords((current) => current.map((item) => item.id === word.id
        ? { ...item, ...update, updatedAt: update.lastRatedAt }
        : item));
      setStats((current) => updateRatingStats(current, currentWord.state, update.state));
    },
    markViewed: async (id) => {
      const occurredAt = new Date();
      await repository.recordView(appDatabase, id, occurredAt.toISOString());
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
      await repository.saveReminderSettings(appDatabase, settings); await refresh();
      return reschedule(undefined, settings);
    },
    updateLearningFilter: async (filter) => {
      await repository.saveLearningFilter(appDatabase, filter); setLearningFilter(filter);
    },
    saveLearningPreferences: async (preferences) => {
      const normalized = normalizeLearningPreferences(preferences);
      await repository.saveLearningPreferences(appDatabase, normalized);
      setLearningPreferences(normalized);
    },
    completePersonalizedOnboarding: async (preferences) => {
      const existing = await repository.listWords(appDatabase);
      const recommendations = buildRecommendations(preferences, existing.map((word) => word.normalizedTerm), 10);
      await repository.completeOnboardingSetup(appDatabase, preferences, recommendationsToInputs(recommendations));
      await refresh(); await reschedule();
      return recommendations.length;
    },
    addRecommendedWords: async (limit = 10) => {
      const existing = await repository.listWords(appDatabase);
      const recommendations = buildRecommendations(learningPreferences, existing.map((word) => word.normalizedTerm), limit);
      if (recommendations.length === 0) return 0;
      await repository.addWords(appDatabase, recommendationsToInputs(recommendations));
      await refresh(); await reschedule();
      return recommendations.length;
    },
    noteNotificationOpen: async (wordId) => {
      await repository.recordNotificationOpen(appDatabase, wordId);
      setStats((current) => current ? { ...current, notificationOpens: current.notificationOpens + 1 } : current);
    },
  }), [appDatabase, catalogDatabase, collections, learningFilter, learningPreferences, onboardingComplete, refresh, reminderSettings, reschedule, stats, words]);

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
