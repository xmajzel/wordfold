import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/app-text';
import { courseDefinitions, type CourseId } from '@/domain/courses';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

export function CourseSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: CourseId;
  onChange(courseId: CourseId): void;
  disabled?: boolean;
}) {
  const theme = useAppTheme();
  return <View accessibilityRole="radiogroup" style={styles.list}>
    {courseDefinitions.map((course) => {
      const selected = course.id === value;
      return <Pressable
        key={course.id}
        accessibilityRole="radio"
        accessibilityLabel={course.directionLabel}
        accessibilityHint={course.description}
        accessibilityState={{ checked: selected, disabled }}
        disabled={disabled}
        onPress={() => onChange(course.id)}
        style={({ pressed }) => [styles.card, {
          backgroundColor: selected ? theme.primarySoft : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
          opacity: disabled ? 0.55 : pressed ? 0.78 : 1,
        }]}
      >
        <View style={[styles.icon, { backgroundColor: selected ? theme.primary : theme.raised }]}>
          <Ionicons name="language-outline" color={selected ? '#FFFFFF' : theme.primary} size={24}/>
        </View>
        <View style={styles.text}>
          <AppText variant="heading">{course.directionLabel}</AppText>
          <AppText variant="caption" style={{ color: theme.muted }}>{course.description}</AppText>
        </View>
        <Ionicons
          name={selected ? 'radio-button-on' : 'radio-button-off'}
          color={selected ? theme.primary : theme.muted}
          size={24}
        />
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: {
    minHeight: 104,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: { width: 48, height: 48, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
