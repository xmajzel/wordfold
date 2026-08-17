import TodayWordWidget from './today-word-widget.ios';
import type { TodayWordWidgetTimelineEntry } from './today-word';

export async function syncTodayWordWidget(timeline: TodayWordWidgetTimelineEntry[]) {
  TodayWordWidget.updateTimeline(timeline);
}
