import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  TODAY_WORD_WIDGET_CACHE_KEY,
  type StoredTodayWordWidgetTimelineEntry,
  type TodayWordWidgetTimelineEntry,
  storeTodayWordWidgetTimeline,
} from './today-word';

export async function writeTodayWordWidgetTimeline(timeline: TodayWordWidgetTimelineEntry[]) {
  await AsyncStorage.setItem(
    TODAY_WORD_WIDGET_CACHE_KEY,
    JSON.stringify(storeTodayWordWidgetTimeline(timeline)),
  );
}

export async function readTodayWordWidgetTimeline(): Promise<StoredTodayWordWidgetTimelineEntry[]> {
  const serialized = await AsyncStorage.getItem(TODAY_WORD_WIDGET_CACHE_KEY);
  if (!serialized) return [];
  try {
    const value: unknown = JSON.parse(serialized);
    if (!Array.isArray(value)) return [];
    return value.filter(isStoredTimelineEntry);
  } catch {
    return [];
  }
}

function isStoredTimelineEntry(value: unknown): value is StoredTodayWordWidgetTimelineEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<StoredTodayWordWidgetTimelineEntry>;
  const props = entry.props;
  return typeof entry.timestamp === 'number'
    && !!props
    && (props.status === 'word' || props.status === 'empty')
    && typeof props.wordId === 'string'
    && typeof props.term === 'string'
    && typeof props.definition === 'string'
    && typeof props.deepLink === 'string';
}
