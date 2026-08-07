import { Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  multilineTextAlignment,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { TodayWordWidgetProps } from './today-word';

function TodayWordWidgetView(props: TodayWordWidgetProps, environment: WidgetEnvironment) {
  'widget';
  const wide = environment.widgetFamily === 'systemMedium';
  const dark = environment.colorScheme === 'dark';
  const backgroundColor = dark ? '#25213B' : '#FFFFFF';
  const textColor = dark ? '#F8F5FF' : '#1E1A35';
  const mutedColor = dark ? '#B8B1CA' : '#716C86';
  const primaryColor = dark ? '#B9B1FF' : '#6657D9';

  return (
    <VStack
      alignment="leading"
      spacing={wide ? 7 : 5}
      modifiers={[containerBackground(backgroundColor, 'widget'), widgetURL(props.deepLink)]}>
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(primaryColor)]}>
        WORDFOLD · TODAY
      </Text>
      <Text modifiers={[
        font({ size: wide ? 30 : 25, weight: 'bold', design: 'serif' }),
        foregroundStyle(textColor),
        lineLimit(1),
      ]}>
        {props.term}
      </Text>
      <Text modifiers={[
        font({ size: wide ? 15 : 13 }),
        foregroundStyle(mutedColor),
        lineLimit(wide ? 3 : 2),
        multilineTextAlignment('leading'),
      ]}>
        {props.definition}
      </Text>
      {wide ? <Spacer minLength={2} /> : null}
      {wide ? (
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(primaryColor)]}>
          {props.status === 'word' ? 'Tap to study' : 'Open Wordfold'}
        </Text>
      ) : null}
    </VStack>
  );
}

export default createWidget<TodayWordWidgetProps>('TodayWordWidget', TodayWordWidgetView);
