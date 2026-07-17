export type LearningState = 'new' | 'cannot_remember' | 'understood' | 'learned';

export type LearningRating = 'again' | 'understood' | 'learned';

export type ContentPackId = 'spoken' | 'business' | 'academic';

export type ContentSource = 'manual' | ContentPackId;

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type LearningFilter = 'all' | 'personal' | CefrLevel;

export type CefrCatalogSource = 'cefr-j' | 'octanove';

export interface LearningPreferences {
  levels: CefrLevel[];
  topics: ContentPackId[];
}

export interface CefrCatalogEntry {
  id: string;
  term: string;
  normalizedTerm: string;
  level: CefrLevel;
  partOfSpeech: string;
  definition: string;
  example: string | null;
  catalogSenseId: string;
  source: CefrCatalogSource;
  sourceVersion: string;
  sourcePartOfSpeech: string[];
}

export interface Collection {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Word {
  id: string;
  collectionId: string;
  term: string;
  normalizedTerm: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  partOfSpeech: string | null;
  definition: string;
  example: string | null;
  translation: string | null;
  catalogSenseId: string | null;
  cefrLevel: CefrLevel | null;
  source: ContentSource;
  state: LearningState;
  understoodStreak: number;
  lapseCount: number;
  viewCount: number;
  lastViewedAt: string | null;
  lastRatedAt: string | null;
  nextReviewAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogSense {
  id: string;
  term: string;
  partOfSpeech: string;
  definition: string;
  example: string | null;
  rank: number;
}

export interface ReminderSettings {
  enabled: boolean;
  countPerDay: number;
  windowStartMinutes: number;
  windowEndMinutes: number;
  timeZoneId: string;
}

export interface DashboardStats {
  totalWords: number;
  newWords: number;
  difficultWords: number;
  understoodWords: number;
  learnedWords: number;
  viewedToday: number;
  viewedLifetime: number;
  notificationOpens: number;
  recentActivity: ActivityDay[];
}

export interface ActivityDay {
  date: string;
  count: number;
}
