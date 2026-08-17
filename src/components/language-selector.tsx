import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { getLanguageOption, languageOptions } from '@/domain/languages';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

interface LanguageSelectorProps {
  label: string;
  languageCode: string;
  pronunciationLocale: string;
  onChange(languageCode: string, pronunciationLocale: string): void;
}

export function LanguageSelector({
  label,
  languageCode,
  pronunciationLocale,
  onChange,
}: LanguageSelectorProps) {
  const theme = useAppTheme();
  const selectedLanguage = getLanguageOption(languageCode) ?? languageOptions[0];

  return <View style={styles.group}>
    <AppText variant="label">{label}</AppText>
    <View style={styles.chips}>
      {languageOptions.map((language) => {
        const selected = language.code === languageCode;
        return <Pressable
          key={language.code}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${language.label}`}
          accessibilityState={{ selected }}
          onPress={() => onChange(language.code, language.defaultPronunciationLocale)}
          style={[styles.chip, {
            backgroundColor: selected ? theme.primary : theme.surface,
            borderColor: selected ? theme.primary : theme.border,
          }]}
        >
          <AppText variant="label" style={{ color: selected ? '#FFFFFF' : theme.text }}>
            {language.label}
          </AppText>
        </Pressable>;
      })}
    </View>
    {selectedLanguage.pronunciationLocales.length > 1 ? <>
      <AppText variant="caption" style={{ color: theme.muted }}>Pronunciation region</AppText>
      <View style={styles.chips}>
        {selectedLanguage.pronunciationLocales.map((locale) => {
          const selected = locale.code === pronunciationLocale;
          return <Pressable
            key={locale.code}
            accessibilityRole="button"
            accessibilityLabel={`${label} pronunciation: ${locale.label}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(languageCode, locale.code)}
            style={[styles.localeChip, {
              backgroundColor: selected ? theme.primarySoft : theme.surface,
              borderColor: selected ? theme.primary : theme.border,
            }]}
          >
            <AppText variant="caption" style={{ color: selected ? theme.primary : theme.text }}>
              {locale.label}
            </AppText>
          </Pressable>;
        })}
      </View>
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  localeChip: {
    minHeight: 36, paddingHorizontal: spacing.md, borderWidth: 1, borderRadius: radii.pill,
    alignItems: 'center', justifyContent: 'center',
  },
});
