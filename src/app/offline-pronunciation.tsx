import { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { Screen } from '@/components/screen';
import { cefrLevels } from '@/data/cefr-levels';
import type { CefrLevel } from '@/domain/types';
import type { NeuralPronunciationLocale } from '@/features/pronunciation/cloud';
import {
  OFFLINE_PRONUNCIATION_LOCALES,
  offlinePackKey,
  useOfflinePronunciationDownloads,
} from '@/features/pronunciation/offline-downloads-provider';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';

const localeDetails: Record<NeuralPronunciationLocale, { title: string; voice: string }> = {
  'en-US': { title: 'English · United States', voice: 'Ava neural voice' },
  'en-GB': { title: 'English · United Kingdom', voice: 'Ryan neural voice' },
};

function formatBytes(bytes: number | null) {
  if (bytes === null) return 'Size unavailable';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function actionError(error: unknown) {
  const message = error instanceof Error && error.message
    ? error.message
    : 'Please try again when the device is online.';
  Alert.alert('Offline pronunciation unavailable', message);
}

export default function OfflinePronunciationScreen() {
  const theme = useAppTheme();
  const downloads = useOfflinePronunciationDownloads();
  const prepareManifests = downloads.prepareManifests;

  useEffect(() => {
    if (Platform.OS !== 'web') void prepareManifests().catch(() => undefined);
  }, [prepareManifests]);

  const run = (operation: () => Promise<void>) => {
    void operation().catch(actionError);
  };

  const confirmDownload = (
    locale: NeuralPronunciationLocale,
    level: CefrLevel | null,
    bytes: number,
    wordCount: number,
  ) => {
    const label = level ? `${locale} ${level}` : `${locale} all levels`;
    Alert.alert(
      `Download ${label}?`,
      `${wordCount.toLocaleString()} pronunciations will use up to ${formatBytes(bytes)}. `
      + 'Keep Wordfold open while the download runs; verified progress can be resumed later.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => run(() => level
            ? downloads.downloadLevel(locale, level)
            : downloads.downloadLocale(locale)),
        },
      ],
    );
  };

  const confirmRemove = (locale: NeuralPronunciationLocale, level: CefrLevel | null) => {
    const label = level ? `${locale} ${level}` : `${locale} all levels`;
    Alert.alert(
      `Remove ${label}?`,
      'Downloaded pronunciation audio will be removed from this device. You can download it again later.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => run(() => level
            ? downloads.removeLevel(locale, level)
            : downloads.removeLocale(locale)),
        },
      ],
    );
  };

  return <Screen scroll>
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close offline pronunciation"
        onPress={() => router.back()}
        style={[styles.close, { backgroundColor: theme.surface }]}
      >
        <Ionicons name="close" color={theme.text} size={22}/>
      </Pressable>
      <AppText variant="title">Offline pronunciation</AppText>
      <View style={styles.close}/>
    </View>

    {Platform.OS === 'web' ? <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}>
      <Ionicons name="phone-portrait-outline" color={theme.primary} size={22}/>
      <AppText style={styles.flex}>Pronunciation downloads are available in the Android and iOS apps.</AppText>
    </View> : <>
      <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}>
        <Ionicons name="cloud-download-outline" color={theme.primary} size={22}/>
        <View style={styles.flex}>
          <AppText>Choose only the voice and CEFR levels you need. Downloads stay on this device and work without an account.</AppText>
          {downloads.availableDiskBytes != null ? <AppText variant="caption" style={{ color: theme.muted }}>
            {formatBytes(downloads.availableDiskBytes)} available on this device
          </AppText> : null}
        </View>
      </View>

      {downloads.job ? <DownloadProgressCard onCancel={downloads.cancelDownload}/> : null}

      {downloads.preparationError && !downloads.preparing ? <View style={styles.errorRow}>
        <AppText style={[styles.flex, { color: theme.danger }]}>Pack details could not be refreshed.</AppText>
        <SmallAction
          label="Retry"
          disabled={false}
          onPress={() => run(downloads.prepareManifests)}
        />
      </View> : null}

      {OFFLINE_PRONUNCIATION_LOCALES.map((locale) => <LocaleSection
        key={locale}
        locale={locale}
        busy={downloads.job !== null}
        preparing={downloads.preparing}
        onDownload={confirmDownload}
        onRemove={confirmRemove}
      />)}
    </>}
  </Screen>;
}

function DownloadProgressCard({ onCancel }: { onCancel(): void }) {
  const theme = useAppTheme();
  const { job } = useOfflinePronunciationDownloads();
  if (!job) return null;
  const ratio = job.totalBytes > 0 ? Math.min(1, job.completedBytes / job.totalBytes) : 0;
  const percent = Math.round(ratio * 100);
  const allLevels = job.levels.length > 1;
  return <View style={[styles.progressCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={styles.row}>
      <View style={styles.flex}>
        <AppText variant="heading">
          {job.stage === 'cancelling' ? 'Stopping download…' : `Downloading ${job.locale}${allLevels ? '' : ` ${job.currentLevel}`}`}
        </AppText>
        <AppText variant="caption" style={{ color: theme.muted }}>
          {job.stage === 'preparing' ? 'Preparing verified pack…'
            : `${job.completedCount.toLocaleString()} of ${job.assetCount.toLocaleString()} · ${percent}%`}
        </AppText>
      </View>
      <ActivityIndicator color={theme.primary}/>
    </View>
    <View style={[styles.progressTrack, { backgroundColor: theme.primarySoft }]}>
      <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${percent}%` }]}/>
    </View>
    <SmallAction
      label={job.stage === 'cancelling' ? 'Stopping…' : 'Cancel download'}
      disabled={job.stage === 'cancelling'}
      onPress={onCancel}
    />
  </View>;
}

function LocaleSection({
  locale,
  busy,
  preparing,
  onDownload,
  onRemove,
}: {
  locale: NeuralPronunciationLocale;
  busy: boolean;
  preparing: boolean;
  onDownload(locale: NeuralPronunciationLocale, level: CefrLevel | null, bytes: number, count: number): void;
  onRemove(locale: NeuralPronunciationLocale, level: CefrLevel | null): void;
}) {
  const theme = useAppTheme();
  const { packs } = useOfflinePronunciationDownloads();
  const states = cefrLevels.map((level) => packs[offlinePackKey(locale, level)]);
  const allSizesKnown = states.every((state) => state?.totalAudioBytes !== null);
  const totalBytes = allSizesKnown
    ? states.reduce((total, state) => total + (state?.totalAudioBytes ?? 0), 0)
    : null;
  const totalCount = states.reduce((total, state) => total + (state?.assetCount ?? 0), 0);
  const downloadedCount = states.reduce((total, state) => total + (state?.downloadedCount ?? 0), 0);
  const fullyDownloaded = states.every((state) => state?.state === 'downloaded');
  const hasAny = downloadedCount > 0;

  return <View style={styles.localeSection}>
    <View style={styles.localeHeader}>
      <View style={[styles.localeIcon, { backgroundColor: theme.primarySoft }]}>
        <Ionicons name="volume-high-outline" color={theme.primary} size={24}/>
      </View>
      <View style={styles.flex}>
        <AppText variant="heading">{localeDetails[locale].title}</AppText>
        <AppText variant="caption" style={{ color: theme.muted }}>
          {localeDetails[locale].voice} · {formatBytes(totalBytes)}
        </AppText>
      </View>
    </View>

    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.allRow}>
        <View style={styles.flex}>
          <AppText variant="label">All CEFR levels</AppText>
          <AppText variant="caption" style={{ color: theme.muted }}>
            {downloadedCount.toLocaleString()} of {totalCount.toLocaleString()} downloaded
          </AppText>
        </View>
        <SmallAction
          label={fullyDownloaded ? 'Remove all' : hasAny ? 'Resume all' : 'Download all'}
          destructive={fullyDownloaded}
          disabled={busy || preparing || totalBytes === null}
          onPress={() => fullyDownloaded
            ? onRemove(locale, null)
            : onDownload(locale, null, totalBytes ?? 0, totalCount)}
        />
      </View>
      <View style={[styles.divider, { backgroundColor: theme.border }]}/>
      {cefrLevels.map((level) => {
        const state = packs[offlinePackKey(locale, level)];
        if (!state) return null;
        const downloaded = state.state === 'downloaded';
        const partial = state.state === 'partial';
        return <View key={level} style={styles.packRow}>
          <View style={[styles.levelBadge, { backgroundColor: downloaded ? `${theme.success}18` : theme.raised }]}>
            <AppText variant="label" style={{ color: downloaded ? theme.success : theme.text }}>{level}</AppText>
          </View>
          <View style={styles.flex}>
            <AppText variant="label">{state.assetCount.toLocaleString()} words · {formatBytes(state.totalAudioBytes)}</AppText>
            <AppText variant="caption" style={{ color: downloaded ? theme.success : theme.muted }}>
              {downloaded ? 'Available offline'
                : partial ? `${state.downloadedCount.toLocaleString()} verified · ready to resume`
                  : 'Not downloaded'}
            </AppText>
          </View>
          <SmallAction
            label={downloaded ? 'Remove' : partial ? 'Resume' : 'Download'}
            destructive={downloaded}
            disabled={busy || preparing || state.totalAudioBytes === null}
            onPress={() => downloaded
              ? onRemove(locale, level)
              : onDownload(locale, level, state.totalAudioBytes ?? 0, state.assetCount)}
          />
        </View>;
      })}
    </View>
  </View>;
}

function SmallAction({
  label,
  disabled,
  destructive = false,
  onPress,
}: {
  label: string;
  disabled: boolean;
  destructive?: boolean;
  onPress(): void;
}) {
  const theme = useAppTheme();
  const color = destructive ? theme.danger : theme.primary;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.action, {
      backgroundColor: destructive ? `${theme.danger}18` : theme.primarySoft,
      borderColor: color,
      opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
    }]}
  >
    <AppText variant="label" style={{ color }}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  notice: { borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', gap: spacing.sm },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  localeSection: { gap: spacing.md },
  localeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  localeIcon: { width: 48, height: 48, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  allRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  packRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  levelBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  action: { minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1 },
  progressCard: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
});
