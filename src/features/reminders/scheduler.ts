import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ReminderSettings, Word } from '@/domain/types';
import { buildLearningFeed } from '@/features/learning/algorithm';
import { calculateReminderSlots } from './slots';

const CHANNEL_ID = 'word-reminders';
let rebuildQueue: Promise<unknown> = Promise.resolve();

export interface ReminderPermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

function hasReminderPermission(permission: Notifications.NotificationPermissionsStatus) {
  return permission.granted
    || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function prepareNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Word reminders',
    description: 'Preferred-time reminders containing a word and its definition.',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 120],
    lightColor: '#4F4DBB',
  });
}

export async function requestReminderPermission(): Promise<ReminderPermissionResult> {
  await prepareNotificationChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (hasReminderPermission(existing)) {
    return { granted: true, canAskAgain: existing.canAskAgain };
  }
  const requested = await Notifications.requestPermissionsAsync();
  return { granted: hasReminderPermission(requested), canAskAgain: requested.canAskAgain };
}

export async function clearScheduledReminders(database: SQLiteDatabase) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await database.runAsync('DELETE FROM scheduled_reminders');
}

function upcomingDates(settings: ReminderSettings, now = new Date()) {
  const horizonDays = settings.countPerDay <= 3 ? 14 : 7;
  const slots = calculateReminderSlots(
    settings.windowStartMinutes,
    settings.windowEndMinutes,
    settings.countPerDay,
  );
  const dates: Date[] = [];
  for (let day = 0; day < horizonDays; day += 1) {
    for (const minutes of slots) {
      const date = new Date(now);
      date.setDate(now.getDate() + day);
      date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
      if (date > now) dates.push(date);
    }
  }
  return dates;
}

function pickWord(words: Word[], date: Date, usedWordIds: Set<string>) {
  const activeWords = words.filter((word) => word.state !== 'learned');
  const ranked = buildLearningFeed(activeWords, date);
  const fallback = activeWords
    .filter((word) => !ranked.some((rankedWord) => rankedWord.id === word.id))
    .sort((left, right) => (left.lastViewedAt ?? '').localeCompare(right.lastViewedAt ?? ''));
  const candidates = [...ranked, ...fallback];
  const unused = candidates.find((word) => !usedWordIds.has(word.id));
  if (unused) return unused;
  usedWordIds.clear();
  return candidates[0] ?? null;
}

async function performReminderScheduleRebuild(
  database: SQLiteDatabase,
  words: Word[],
  settings: ReminderSettings,
) {
  await clearScheduledReminders(database);
  if (!settings.enabled || words.every((word) => word.state === 'learned')) return 0;

  const permission = await Notifications.getPermissionsAsync();
  const allowed = hasReminderPermission(permission);
  if (!allowed) return 0;

  await prepareNotificationChannel();
  const usedWordIds = new Set<string>();
  let count = 0;
  for (const date of upcomingDates(settings)) {
    const word = pickWord(words, date, usedWordIds);
    if (!word) break;
    usedWordIds.add(word.id);
    const notificationId = await Notifications.scheduleNotificationAsync({
      identifier: `wordfold-${date.getTime()}`,
      content: {
        title: word.term,
        body: word.definition.length > 130 ? `${word.definition.slice(0, 127)}...` : word.definition,
        data: { url: `/word/${word.id}`, wordId: word.id },
        color: '#4F4DBB',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: CHANNEL_ID,
      },
    });
    await database.runAsync(
      'INSERT INTO scheduled_reminders (notification_id, word_id, scheduled_at) VALUES (?, ?, ?)',
      notificationId, word.id, date.toISOString(),
    );
    count += 1;
  }
  return count;
}

export function rebuildReminderSchedule(
  database: SQLiteDatabase,
  words: Word[],
  settings: ReminderSettings,
) {
  const rebuild = rebuildQueue.then(() => performReminderScheduleRebuild(database, words, settings));
  rebuildQueue = rebuild.catch(() => undefined);
  return rebuild;
}
