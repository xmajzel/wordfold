import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import {
  usePrivatePronunciationConsent,
} from '@/features/pronunciation/private-consent-provider';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

const AZURE_PRIVACY_URL =
  'https://learn.microsoft.com/en-us/azure/ai-services/speech-service/'
  + 'text-to-speech/data-privacy-security';

export default function PrivatePronunciationScreen() {
  const theme = useAppTheme();
  const consent = usePrivatePronunciationConsent();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const enable = async () => {
    setWorking(true);
    setMessage(null);
    try {
      await consent.enable();
      setMessage('Cloud neural pronunciation is enabled for this account on this device.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Cloud pronunciation could not be enabled.');
    } finally {
      setWorking(false);
    }
  };

  const deleteData = async (retry = false) => {
    setWorking(true);
    setMessage(null);
    try {
      if (retry) await consent.retryDeletion();
      else await consent.disableAndDelete();
      setMessage('Cloud neural pronunciation is off and its saved private audio was deleted.');
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : 'Cloud pronunciation is off, but deletion could not be completed.');
    } finally {
      setWorking(false);
    }
  };

  const confirmDisable = () => {
    Alert.alert(
      'Turn off cloud pronunciation?',
      'Wordfold will stop sending pronunciation requests, clear this account’s private audio '
        + 'from this device, and ask the server to delete its saved private audio.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off and delete',
          style: 'destructive',
          onPress: () => void deleteData(),
        },
      ],
    );
  };

  return <Screen scroll>
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close private pronunciation"
        onPress={() => router.back()}
        style={[styles.close, { backgroundColor: theme.surface }]}
      >
        <Ionicons name="close" color={theme.text} size={22}/>
      </Pressable>
      <AppText variant="title">Private pronunciation</AppText>
      <View style={styles.close}/>
    </View>

    <View style={[styles.hero, { backgroundColor: theme.primarySoft }]}>
      <View style={[styles.heroIcon, { backgroundColor: theme.surface }]}>
        <Ionicons name="shield-checkmark-outline" color={theme.primary} size={28}/>
      </View>
      <View style={styles.flex}>
        <AppText variant="heading">Optional cloud neural voice</AppText>
        <AppText style={{ color: theme.muted }}>
          Device pronunciation always remains available. Cloud pronunciation is off until you
          explicitly enable it.
        </AppText>
      </View>
    </View>

    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <DisclosureRow
        icon="cloud-upload-outline"
        title="What leaves this device"
        body="Only when you tap the private neural voice, the exact displayed word or phrase and its selected locale are sent through Wordfold to Microsoft Azure."
      />
      <DisclosureRow
        icon="lock-closed-outline"
        title="What Wordfold stores"
        body="Private audio is stored in an account-only Supabase area and cached for this account on this device. Pronunciation metadata and audit rows do not store the raw word or phrase."
      />
      <DisclosureRow
        icon="language-outline"
        title="Current coverage"
        body="The private neural preview currently supports US English, UK English, and Slovak. Its voices are synthetic learning references, not human recordings."
      />
      <DisclosureRow
        icon="trash-outline"
        title="Your control"
        body="You can turn the feature off and request deletion below. Automatic expiry cleanup is not active in this development build."
      />
    </View>

    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Read Microsoft Azure speech data privacy information"
      onPress={() => void Linking.openURL(AZURE_PRIVACY_URL)}
      style={({ pressed }) => [styles.link, {
        borderColor: theme.border,
        backgroundColor: theme.surface,
        opacity: pressed ? 0.75 : 1,
      }]}
    >
      <Ionicons name="open-outline" color={theme.primary} size={20}/>
      <AppText variant="label" style={[styles.flex, { color: theme.primary }]}>
        Azure Speech data privacy
      </AppText>
    </Pressable>

    {consent.status === 'loading' ? (
      <View style={[styles.status, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ActivityIndicator color={theme.primary}/>
        <AppText style={{ color: theme.muted }}>Checking this account’s choice…</AppText>
      </View>
    ) : consent.status === 'enabled' ? (
      <PrimaryButton
        label="Turn off and delete private audio"
        variant="danger"
        loading={working}
        onPress={confirmDisable}
      />
    ) : consent.status === 'deletion_pending' ? (
      <PrimaryButton
        label="Retry private audio deletion"
        variant="danger"
        loading={working}
        onPress={() => void deleteData(true)}
      />
    ) : (
      <PrimaryButton
        label="Enable private neural pronunciation"
        loading={working}
        onPress={() => void enable()}
      />
    )}

    {message ? (
      <View style={[styles.status, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
        <Ionicons
          name={consent.status === 'deletion_pending' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
          color={consent.status === 'deletion_pending' ? theme.danger : theme.success}
          size={20}
        />
        <AppText style={styles.flex}>{message}</AppText>
      </View>
    ) : null}
  </Screen>;
}

function DisclosureRow({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  const theme = useAppTheme();
  return <View style={styles.disclosure}>
    <View style={[styles.disclosureIcon, { backgroundColor: theme.primarySoft }]}>
      <Ionicons name={icon} color={theme.primary} size={21}/>
    </View>
    <View style={styles.flex}>
      <AppText variant="label">{title}</AppText>
      <AppText variant="caption" style={{ color: theme.muted }}>{body}</AppText>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  close: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  hero: {
    borderRadius: radii.card, padding: spacing.lg, flexDirection: 'row',
    alignItems: 'center', gap: spacing.md,
  },
  heroIcon: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
  },
  panel: {
    borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.lg,
  },
  disclosure: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  disclosureIcon: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
  },
  link: {
    minHeight: 52, borderWidth: 1, borderRadius: radii.control, paddingHorizontal: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  status: {
    minHeight: 52, borderWidth: 1, borderRadius: radii.control, padding: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  flex: { flex: 1 },
});
