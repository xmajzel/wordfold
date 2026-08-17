import type { SQLiteDatabase } from 'expo-sqlite';

import type { ReminderSettings, Word } from '@/domain/types';
import { rebuildReminderSchedule, requestReminderPermission } from './scheduler';

interface ScheduledRequest {
  identifier?: string;
  content: { title: string; data?: Record<string, unknown> };
}

const mockCancelAllScheduledNotificationsAsync = jest.fn(async () => undefined);
const mockGetPermissionsAsync = jest.fn(async () => ({ granted: true, canAskAgain: true }));
const mockRequestPermissionsAsync = jest.fn(async () => ({ granted: true, canAskAgain: true }));
const mockScheduleNotificationAsync = jest.fn(async (request: ScheduledRequest) => {
  await Promise.resolve();
  return request.identifier ?? 'notification';
});

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  cancelAllScheduledNotificationsAsync: () => mockCancelAllScheduledNotificationsAsync(),
  getPermissionsAsync: () => mockGetPermissionsAsync(),
  requestPermissionsAsync: () => mockRequestPermissionsAsync(),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args as [ScheduledRequest]),
  setNotificationChannelAsync: jest.fn(async () => undefined),
}));

const settings: ReminderSettings = {
  enabled: true,
  countPerDay: 1,
  windowStartMinutes: 10 * 60,
  windowEndMinutes: 20 * 60,
  timeZoneId: 'Europe/Bratislava',
};

function word(index: number): Word {
  return {
    id: `word-${index}`, collectionId: 'my-words', term: `word ${index}`, normalizedTerm: `word ${index}`,
    sourceLanguageCode: 'en', targetLanguageCode: 'sk', sourcePronunciationLocale: 'en-US', targetPronunciationLocale: 'sk-SK', partOfSpeech: 'noun',
    definition: `Definition ${index}`, example: null, translation: null, catalogSenseId: null, cefrLevel: null,
    source: 'manual', state: 'new', understoodStreak: 0, lapseCount: 0, viewCount: 0,
    lastViewedAt: null, lastRatedAt: null, nextReviewAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function database() {
  return { runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })) } as unknown as SQLiteDatabase;
}

describe('reminder scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  });

  it('returns an already-granted permission without prompting again', async () => {
    await expect(requestReminderPermission()).resolves.toEqual({ granted: true, canAskAgain: true });
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reports when the operating system cannot ask for permission again', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(requestReminderPermission()).resolves.toEqual({ granted: false, canAskAgain: false });
  });

  it('serializes concurrent rebuilds and uses deterministic unique requests', async () => {
    let activeSchedules = 0;
    let maximumConcurrentSchedules = 0;
    mockScheduleNotificationAsync.mockImplementation(async (request) => {
      activeSchedules += 1;
      maximumConcurrentSchedules = Math.max(maximumConcurrentSchedules, activeSchedules);
      await Promise.resolve();
      activeSchedules -= 1;
      return request.identifier ?? 'notification';
    });
    const words = Array.from({ length: 20 }, (_, index) => word(index));

    const counts = await Promise.all([
      rebuildReminderSchedule(database(), words, settings),
      rebuildReminderSchedule(database(), words, settings),
    ]);

    expect(maximumConcurrentSchedules).toBe(1);
    expect(mockCancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(2);
    const secondBuildRequests = mockScheduleNotificationAsync.mock.calls.slice(counts[0]).map(([request]) => request);
    expect(new Set(secondBuildRequests.map((request) => request.identifier)).size).toBe(counts[1]);
    expect(new Set(secondBuildRequests.map((request) => request.content.title)).size).toBe(counts[1]);
  });

  it('clears pending notifications without scheduling when reminders are disabled', async () => {
    const count = await rebuildReminderSchedule(database(), [word(1)], { ...settings, enabled: false });

    expect(count).toBe(0);
    expect(mockCancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('keeps the displayed word and navigation payload aligned', async () => {
    await rebuildReminderSchedule(database(), [word(7)], settings);

    expect(mockScheduleNotificationAsync).toHaveBeenCalled();
    expect(mockScheduleNotificationAsync.mock.calls[0][0].content).toMatchObject({
      title: 'word 7',
      data: { wordId: 'word-7', url: '/word/word-7' },
    });
  });
});
