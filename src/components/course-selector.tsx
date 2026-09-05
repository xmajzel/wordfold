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
  descriptions,
}: {
  value: CourseId;
  onChange(courseId: CourseId): void;
  disabled?: boolean;
  descriptions?: Partial<Record<CourseId, string>>;
}) {
  const theme = useAppTheme();
  return <View testID="course-selector" accessibilityRole="radiogroup" accessibilityLabel="Learning course" style={styles.list}>
    {courseDefinitions.map((course) => {
      const selected = course.id === value;
      return <Pressable
        key={course.id}
        testID={`course-option-${course.id}`}
        accessibilityRole="radio"
        accessibilityLabel={course.directionLabel}
        accessibilityHint={descriptions?.[course.id] ?? course.description}
        accessibilityState={{ checked: selected, disabled }}
        aria-checked={selected}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => onChange(course.id)}
        style={({ pressed }) => [styles.card, {
          backgroundColor: selected ? theme.primarySoft : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
          opacity: disabled ? 0.55 : pressed ? 0.78 : 1,
        }]}
      >
        <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.icon, { backgroundColor: theme.surface }]}>
          <AppText style={styles.flag}>{course.id === 'es-sk' ? '🇪🇸' : '🇬🇧'}</AppText>
        </View>
        <View style={styles.text}>
          <AppText variant="heading">{course.directionLabel}</AppText>
          <AppText variant="caption" style={{ color: selected ? theme.text : theme.muted }}>{descriptions?.[course.id] ?? course.description}</AppText>
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
  text: { flex: 1, minWidth: 0, gap: 2 },
  flag: { fontSize: 28, lineHeight: 34 },
});
