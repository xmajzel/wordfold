import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { readTodayWordWidgetTimeline } from './android-cache';
import { createTodayWordAndroidWidgetRepresentation } from './today-word-widget.android';
import {
  getStoredTodayWordWidgetProps,
  TODAY_WORD_WIDGET_NAME,
} from './today-word';

export async function todayWordWidgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== TODAY_WORD_WIDGET_NAME || props.widgetAction === 'WIDGET_DELETED') {
    return;
  }
  const timeline = await readTodayWordWidgetTimeline();
  const widgetProps = getStoredTodayWordWidgetProps(timeline);
  props.renderWidget(createTodayWordAndroidWidgetRepresentation(widgetProps, props.widgetInfo));
}
