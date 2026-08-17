import type { Word } from '@/domain/types';
import { buildReminderWordCandidates } from '@/features/reminders/word-selector';

export const TODAY_WORD_WIDGET_NAME = 'TodayWordWidget';
export const TODAY_WORD_WIDGET_CACHE_KEY = '@wordfold/today-word-widget-timeline';
export const TODAY_WORD_WIDGET_FUTURE_DAYS = 14;

export interface TodayWordWidgetProps {
  status: 'word' | 'empty';
  wordId: string;
  term: string;
  definition: string;
  deepLink: string;
}

export interface TodayWordWidgetTimelineEntry {
  date: Date;
  props: TodayWordWidgetProps;
}

export interface StoredTodayWordWidgetTimelineEntry {
  timestamp: number;
  props: TodayWordWidgetProps;
}

export function getTodayWordWidgetProps(words: Word[], date = new Date()): TodayWordWidgetProps {
  const word = buildReminderWordCandidates(words, date)[0];
  if (!word) {
    return {
      status: 'empty',
      wordId: '',
      term: 'All words learned',
      definition: 'Add or reset a word in Wordfold.',
      deepLink: 'wordfold://',
    };
  }

  return {
    status: 'word',
    wordId: word.id,
    term: word.term,
    definition: word.definition,
    deepLink: `wordfold://word/${encodeURIComponent(word.id)}`,
  };
}

export function buildTodayWordWidgetTimeline(
  words: Word[],
  now = new Date(),
  futureDays = TODAY_WORD_WIDGET_FUTURE_DAYS,
): TodayWordWidgetTimelineEntry[] {
  const entries: TodayWordWidgetTimelineEntry[] = [{
    date: new Date(now),
    props: getTodayWordWidgetProps(words, now),
  }];
  const nextDate = new Date(now);
  nextDate.setHours(0, 0, 0, 0);

  for (let day = 1; day <= futureDays; day += 1) {
    const date = new Date(nextDate);
    date.setDate(nextDate.getDate() + day);
    entries.push({ date, props: getTodayWordWidgetProps(words, date) });
  }

  return entries;
}

export function storeTodayWordWidgetTimeline(
  timeline: TodayWordWidgetTimelineEntry[],
): StoredTodayWordWidgetTimelineEntry[] {
  return timeline.map((entry) => ({ timestamp: entry.date.getTime(), props: entry.props }));
}

export function getStoredTodayWordWidgetProps(
  timeline: StoredTodayWordWidgetTimelineEntry[],
  now = Date.now(),
) {
  if (timeline.length === 0) return getTodayWordWidgetProps([]);
  let current = timeline[0].props;
  for (const entry of timeline) {
    if (entry.timestamp > now) break;
    current = entry.props;
  }
  return current;
}
