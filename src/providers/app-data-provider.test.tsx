import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

import type { Word } from '@/domain/types';
import * as repository from '@/data/repository';

import { AppDataProvider, useAppData } from './app-data-provider';

const mockSQLiteProvider = jest.fn(({ children }: { children: ReactNode }) => children);
const mockRebuildReminderSchedule = jest.fn(async (..._args: unknown[]) => 0);
const mockTranslateEnglishToSlovak = jest.fn(async (_text: string) => 'osobný preklad');
const mockPrepareTranslationError = jest.fn();

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ status: 'signedOut', user: null }),
}));
jest.mock('@/providers/sync-provider', () => ({
  useSync: () => ({ phase: 'signedOut', hasSynced: false }),
}));
jest.mock('@/providers/purchase-provider', () => ({
  usePurchase: () => ({ unlimited: false }),
}));
jest.mock('@/data/sync/database', () => ({ powerSyncDatabase: {} }));
jest.mock('@/data/supabase/client', () => ({ supabase: null }));
jest.mock('@/data/sync/guest-import-remote', () => ({ SupabaseGuestImportRemote: jest.fn() }));
jest.mock('@/data/sync/guest-import', () => ({
  GuestImportCancelledError: class GuestImportCancelledError extends Error {},
  GuestImportService: jest.fn(),
}));

jest.mock('../../assets/catalog/wordnet.sqlite', () => 1);

jest.mock('expo-sqlite', () => ({
  SQLiteProvider: (props: { children: ReactNode }) => mockSQLiteProvider(props),
  useSQLiteContext: jest.fn(() => ({})),
}));

jest.mock('@/data/repository', () => ({
  listWords: jest.fn(async () => []),
  listCollections: jest.fn(async () => []),
  getStats: jest.fn(async () => ({
    totalWords: 0,
    newWords: 0,
    difficultWords: 0,
    understoodWords: 0,
    learnedWords: 0,
    viewedToday: 0,
    viewedLifetime: 0,
    notificationOpens: 0,
    recentActivity: [],
  })),
  getReminderSettings: jest.fn(async () => ({
    enabled: false,
    countPerDay: 1,
    windowStartMinutes: 600,
    windowEndMinutes: 1200,
    timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
  })),
  getLearningPreferences: jest.fn(async () => ({ levels: [], topics: [] })),
  getActiveCourseId: jest.fn(async () => 'en-sk'),
  saveActiveCourseId: jest.fn(async () => undefined),
  getPronunciationVoicePreference: jest.fn(async () => 'device'),
  savePronunciationVoicePreference: jest.fn(async () => undefined),
  isOnboardingComplete: jest.fn(async () => false),
  getLearningFilter: jest.fn(async () => 'all'),
  getWord: jest.fn(async () => null),
  saveRating: jest.fn(async () => undefined),
  resetWord: jest.fn(async () => undefined),
  updateWordTranslation: jest.fn(async () => '2026-07-19T10:00:00.000Z'),
  updateMissingWordTranslations: jest.fn(async (_database, updates: { id: string }[]) => ({
    updatedAt: updates.length ? '2026-07-19T09:00:00.000Z' : null,
    updatedIds: updates.map((update) => update.id),
  })),
}));

jest.mock('@/data/cefr-catalog', () => ({
  getCefrTranslation: (_catalogSenseId: string | null, normalizedTerm: string | null) =>
    normalizedTerm === 'catalog-word' ? 'katalógový preklad' : null,
}));

jest.mock('@/features/translation/translator', () => ({
  isOnDeviceTranslationPairSupported: (source: string, target: string) => (
    (source === 'en' || source === 'es') && target === 'sk'
  ),
  translateOnDevice: (text: string) => mockTranslateEnglishToSlovak(text),
}));

jest.mock('@/features/reminders/scheduler', () => ({
  rebuildReminderSchedule: (...args: unknown[]) => mockRebuildReminderSchedule(...args),
}));

const word: Word = {
  id: 'word', collectionId: 'collection', term: 'scope', normalizedTerm: 'scope',
  sourceLanguageCode: 'en', targetLanguageCode: 'sk', sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK', partOfSpeech: 'noun',
  definition: 'The extent of something.', example: null, translation: 'rozsah',
  catalogSenseId: null, cefrLevel: null, source: 'manual', state: 'new',
  understoodStreak: 0, lapseCount: 0, viewCount: 1,
  lastViewedAt: '2026-07-17T10:00:00.000Z', lastRatedAt: null, nextReviewAt: null,
  createdAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-17T10:00:00.000Z',
};

function StopReviewProbe() {
  const { words, rateWord } = useAppData();
  if (!words[0]) return <Text>Loading words</Text>;
  return <Pressable accessibilityRole="button" onPress={() => void rateWord(words[0], 'learned')}><Text>Stop reviews</Text></Pressable>;
}

function RefreshProbe() {
  const { words, refresh } = useAppData();
  return <Pressable accessibilityRole="button" onPress={() => void refresh()}>
    <Text>{`Refresh words: ${words[0]?.state ?? 'loading'}`}</Text>
  </Pressable>;
}

function ResetReviewProbe() {
  const { words, resetWord } = useAppData();
  if (!words[0]) return <Text>Loading words</Text>;
  return <Pressable accessibilityRole="button" onPress={() => void resetWord(words[0].id)}>
    <Text>{`Reset word: ${words[0].state}`}</Text>
  </Pressable>;
}

function TranslationProbe() {
  const { saveWordTranslation } = useAppData();
  return <Pressable accessibilityRole="button" onPress={() => void saveWordTranslation(word.id, 'rozsah')}><Text>Save translation</Text></Pressable>;
}

function PrepareTranslationProbe() {
  const { words, prepareWordTranslation } = useAppData();
  if (!words[0]) return <Text>Loading words</Text>;
  return <Pressable accessibilityRole="button" onPress={() => void prepareWordTranslation(words[0])}>
    <Text>{words[0].translation ?? 'Prepare translation'}</Text>
  </Pressable>;
}

function PrepareTranslationErrorProbe() {
  const { words, prepareWordTranslation } = useAppData();
  if (!words[0]) return <Text>Loading words</Text>;
  return <Pressable accessibilityRole="button" onPress={() => {
    void prepareWordTranslation(words[0]).catch(mockPrepareTranslationError);
  }}><Text>Prepare translation</Text></Pressable>;
}

function CourseProbe() {
  const { activeCourseId, activeCourse, words, switchActiveCourse } = useAppData();
  return <Pressable accessibilityRole="button" onPress={() => void switchActiveCourse('es-sk').catch(() => undefined)}>
    <Text>{`${activeCourseId}:${activeCourse.displayName}:${words.length}`}</Text>
  </Pressable>;
}

describe('AppDataProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses Suspense for only one SQLite provider', async () => {
    const providerTree = AppDataProvider({ children: <Text>Ready</Text> }) as ReactElement<{
      children: ReactElement<{ databaseName: string; useSuspense?: boolean }>;
    }>;
    expect(providerTree.props.children.props.useSuspense).toBe(true);

    const view = await render(<AppDataProvider><Text>Ready</Text></AppDataProvider>);
    view.getByText('Ready');

    const providerCalls = mockSQLiteProvider.mock.calls
      .map(([props]) => props as unknown as { databaseName: string; useSuspense?: boolean });
    const catalogProvider = providerCalls.find(({ databaseName }) => databaseName === 'wordnet.sqlite');

    expect(catalogProvider?.useSuspense).not.toBe(true);
  });

  it('switches courses without replacing vocabulary and loads course-scoped settings', async () => {
    (repository.listWords as jest.Mock).mockResolvedValue([word]);
    (repository.getLearningPreferences as jest.Mock).mockResolvedValueOnce({ levels: [], topics: [] })
      .mockResolvedValueOnce({ levels: ['A2'], topics: ['spoken'] });
    const view = await render(<AppDataProvider><CourseProbe/></AppDataProvider>);
    const switchButton = await waitFor(() => view.getByRole('button', {
      name: 'en-sk:English with Slovak hints:1',
    }));

    await fireEvent.press(switchButton);

    await waitFor(() => view.getByText('es-sk:Spanish with Slovak hints:1'));
    expect(repository.saveActiveCourseId).toHaveBeenCalledWith(expect.anything(), 'es-sk');
    expect(repository.getLearningPreferences).toHaveBeenCalledWith(expect.anything(), 'es-sk');
    expect(repository.getStats).toHaveBeenCalledWith(expect.anything(), 'es-sk');
  });

  it('does not persist a course switch when scoped data cannot be loaded', async () => {
    (repository.listWords as jest.Mock).mockResolvedValue([word]);
    const healthyStats = {
        totalWords: 1, newWords: 1, difficultWords: 0, understoodWords: 0, learnedWords: 0,
        viewedToday: 0, viewedLifetime: 1, notificationOpens: 0, recentActivity: [],
      };
    (repository.getStats as jest.Mock).mockImplementation(async (_database, courseId = 'en-sk') => {
      if (courseId === 'es-sk') throw new Error('stats unavailable');
      return healthyStats;
    });
    const view = await render(<AppDataProvider><CourseProbe/></AppDataProvider>);
    const switchButton = await waitFor(() => view.getByRole('button', {
      name: 'en-sk:English with Slovak hints:1',
    }));

    await fireEvent.press(switchButton);

    await waitFor(() => expect(repository.getStats).toHaveBeenCalledWith(expect.anything(), 'es-sk'));
    expect(repository.saveActiveCourseId).not.toHaveBeenCalled();
    view.getByText('en-sk:English with Slovak hints:1');
    (repository.getStats as jest.Mock).mockResolvedValue(healthyStats);
  });

  it('rebuilds pending reminders after reviews are stopped', async () => {
    (repository.listWords as jest.Mock).mockResolvedValue([word]);
    (repository.getWord as jest.Mock).mockResolvedValue(word);
    const view = await render(<AppDataProvider><StopReviewProbe/></AppDataProvider>);
    const stopButton = await waitFor(() => view.getByRole('button', { name: 'Stop reviews' }));
    await waitFor(() => expect(mockRebuildReminderSchedule).toHaveBeenCalled());
    mockRebuildReminderSchedule.mockClear();

    await fireEvent.press(stopButton);

    await waitFor(() => expect(repository.saveRating).toHaveBeenCalledWith(
      expect.anything(),
      word.id,
      'learned',
      expect.objectContaining({ state: 'learned', nextReviewAt: null }),
    ));
    await waitFor(() => expect(mockRebuildReminderSchedule).toHaveBeenCalledTimes(1));
  });

  it('waits for reminder writes before saving a translation', async () => {
    let finishReminderWrite!: () => void;
    mockRebuildReminderSchedule.mockImplementationOnce(() => new Promise<number>((resolve) => {
      finishReminderWrite = () => resolve(0);
    }));
    const view = await render(<AppDataProvider><TranslationProbe/></AppDataProvider>);
    const saveButton = await waitFor(() => view.getByRole('button', { name: 'Save translation' }));
    await waitFor(() => expect(mockRebuildReminderSchedule).toHaveBeenCalledTimes(1));

    await fireEvent.press(saveButton);
    expect(repository.updateWordTranslation).not.toHaveBeenCalled();

    await act(async () => finishReminderWrite());
    await waitFor(() => expect(repository.updateWordTranslation).toHaveBeenCalledWith(
      expect.anything(),
      word.id,
      'rozsah',
    ));
  });

  it('does not mutate a saved catalog word that has no translation during refresh', async () => {
    const catalogWord = { ...word, id: 'catalog', normalizedTerm: 'catalog-word', translation: null, cefrLevel: 'A1' as const };
    (repository.listWords as jest.Mock).mockResolvedValue([catalogWord]);

    await render(<AppDataProvider><Text>Ready</Text></AppDataProvider>);

    await waitFor(() => expect(repository.listWords).toHaveBeenCalled());
    expect(repository.updateMissingWordTranslations).not.toHaveBeenCalled();
    expect(repository.updateWordTranslation).not.toHaveBeenCalled();
    expect(mockTranslateEnglishToSlovak).not.toHaveBeenCalled();
  });

  it('never replaces a missing reviewed catalog hint with runtime translation', async () => {
    const catalogWord = {
      ...word, id: 'catalog', normalizedTerm: 'missing-catalog-hint', translation: null,
      catalogSenseId: 'catalog-sense', cefrLevel: 'A1' as const,
    };
    (repository.listWords as jest.Mock).mockResolvedValue([catalogWord]);
    (repository.getWord as jest.Mock).mockResolvedValue(catalogWord);
    const view = await render(<AppDataProvider><PrepareTranslationErrorProbe/></AppDataProvider>);

    const prepareButton = await waitFor(() => view.getByRole('button', { name: 'Prepare translation' }));
    await fireEvent.press(prepareButton);

    await waitFor(() => expect(mockPrepareTranslationError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('reviewed Slovak hint') }),
    ));
    expect(mockTranslateEnglishToSlovak).not.toHaveBeenCalled();
  });

  it('does not translate a saved personal word in the background', async () => {
    const personalWord = { ...word, id: 'personal', term: 'private term', normalizedTerm: 'private-term', translation: null };
    (repository.listWords as jest.Mock).mockResolvedValue([personalWord]);

    await render(<AppDataProvider><Text>Ready</Text></AppDataProvider>);

    await waitFor(() => expect(repository.listWords).toHaveBeenCalled());
    expect(mockTranslateEnglishToSlovak).not.toHaveBeenCalled();
    expect(repository.updateWordTranslation).not.toHaveBeenCalled();
  });

  it('prepares an explicitly requested hint in memory without persisting the saved word', async () => {
    const personalWord = { ...word, id: 'personal', term: 'private term', normalizedTerm: 'private-term', translation: null };
    (repository.listWords as jest.Mock).mockResolvedValue([personalWord]);
    (repository.getWord as jest.Mock).mockResolvedValue(personalWord);
    const view = await render(<AppDataProvider><PrepareTranslationProbe/></AppDataProvider>);

    const prepareButton = await waitFor(() => view.getByRole('button', { name: 'Prepare translation' }));
    await fireEvent.press(prepareButton);

    await waitFor(() => view.getByText('osobný preklad'));
    expect(repository.updateWordTranslation).not.toHaveBeenCalled();
    expect(repository.updateMissingWordTranslations).not.toHaveBeenCalled();
  });

  it('prepares an explicitly requested Spanish hint in memory', async () => {
    const spanishWord = {
      ...word, id: 'spanish', term: 'corazón', normalizedTerm: 'corazón', translation: null,
      catalogSenseId: null, sourceLanguageCode: 'es', sourcePronunciationLocale: 'es-ES',
    };
    (repository.listWords as jest.Mock).mockResolvedValue([spanishWord]);
    (repository.getWord as jest.Mock).mockResolvedValue(spanishWord);
    const view = await render(<AppDataProvider><PrepareTranslationProbe/></AppDataProvider>);

    const prepareButton = await waitFor(() => view.getByRole('button', { name: 'Prepare translation' }));
    await fireEvent.press(prepareButton);

    await waitFor(() => view.getByText('osobný preklad'));
    expect(mockTranslateEnglishToSlovak).toHaveBeenCalledWith('corazón');
    expect(repository.updateWordTranslation).not.toHaveBeenCalled();
  });

  it('does not translate unsupported language pairs in the background', async () => {
    const spanishWord = {
      ...word, id: 'spanish', term: 'hola', normalizedTerm: 'hola', translation: null,
      sourceLanguageCode: 'es', sourcePronunciationLocale: 'es-ES',
    };
    (repository.listWords as jest.Mock).mockResolvedValue([spanishWord]);

    await render(<AppDataProvider><Text>Ready</Text></AppDataProvider>);

    await waitFor(() => expect(repository.listWords).toHaveBeenCalled());
    expect(mockTranslateEnglishToSlovak).not.toHaveBeenCalled();
  });

  it('rebuilds pending reminders when refreshed words contain a newly learned word', async () => {
    let storedWords = [word];
    (repository.listWords as jest.Mock).mockImplementation(async () => storedWords);
    const view = await render(<AppDataProvider><RefreshProbe/></AppDataProvider>);
    const refreshButton = await waitFor(() => view.getByRole('button', { name: 'Refresh words: new' }));
    await waitFor(() => expect(mockRebuildReminderSchedule).toHaveBeenCalled());
    mockRebuildReminderSchedule.mockClear();

    const refreshCount = (repository.listWords as jest.Mock).mock.calls.length;
    await fireEvent.press(refreshButton);
    await waitFor(() => expect((repository.listWords as jest.Mock).mock.calls.length).toBeGreaterThan(refreshCount));
    expect(mockRebuildReminderSchedule).not.toHaveBeenCalled();

    storedWords = [{ ...word, state: 'learned', nextReviewAt: null }];
    await fireEvent.press(refreshButton);

    await waitFor(() => view.getByRole('button', { name: 'Refresh words: learned' }));
    await waitFor(() => expect(mockRebuildReminderSchedule).toHaveBeenCalledTimes(1));
    expect(mockRebuildReminderSchedule.mock.calls[0][1]).toEqual([
      expect.objectContaining({ id: word.id, state: 'learned' }),
    ]);
  });

  it('does not duplicate the startup reminder rebuild when the learned baseline loads', async () => {
    (repository.listWords as jest.Mock).mockResolvedValue([{ ...word, state: 'learned' }]);

    const view = await render(<AppDataProvider><RefreshProbe/></AppDataProvider>);

    await waitFor(() => view.getByRole('button', { name: 'Refresh words: learned' }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRebuildReminderSchedule).toHaveBeenCalledTimes(1);
  });

  it('rebuilds pending reminders when a learned word is reset', async () => {
    let storedWords: Word[] = [{ ...word, state: 'learned' }];
    (repository.listWords as jest.Mock).mockImplementation(async () => storedWords);
    (repository.resetWord as jest.Mock).mockImplementation(async () => {
      storedWords = [word];
    });
    const view = await render(<AppDataProvider><ResetReviewProbe/></AppDataProvider>);
    const resetButton = await waitFor(() => view.getByRole('button', { name: 'Reset word: learned' }));
    await waitFor(() => expect(mockRebuildReminderSchedule).toHaveBeenCalled());
    mockRebuildReminderSchedule.mockClear();

    await fireEvent.press(resetButton);

    await waitFor(() => view.getByRole('button', { name: 'Reset word: new' }));
    await waitFor(() => expect(mockRebuildReminderSchedule).toHaveBeenCalledTimes(1));
    expect(mockRebuildReminderSchedule.mock.calls[0][1]).toEqual([
      expect.objectContaining({ id: word.id, state: 'new' }),
    ]);
  });
});
