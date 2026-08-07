import { requestWidgetUpdate } from 'react-native-android-widget';

import { writeTodayWordWidgetTimeline } from './android-cache';
import { createTodayWordAndroidWidgetRepresentation } from './today-word-widget.android';
import {
  getStoredTodayWordWidgetProps,
  storeTodayWordWidgetTimeline,
  TODAY_WORD_WIDGET_NAME,
  type TodayWordWidgetTimelineEntry,
} from './today-word';

export async function syncTodayWordWidget(timeline: TodayWordWidgetTimelineEntry[]) {
  await writeTodayWordWidgetTimeline(timeline);
  const props = getStoredTodayWordWidgetProps(storeTodayWordWidgetTimeline(timeline));
  await requestWidgetUpdate({
    widgetName: TODAY_WORD_WIDGET_NAME,
    renderWidget: (widgetInfo) => createTodayWordAndroidWidgetRepresentation(props, widgetInfo),
  });
}
