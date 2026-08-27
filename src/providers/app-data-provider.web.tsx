import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { defaultCourseId, getCourseDefinition, isCourseId, wordBelongsToCourse, type CourseDefinition, type CourseId } from '@/domain/courses';
import type { CatalogSense, Collection, DashboardStats, LearningFilter, LearningPreferences, LearningRating, PronunciationVoicePreference, ReminderSettings, Word } from '@/domain/types';
import { getCourseCatalogEntriesForNormalizedTerm } from '@/data/course-catalog';
import type { NewWordInput } from '@/data/repository';
import { createId } from '@/data/repository';
import { isLearningFilter } from '@/data/cefr-levels';
import { normalizeTerm } from '@/features/import/parser';
import { applyRating } from '@/features/learning/algorithm';
import { getWordCapacity } from '@/features/purchases/capacity';
import { buildRecommendations, normalizeLearningPreferences, type Recommendation } from '@/features/recommendations/selector';
import { emptyGuestImportCounts, type GuestImportConflictResolution, type GuestImportViewModel } from '@/data/sync/guest-import-types';
import type { SyncCutoverViewModel } from '@/data/sync/cutover-types';
import { isOnDeviceTranslationPairSupported } from '@/features/translation/translator';

interface AppDataValue {
  dataSource: 'guest';
  words: Word[]; collections: Collection[]; stats: DashboardStats | null;
  reminderSettings: ReminderSettings | null;
  activeCourseId: CourseId;
  activeCourse: CourseDefinition;
  learningPreferences: LearningPreferences;
  pronunciationVoicePreference: PronunciationVoicePreference;
  learningFilter: LearningFilter;
  onboardingComplete: boolean | null;
  wordCapacity: ReturnType<typeof getWordCapacity>;
  refresh(): Promise<void>; findSenses(term: string, courseId?: CourseId): Promise<CatalogSense[]>;
  createWord(input: NewWordInput): Promise<string>; createWords(inputs: NewWordInput[]): Promise<string[]>;
  editWord(id: string, input: NewWordInput): Promise<void>; removeWord(id: string): Promise<void>;
  saveWordTranslation(id: string, translation: string): Promise<void>;
  prepareWordTranslation(word: Word): Promise<void>;
  resetWord(id: string): Promise<void>; createCollection(name: string, color: string): Promise<string>;
  rateWord(word: Word, rating: LearningRating): Promise<void>; markViewed(id: string): Promise<void>;
  updateReminderSettings(settings: ReminderSettings): Promise<number>;
  switchActiveCourse(courseId: CourseId): Promise<void>;
  updateLearningFilter(filter: LearningFilter): Promise<void>;
  saveLearningPreferences(preferences: LearningPreferences): Promise<void>;
  savePronunciationVoicePreference(preference: PronunciationVoicePreference): Promise<void>;
  completePersonalizedOnboarding(preferences: LearningPreferences, preference: PronunciationVoicePreference): Promise<number>;
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

function webCourseKey(key: string, courseId: CourseId) {
  return `wordfold.${key}.${courseId}`;
}

function readWebLearningPreferences(courseId: CourseId): LearningPreferences {
  if (typeof window === 'undefined') return { levels: [], topics: [] };
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(webCourseKey('learningPreferences', courseId)) ?? 'null');
    if (!value || typeof value !== 'object') return { levels: [], topics: [] };
    return normalizeLearningPreferences(value as LearningPreferences);
  } catch {
    return { levels: [], topics: [] };
  }
}

function readWebVoicePreference(courseId: CourseId): PronunciationVoicePreference {
  if (typeof window === 'undefined') return 'device';
  const value = window.localStorage.getItem(webCourseKey('pronunciationVoice', courseId));
  if (courseId === 'en-sk' && (value === 'neural-en-US' || value === 'neural-en-GB')) return value;
  return 'device';
}

function readWebLearningFilter(courseId: CourseId): LearningFilter {
  if (typeof window === 'undefined') return 'all';
  const scoped = window.localStorage.getItem(webCourseKey('learningFilter', courseId));
  if (isLearningFilter(scoped)) return scoped;
  const legacy = courseId === defaultCourseId ? window.localStorage.getItem('wordfold.learningFilter') : null;
  return isLearningFilter(legacy) ? legacy : 'all';
}

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

function recommendationsToWords(
  recommendations: Recommendation[],
  preference: PronunciationVoicePreference,
) {
  const locale = preference === 'neural-en-GB' ? 'en-GB' : 'en-US';
  return recommendations.map(({ entry, topic }) => toWord({
    collectionId: 'my-words', term: entry.term, normalizedTerm: entry.normalizedTerm,
    definition: entry.definition, example: entry.example, partOfSpeech: entry.partOfSpeech,
    translation: entry.translation,
    catalogSenseId: entry.catalogSenseId, cefrLevel: entry.level, source: topic ?? 'manual',
    sourceLanguageCode: 'en', targetLanguageCode: 'sk',
    sourcePronunciationLocale: locale, targetPronunciationLocale: 'sk-SK',
  }));
}

export function AppDataProvider({ children }: PropsWithChildren) {
  const [words, setWords] = useState<Word[]>(initialWords);
  const [collections, setCollections] = useState(initialCollections);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({ enabled: false, countPerDay: 1, windowStartMinutes: 600, windowEndMinutes: 1200, timeZoneId: 'local' });
  const [activeCourseId, setActiveCourseId] = useState<CourseId>(defaultCourseId);
  const [learningPreferences, setLearningPreferences] = useState<LearningPreferences>({ levels: [], topics: [] });
  const [pronunciationVoicePreference, setPronunciationVoicePreference] = useState<PronunciationVoicePreference>('device');
  const [learningFilter, setLearningFilter] = useState<LearningFilter>('all');
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedCourseId = window.localStorage.getItem('wordfold.activeCourseId');
    const courseId = isCourseId(storedCourseId) ? storedCourseId : defaultCourseId;
    // Restore course-scoped settings after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveCourseId(courseId);
    setLearningPreferences(readWebLearningPreferences(courseId));
    setPronunciationVoicePreference(readWebVoicePreference(courseId));
    setLearningFilter(readWebLearningFilter(courseId));
  }, []);

  const activeWords = useMemo(() => words.filter((word) => wordBelongsToCourse(word, activeCourseId)), [activeCourseId, words]);
  const stats = useMemo<DashboardStats>(() => {
    const viewedLifetime = activeWords.reduce((total, word) => total + word.viewCount, 0);
    const recentActivity = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - 6 + index);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { date: key, count: index === 6 ? viewedLifetime : 0 };
    });
    return {
      totalWords: activeWords.length, newWords: activeWords.filter((word) => word.state === 'new').length,
      difficultWords: activeWords.filter((word) => word.state === 'cannot_remember').length,
      understoodWords: activeWords.filter((word) => word.state === 'understood').length,
      learnedWords: activeWords.filter((word) => word.state === 'learned').length,
      viewedToday: viewedLifetime, viewedLifetime, notificationOpens: 0, recentActivity,
    };
  }, [activeWords]);

  const value = useMemo<AppDataValue>(() => ({
    dataSource: 'guest', words, collections, stats, reminderSettings, activeCourseId,
    activeCourse: getCourseDefinition(activeCourseId), learningPreferences,
    pronunciationVoicePreference, learningFilter, onboardingComplete,
    wordCapacity: getWordCapacity(words.length, false),
    refresh: async () => undefined,
    findSenses: async (term, courseId = activeCourseId) => {
      const course = getCourseDefinition(courseId);
      const normalizedTerm = normalizeTerm(term, course.sourceLanguageCode);
      const entries = getCourseCatalogEntriesForNormalizedTerm(courseId, normalizedTerm);
      if (entries.length > 0) return entries.map((entry, index) => ({
        id: entry.catalogSenseId,
        term: entry.term,
        partOfSpeech: entry.partOfSpeech,
        definition: entry.definition,
        example: entry.example,
        translation: entry.translation,
        rank: -101 + index,
      }));
      if (courseId !== 'en-sk') return [];
      const sense = previewSenses[normalizedTerm];
      return sense ? [sense] : [];
    },
    createWord: async (input) => { const word = toWord(input); setWords((current) => [word, ...current]); return word.id; },
    createWords: async (inputs) => { const next = inputs.map((input) => toWord(input)); setWords((current) => [...next, ...current]); return next.map((word) => word.id); },
    editWord: async (id, input) => setWords((current) => current.map((word) => word.id === id ? { ...word, ...input, normalizedTerm: input.normalizedTerm, updatedAt: new Date().toISOString() } : word)),
    saveWordTranslation: async (id, translation) => setWords((current) => current.map((word) => word.id === id ? { ...word, translation: translation.trim(), updatedAt: new Date().toISOString() } : word)),
    prepareWordTranslation: async (word) => {
      if (word.translation) return;
      if (!isOnDeviceTranslationPairSupported(word.sourceLanguageCode, word.targetLanguageCode)) {
        throw new Error('Automatic on-device translation supports English → Slovak and Spanish → Slovak.');
      }
      if (word.cefrLevel) {
        throw new Error('This catalog entry has no reviewed Slovak hint. Add the hint manually instead of generating catalog content.');
      }
      throw new Error('On-device translation needs a Wordfold development build.');
    },
    removeWord: async (id) => setWords((current) => current.filter((word) => word.id !== id)),
    resetWord: async (id) => setWords((current) => current.map((word) => word.id === id ? { ...word, state: 'new', understoodStreak: 0, nextReviewAt: null } : word)),
    createCollection: async (name, color) => { const now = new Date().toISOString(); const id = createId('web-collection'); setCollections((current) => [...current, { id, name, color, createdAt: now, updatedAt: now }]); return id; },
    rateWord: async (word, rating) => setWords((current) => current.map((item) => item.id === word.id ? { ...item, ...applyRating(item, rating) } : item)),
    markViewed: async (id) => setWords((current) => current.map((word) => word.id === id ? { ...word, viewCount: word.viewCount + 1, lastViewedAt: new Date().toISOString() } : word)),
    updateReminderSettings: async (settings) => { setReminderSettings(settings); return settings.enabled ? settings.countPerDay * 14 : 0; },
    switchActiveCourse: async (courseId) => {
      if (typeof window !== 'undefined') window.localStorage.setItem('wordfold.activeCourseId', courseId);
      setActiveCourseId(courseId);
      setLearningPreferences(readWebLearningPreferences(courseId));
      setPronunciationVoicePreference(readWebVoicePreference(courseId));
      setLearningFilter(readWebLearningFilter(courseId));
    },
    updateLearningFilter: async (filter) => {
      if (typeof window !== 'undefined') window.localStorage.setItem(webCourseKey('learningFilter', activeCourseId), filter);
      setLearningFilter(filter);
    },
    saveLearningPreferences: async (preferences) => {
      const normalized = normalizeLearningPreferences(preferences);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(webCourseKey('learningPreferences', activeCourseId), JSON.stringify(normalized));
      }
      setLearningPreferences(normalized);
    },
    savePronunciationVoicePreference: async (preference) => {
      if (activeCourseId !== defaultCourseId && preference !== 'device') {
        throw new Error(`Choose a pronunciation voice supported by ${getCourseDefinition(activeCourseId).displayName}.`);
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(webCourseKey('pronunciationVoice', activeCourseId), preference);
      }
      setPronunciationVoicePreference(preference);
    },
    completePersonalizedOnboarding: async (preferences, preference) => {
      const normalized = normalizeLearningPreferences(preferences);
      const recommendations = getCourseDefinition(activeCourseId).capabilities.recommendations
        ? buildRecommendations(normalized, activeWords.map((word) => word.normalizedTerm), 10)
        : [];
      setLearningPreferences(normalized);
      setPronunciationVoicePreference(preference);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(webCourseKey('learningPreferences', activeCourseId), JSON.stringify(normalized));
        window.localStorage.setItem(webCourseKey('pronunciationVoice', activeCourseId), preference);
      }
      setWords((current) => [...recommendationsToWords(recommendations, preference), ...current]);
      setOnboardingComplete(true);
      return recommendations.length;
    },
    addRecommendedWords: async (limit = 10) => {
      if (!getCourseDefinition(activeCourseId).capabilities.recommendations) return 0;
      const recommendations = buildRecommendations(learningPreferences, activeWords.map((word) => word.normalizedTerm), limit);
      setWords((current) => [...recommendationsToWords(recommendations, pronunciationVoicePreference), ...current]);
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
  }), [activeCourseId, activeWords, collections, learningFilter, learningPreferences, onboardingComplete, pronunciationVoicePreference, reminderSettings, stats, words]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppData() {
  const value = useContext(Context);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
