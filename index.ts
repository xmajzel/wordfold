import 'expo-router/entry';

import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { todayWordWidgetTaskHandler } from './src/features/widgets/widget-task-handler';

if (Platform.OS === 'android') {
  registerWidgetTaskHandler(todayWordWidgetTaskHandler);
}
