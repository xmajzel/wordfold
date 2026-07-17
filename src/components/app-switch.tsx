import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  cancelAnimation,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useAppTheme } from '@/hooks/use-app-theme';

interface AppSwitchProps {
  value: boolean;
  onValueChange(value: boolean): void;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}

export function AppSwitch({ value, onValueChange, accessibilityLabel, disabled = false, testID }: AppSwitchProps) {
  const theme = useAppTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.set(withSpring(value ? 1 : 0, {
      damping: 18,
      stiffness: 260,
      mass: 0.7,
      reduceMotion: ReduceMotion.System,
    }));
    return () => cancelAnimation(progress);
  }, [progress, value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [`${theme.muted}55`, theme.primary],
    ),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 20 }],
  }));

  const toggle = () => {
    if (disabled) return;
    void Haptics.selectionAsync();
    onValueChange(!value);
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      hitSlop={6}
      onPress={toggle}
      testID={testID}
      style={({ pressed }) => [
        styles.touchTarget,
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}>
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, { shadowColor: theme.shadow }, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    width: 51,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    width: 51,
    height: 31,
    borderRadius: 16,
    padding: 2,
    justifyContent: 'center',
  },
  thumb: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 3,
    elevation: 3,
  },
});
