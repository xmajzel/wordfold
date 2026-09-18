import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { AppText } from '@/components/app-text';
import { LearningRhythmChoice } from '@/components/learning-rhythm';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useAppData } from '@/providers/app-data-provider';

export default function LearningRhythmScreen() {
  const theme = useAppTheme();
  const { learningConfirmations, saveLearningRhythm } = useAppData();
  const [choice, setChoice] = useState(learningConfirmations);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await saveLearningRhythm(choice); router.back(); }
    catch (error) { Alert.alert('Could not save learning rhythm', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSaving(false); }
  };
  return <Screen scroll style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" accessibilityState={{ disabled: saving }}
        disabled={saving} onPress={() => router.back()}
        style={[styles.close, { backgroundColor: theme.surface, opacity: saving ? 0.45 : 1 }]}>
        <Ionicons name="close" color={theme.text} size={22}/>
      </Pressable>
      <AppText variant="title" style={styles.title}>Learning rhythm</AppText>
      <View style={styles.close}/>
    </View>
    <LearningRhythmChoice value={choice} onChange={setChoice} disabled={saving}/>
    <AppText variant="caption">Changes apply on the next review. Existing confirmations are kept, and already-learned words stay learned.</AppText>
    <PrimaryButton label="Save learning rhythm" loading={saving} onPress={() => void save()}/>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { gap: 12 },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, flexShrink: 0, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
});
