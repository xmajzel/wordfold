import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import type { CatalogSense, Collection, DashboardStats, LearningFilter, LearningPreferences, LearningRating, ReminderSettings, Word } from '@/domain/types';
import { getCefrEntryForNormalizedTerm } from '@/data/cefr-catalog';
import type { NewWordInput } from '@/data/repository';
import { createId } from '@/data/repository';
import { isLearningFilter } from '@/data/cefr-levels';
import { normalizeTerm } from '@/features/import/parser';
import { applyRating } from '@/features/learning/algorithm';
import { buildRecommendations, normalizeLearningPreferences, type Recommendation } from '@/features/recommendations/selector';
import { emptyGuestImportCounts, type GuestImportConflictResolution, type GuestImportViewModel } from '@/data/sync/guest-import-types';
import type { SyncCutoverViewModel } from '@/data/sync/cutover-types';

interface AppDataValue {
  dataSource: 'guest';
  words: Word[]; collections: Collection[]; stats: DashboardStats | null;
  reminderSettings: ReminderSettings | null;
  learningPreferences: LearningPreferences;
  learningFilter: LearningFilter;
  onboardingComplete: boolean | null;
  refresh(): Promise<void>; findSenses(term: string): Promise<CatalogSense[]>;
  createWord(input: NewWordInput): Promise<string>; createWords(inputs: NewWordInput[]): Promise<string[]>;
  editWord(id: string, input: NewWordInput): Promise<void>; removeWord(id: string): Promise<void>;
  saveWordTranslation(id: string, translation: string): Promise<void>;
  prepareWordTranslation(word: Word): Promise<void>;
  resetWord(id: string): Promise<void>; createCollection(name: string, color: string): Promise<string>;
  rateWord(word: Word, rating: LearningRating): Promise<void>; markViewed(id: string): Promise<void>;
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

const Context = createContext<AppDataValue | null>(null);
const initialDate = new Date().toISOString();
const initialCollections: Collection[] = [
  { id: 'my-words', name: 'My words', color: '#6657D9', createdAt: initialDate, updatedAt: initialDate },
];
const initialWords: Word[] = [];
const previewSenses: Record<string, CatalogSense> = {
  scope: { id: 'preview-scope', term: 'scope', partOfSpeech: 'noun', definition: 'The extent of the area or subject matter that something deals with.', example: 'We agreed on the scope before planning the project.', rank: 0 },
  stakeholder: { id: 'preview-stakeholder', term: 'stakeholder', partOfSpeech: 'noun', definition: 'A person or group affected by a project or decision.', example: 'The team invited every key stakeholder to the review.', rank: 0 },
};

function toWord(input: NewWordInput, id = createId('web-word')): Word {
  const now = new Date().toISOString();
  return { id, collectionId: input.collectionId, term: input.term, normalizedTerm: input.normalizedTerm,
    sourceLanguageCode: input.sourceLanguageCode, targetLanguageCode: input.targetLanguageCode,
    sourcePronunciationLocale: input.sourcePronunciationLocale, targetPronunciationLocale: input.targetPronunciationLocale,
    partOfSpeech: input.partOfSpeech ?? null,
    definition: input.definition, example: input.example ?? null, translation: input.translation ?? null,
    catalogSenseId: input.catalogSenseId ?? null, cefrLevel: input.cefrLevel ?? null, source: input.source ?? 'manual', state: 'new',
    understoodStreak: 0, lapseCount: 0, viewCount: 0, lastViewedAt: null, lastRatedAt: null,
    nextReviewAt: null, createdAt: now, updatedAt: now };
}

function recommendationsToWords(recommendations: Recommendation[]) {
  return recommendations.map(({ entry, topic }) => toWord({
    collectionId: 'my-words', term: entry.term, normalizedTerm: entry.normalizedTerm,
    definition: entry.definition, example: entry.example, partOfSpeech: entry.partOfSpeech,
    translation: entry.translation,
    catalogSenseId: entry.catalogSenseId, cefrLevel: entry.level, source: topic ?? 'manual',
    sourceLanguageCode: 'en', targetLanguageCode: 'sk',
    sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK',
  }));
}

export function AppDataProvider({ children }: PropsWithChildren) {
  const [words, setWords] = useState<Word[]>(initialWords);
  const [collections, setCollections] = useState(initialCollections);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({ enabled: false, countPerDay: 1, windowStartMinutes: 600, windowEndMinutes: 1200, timeZoneId: 'local' });
  const [learningPreferences, setLearningPreferences] = useState<LearningPreferences>({ levels: [], topics: [] });
  const [learningFilter, setLearningFilter] = useState<LearningFilter>('all');
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    const stored = typeof window === 'undefined' ? null : window.localStorage.getItem('wordfold.learningFilter');
    if (!isLearningFilter(stored)) return;
    // Restore the last explicit web filter after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLearningFilter(stored);
  }, []);

  const stats = useMemo<DashboardStats>(() => {
    const viewedLifetime = words.reduce((total, word) => total + word.viewCount, 0);
    const recentActivity = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - 6 + index);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { date: key, count: index === 6 ? viewedLifetime : 0 };
    });
    return {
      totalWords: words.length, newWords: words.filter((word) => word.state === 'new').length,
      difficultWords: words.filter((word) => word.state === 'cannot_remember').length,
      understoodWords: words.filter((word) => word.state === 'understood').length,
      learnedWords: words.filter((word) => word.state === 'learned').length,
      viewedToday: viewedLifetime, viewedLifetime, notificationOpens: 0, recentActivity,
    };
  }, [words]);

  const value = useMemo<AppDataValue>(() => ({
    dataSource: 'guest', words, collections, stats, reminderSettings, learningPreferences, learningFilter, onboardingComplete,
    refresh: async () => undefined,
    findSenses: async (term) => {
      const normalizedTerm = normalizeTerm(term);
      const entry = getCefrEntryForNormalizedTerm(normalizedTerm);
      if (entry) return [{
        id: entry.catalogSenseId,
        term: entry.term,
        partOfSpeech: entry.partOfSpeech,
        definition: entry.definition,
        example: entry.example,
        translation: entry.translation,
        rank: -101,
      }];
      const sense = previewSenses[normalizedTerm];
      return sense ? [sense] : [];
    },
    createWord: async (input) => { const word = toWord(input); setWords((current) => [word, ...current]); return word.id; },
    createWords: async (inputs) => { const next = inputs.map((input) => toWord(input)); setWords((current) => [...next, ...current]); return next.map((word) => word.id); },
    editWord: async (id, input) => setWords((current) => current.map((word) => word.id === id ? { ...word, ...input, normalizedTerm: input.normalizedTerm, updatedAt: new Date().toISOString() } : word)),
    saveWordTranslation: async (id, translation) => setWords((current) => current.map((word) => word.id === id ? { ...word, translation: translation.trim(), updatedAt: new Date().toISOString() } : word)),
    prepareWordTranslation: async (word) => {
      if (word.translation) return;
      if (word.sourceLanguageCode !== 'en' || word.targetLanguageCode !== 'sk') {
        throw new Error('Automatic on-device translation currently supports English → Slovak only.');
      }
      throw new Error('On-device translation needs a Wordfold development build.');
    },
    removeWord: async (id) => setWords((current) => current.filter((word) => word.id !== id)),
    resetWord: async (id) => setWords((current) => current.map((word) => word.id === id ? { ...word, state: 'new', understoodStreak: 0, nextReviewAt: null } : word)),
    createCollection: async (name, color) => { const now = new Date().toISOString(); const id = createId('web-collection'); setCollections((current) => [...current, { id, name, color, createdAt: now, updatedAt: now }]); return id; },
    rateWord: async (word, rating) => setWords((current) => current.map((item) => item.id === word.id ? { ...item, ...applyRating(item, rating) } : item)),
    markViewed: async (id) => setWords((current) => current.map((word) => word.id === id ? { ...word, viewCount: word.viewCount + 1, lastViewedAt: new Date().toISOString() } : word)),
    updateReminderSettings: async (settings) => { setReminderSettings(settings); return settings.enabled ? settings.countPerDay * 14 : 0; },
    updateLearningFilter: async (filter) => {
      if (typeof window !== 'undefined') window.localStorage.setItem('wordfold.learningFilter', filter);
      setLearningFilter(filter);
    },
    saveLearningPreferences: async (preferences) => setLearningPreferences(normalizeLearningPreferences(preferences)),
    completePersonalizedOnboarding: async (preferences) => {
      const normalized = normalizeLearningPreferences(preferences);
      const recommendations = buildRecommendations(normalized, words
        .filter((word) => word.sourceLanguageCode === 'en')
        .map((word) => word.normalizedTerm), 10);
      setLearningPreferences(normalized);
      setWords((current) => [...recommendationsToWords(recommendations), ...current]);
      setOnboardingComplete(true);
      return recommendations.length;
    },
    addRecommendedWords: async (limit = 10) => {
      const recommendations = buildRecommendations(learningPreferences, words
        .filter((word) => word.sourceLanguageCode === 'en')
        .map((word) => word.normalizedTerm), limit);
      setWords((current) => [...recommendationsToWords(recommendations), ...current]);
      return recommendations.length;
    },
    noteNotificationOpen: async () => undefined,
    guestImport: {
      phase: 'unavailable', totals: emptyGuestImportCounts, uploaded: emptyGuestImportCounts,
      conflicts: [], message: 'Device vocabulary import is available only in the native app.',
    },
    prepareGuestImport: async () => undefined,
    resolveGuestImportConflict: async () => undefined,
    runGuestImport: async () => undefined,
    refreshGuestImport: async () => undefined,
    pauseGuestImport: async () => undefined,
    cutover: {
      phase: 'checking', totals: emptyGuestImportCounts, uploaded: emptyGuestImportCounts,
      conflicts: [], message: 'Continuous synchronization is available only in the native app.',
    },
    runSyncCutover: async () => undefined,
    resolveSyncCutoverConflict: async () => undefined,
    keepAccountRename: async () => undefined,
    prepareForSignOut: async () => undefined,
  }), [collections, learningFilter, learningPreferences, onboardingComplete, reminderSettings, stats, words]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppData() {
  const value = useContext(Context);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
