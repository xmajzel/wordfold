import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import type { CatalogSense, Collection, ContentSource, DashboardStats, LearningFilter, LearningRating, ReminderSettings, Word } from '@/domain/types';
import type { NewWordInput } from '@/data/repository';
import { createId } from '@/data/repository';
import { isLearningFilter } from '@/data/cefr-levels';
import { normalizeTerm } from '@/features/import/parser';
import { applyRating } from '@/features/learning/algorithm';
import personalVocabulary from '../../assets/seed/personal-vocabulary.json';

interface AppDataValue {
  words: Word[]; collections: Collection[]; stats: DashboardStats | null;
  reminderSettings: ReminderSettings | null;
  contentPacks: { id: ContentSource; name: string; enabled: boolean }[];
  learningFilter: LearningFilter;
  onboardingComplete: boolean | null;
  refresh(): Promise<void>; findSenses(term: string): Promise<CatalogSense[]>;
  createWord(input: NewWordInput): Promise<string>; createWords(inputs: NewWordInput[]): Promise<string[]>;
  editWord(id: string, input: NewWordInput): Promise<void>; removeWord(id: string): Promise<void>;
  resetWord(id: string): Promise<void>; createCollection(name: string, color: string): Promise<string>;
  rateWord(word: Word, rating: LearningRating): Promise<void>; markViewed(id: string): Promise<void>;
  updateReminderSettings(settings: ReminderSettings): Promise<number>;
  updateLearningFilter(filter: LearningFilter): Promise<void>;
  toggleContentPack(id: ContentSource, enabled: boolean): Promise<void>;
  finishOnboarding(): Promise<void>; noteNotificationOpen(wordId: string | null): Promise<void>;
}

const Context = createContext<AppDataValue | null>(null);
const initialDate = new Date().toISOString();
const seedCollectionColors: Record<string, string> = {
  'ux-ui': '#EE6FA8',
  'project-management': '#6C63E8',
  'headway-upper-intermediate': '#27A8A2',
};
const initialCollections: Collection[] = [
  { id: 'my-words', name: 'My words', color: '#6657D9', createdAt: initialDate, updatedAt: initialDate },
  ...personalVocabulary.collections.map((collection) => ({
    ...collection,
    color: seedCollectionColors[collection.id] ?? '#6657D9',
    createdAt: initialDate,
    updatedAt: initialDate,
  })),
];
const initialWords: Word[] = personalVocabulary.words.map((word) => ({
  ...word,
  sourceLanguageCode: 'en',
  targetLanguageCode: 'sk',
  cefrLevel: null,
  source: 'manual',
  state: 'new',
  understoodStreak: 0,
  lapseCount: 0,
  viewCount: 0,
  lastViewedAt: null,
  lastRatedAt: null,
  nextReviewAt: null,
  createdAt: initialDate,
  updatedAt: initialDate,
}));
const previewSenses: Record<string, CatalogSense> = {
  scope: { id: 'preview-scope', term: 'scope', partOfSpeech: 'noun', definition: 'The extent of the area or subject matter that something deals with.', example: 'We agreed on the scope before planning the project.', rank: 0 },
  stakeholder: { id: 'preview-stakeholder', term: 'stakeholder', partOfSpeech: 'noun', definition: 'A person or group affected by a project or decision.', example: 'The team invited every key stakeholder to the review.', rank: 0 },
};

function toWord(input: NewWordInput, id = createId('web-word')): Word {
  const now = new Date().toISOString();
  return { id, collectionId: input.collectionId, term: input.term, normalizedTerm: input.normalizedTerm,
    sourceLanguageCode: 'en', targetLanguageCode: 'sk', partOfSpeech: input.partOfSpeech ?? null,
    definition: input.definition, example: input.example ?? null, translation: input.translation ?? null,
    catalogSenseId: input.catalogSenseId ?? null, cefrLevel: input.cefrLevel ?? null, source: input.source ?? 'manual', state: 'new',
    understoodStreak: 0, lapseCount: 0, viewCount: 0, lastViewedAt: null, lastRatedAt: null,
    nextReviewAt: null, createdAt: now, updatedAt: now };
}

export function AppDataProvider({ children }: PropsWithChildren) {
  const [words, setWords] = useState<Word[]>(initialWords);
  const [collections, setCollections] = useState(initialCollections);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({ enabled: false, countPerDay: 1, windowStartMinutes: 600, windowEndMinutes: 1200, timeZoneId: 'local' });
  const [contentPacks, setContentPacks] = useState<AppDataValue['contentPacks']>([
    { id: 'spoken', name: 'Everyday spoken English', enabled: false },
    { id: 'business', name: 'Business English', enabled: false },
    { id: 'academic', name: 'Academic English', enabled: false },
  ]);
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
    words, collections, stats, reminderSettings, contentPacks, learningFilter, onboardingComplete,
    refresh: async () => undefined,
    findSenses: async (term) => { const sense = previewSenses[normalizeTerm(term)]; return sense ? [sense] : []; },
    createWord: async (input) => { const word = toWord(input); setWords((current) => [word, ...current]); return word.id; },
    createWords: async (inputs) => { const next = inputs.map((input) => toWord(input)); setWords((current) => [...next, ...current]); return next.map((word) => word.id); },
    editWord: async (id, input) => setWords((current) => current.map((word) => word.id === id ? { ...word, ...input, normalizedTerm: input.normalizedTerm, updatedAt: new Date().toISOString() } : word)),
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
    toggleContentPack: async (id, enabled) => setContentPacks((current) => current.map((pack) => pack.id === id ? { ...pack, enabled } : pack)),
    finishOnboarding: async () => setOnboardingComplete(true), noteNotificationOpen: async () => undefined,
  }), [collections, contentPacks, learningFilter, onboardingComplete, reminderSettings, stats, words]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppData() {
  const value = useContext(Context);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
