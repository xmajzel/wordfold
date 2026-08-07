'use no memo';

import { FlexWidget, TextWidget, type WidgetInfo } from 'react-native-android-widget';

import type { TodayWordWidgetProps } from './today-word';

interface AndroidWidgetTheme {
  background: `#${string}`;
  text: `#${string}`;
  muted: `#${string}`;
  primary: `#${string}`;
}

export function createTodayWordAndroidWidgetRepresentation(
  props: TodayWordWidgetProps,
  widgetInfo: WidgetInfo,
) {
  const wide = widgetInfo.width >= 220;
  return {
    light: <TodayWordAndroidWidget props={props} wide={wide} theme={{
      background: '#FFFFFF', text: '#1E1A35', muted: '#716C86', primary: '#6657D9',
    }} />,
    dark: <TodayWordAndroidWidget props={props} wide={wide} theme={{
      background: '#25213B', text: '#F8F5FF', muted: '#B8B1CA', primary: '#B9B1FF',
    }} />,
  };
}

function TodayWordAndroidWidget({ props, wide, theme }: {
  props: TodayWordWidgetProps;
  wide: boolean;
  theme: AndroidWidgetTheme;
}) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: props.deepLink }}
      accessibilityLabel={`${props.term}. ${props.definition}`}
      style={{
        width: 'match_parent',
        height: 'match_parent',
        padding: wide ? 18 : 14,
        borderRadius: 20,
        backgroundColor: theme.background,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        flexGap: wide ? 6 : 4,
      }}>
      <TextWidget
        text="WORDFOLD · TODAY"
        maxLines={1}
        style={{ color: theme.primary, fontSize: 11, fontWeight: 'bold', letterSpacing: 0.8 }}
      />
      <TextWidget
        text={props.term}
        maxLines={1}
        truncate="END"
        style={{
          width: 'match_parent', color: theme.text, fontSize: wide ? 29 : 24,
          lineHeight: wide ? 34 : 28, fontWeight: 'bold', adjustsFontSizeToFit: true,
        }}
      />
      <TextWidget
        text={props.definition}
        maxLines={wide ? 3 : 2}
        truncate="END"
        style={{
          width: 'match_parent', color: theme.muted, fontSize: wide ? 15 : 13,
          lineHeight: wide ? 19 : 16,
        }}
      />
      {wide ? (
        <TextWidget
          text={props.status === 'word' ? 'Tap to study' : 'Open Wordfold'}
          maxLines={1}
          style={{ color: theme.primary, fontSize: 11, fontWeight: 'bold' }}
        />
      ) : null}
    </FlexWidget>
  );
}
