import { StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';

/** Parent flex rows may wrap this unit, but not its count away from its label. */
export function ProgressCountLabel({ value, label, emphasizeValue = false, testID }: {
  value: number;
  label: string;
  emphasizeValue?: boolean;
  testID?: string;
}) {
  const theme = useAppTheme();
  const count = value.toLocaleString().replace(/\s/gu, '\u00a0');
  const suffix = `\u00a0${label.replace(/\s/gu, '\u00a0')}`;
  return <AppText testID={testID} variant="caption" style={[styles.unit, emphasizeValue && styles.emphasizedLine, { color: theme.muted }]}>
    {emphasizeValue ? <AppText variant="label">{count}</AppText> : count}{suffix}
  </AppText>;
}

const styles = StyleSheet.create({ unit: { flexShrink: 0 }, emphasizedLine: { lineHeight: 20 } });
