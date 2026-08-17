import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import type { GuestImportConflictResolution } from '@/data/sync/guest-import-types';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';
import { useSync } from '@/providers/sync-provider';
import { radii, spacing } from '@/theme/tokens';

export default function AccountImportScreen() {
  const theme = useAppTheme();
  const sync = useSync();
  const {
    guestImport, prepareGuestImport, resolveGuestImportConflict,
    runGuestImport, refreshGuestImport, cutover, dataSource, runSyncCutover,
    resolveSyncCutoverConflict, keepAccountRename,
  } = useAppData();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const totalItems = guestImport.totals.collections + guestImport.totals.words + guestImport.totals.events;

  const perform = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await operation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The import action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const choose = (localWordId: string, resolution: GuestImportConflictResolution) => (
    perform(() => resolveGuestImportConflict(localWordId, resolution))
  );

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={[styles.close, { backgroundColor: theme.surface }]}>
          <Ionicons name="close" color={theme.text} size={22}/>
        </Pressable>
        <AppText variant="title">Import device data</AppText>
        <View style={styles.close}/>
      </View>

      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="cloud-upload-outline" color={theme.primary} size={28}/>
        </View>
        <AppText variant="heading">Move this device vocabulary to your account</AppText>
        <AppText style={{ color: theme.muted }}>Your original on-device database stays available. After reconciliation, account vocabulary works offline and synchronizes whenever you reconnect.</AppText>
        <View style={styles.counts}>
          <Count label="Collections" value={guestImport.totals.collections}/>
          <Count label="Words" value={guestImport.totals.words}/>
          <Count label="History" value={guestImport.totals.events}/>
        </View>
      </View>

      {guestImport.phase === 'loading' ? <StatusPanel icon="hourglass-outline" text="Checking device import status…" loading/> : null}

      {guestImport.phase === 'unavailable' ? (
        <StatusPanel icon="cloud-offline-outline" text={guestImport.message ?? 'Device import is unavailable in this build.'}/>
      ) : null}

      {guestImport.phase === 'ready' && dataSource !== 'synced' ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <AppText variant="heading">Confirm this snapshot</AppText>
          <AppText style={{ color: theme.muted }}>{totalItems === 0
            ? 'There is no device vocabulary to import.'
            : 'Wordfold will check the account for duplicate words before uploading anything.'}</AppText>
          <PrimaryButton
            label="Check account and prepare import"
            loading={busy}
            disabled={busy || totalItems === 0 || sync.phase !== 'connected'}
            onPress={() => void perform(prepareGuestImport)}
          />
          {sync.phase !== 'connected' && totalItems > 0 ? <AppText variant="caption" style={{ color: theme.muted }}>PowerSync must finish connecting first.</AppText> : null}
        </View>
      ) : null}

      {guestImport.phase === 'needs_conflicts' ? (
        <View style={styles.group}>
          <View>
            <AppText variant="heading">Choose which copy to keep</AppText>
            <AppText style={{ color: theme.muted }}>Every duplicate needs a choice before import can continue.</AppText>
          </View>
          {guestImport.conflicts.map((conflict) => (
            <View key={conflict.localId} style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <AppText variant="heading">{conflict.term}</AppText>
              <Choice
                label="Keep account version"
                detail={conflict.accountDefinition}
                selected={conflict.resolution === 'keep_account'}
                disabled={busy}
                onPress={() => void choose(conflict.localId, 'keep_account')}
              />
              <Choice
                label="Use this device version"
                detail={conflict.localDefinition}
                selected={conflict.resolution === 'use_device'}
                disabled={busy}
                onPress={() => void choose(conflict.localId, 'use_device')}
              />
            </View>
          ))}
        </View>
      ) : null}

      {guestImport.phase === 'prepared' ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <AppText variant="heading">Ready to import</AppText>
          <AppText style={{ color: theme.muted }}>Collections upload first, followed by words and learning history. Closing this screen will not undo accepted batches.</AppText>
          <PrimaryButton label="Import device vocabulary" loading={busy} disabled={busy || sync.phase !== 'connected'} onPress={() => void perform(runGuestImport)}/>
        </View>
      ) : null}

      {guestImport.phase === 'uploading' ? (
        <StatusPanel
          icon="cloud-upload-outline"
          loading
          text={`Uploading ${guestImport.uploaded.collections}/${guestImport.totals.collections} collections, ${guestImport.uploaded.words}/${guestImport.totals.words} words, and ${guestImport.uploaded.events}/${guestImport.totals.events} history events…`}
        />
      ) : null}

      {guestImport.phase === 'verifying' ? guestImport.message ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="time-outline" color={theme.primary} size={30}/>
          <AppText variant="heading">Verification paused</AppText>
          <AppText style={{ color: theme.muted }}>{guestImport.message}</AppText>
          <PrimaryButton label="Retry verification" loading={busy} disabled={busy || sync.phase !== 'connected'} onPress={() => void perform(runGuestImport)}/>
          <PrimaryButton label="Refresh status" variant="secondary" disabled={busy} onPress={() => void perform(refreshGuestImport)}/>
        </View>
      ) : <StatusPanel icon="sync-outline" loading text="Waiting for PowerSync to download and verify the imported records…"/> : null}

      {guestImport.phase === 'completed' && cutover.phase === 'needs_conflicts' ? (
        <View style={styles.group}>
          <View>
            <AppText variant="heading">Resolve newer device changes</AppText>
            <AppText style={{ color: theme.muted }}>These changes happened after the confirmed snapshot.</AppText>
          </View>
          {cutover.conflicts.map((conflict) => (
            <View key={conflict.localId} style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <AppText variant="heading">{conflict.term}</AppText>
              {conflict.kind === 'new_word' ? <>
                <Choice label="Keep account version" detail={conflict.accountDefinition}
                  selected={conflict.resolution === 'keep_account'} disabled={busy}
                  onPress={() => void perform(() => resolveSyncCutoverConflict(conflict.localId, 'keep_account'))}/>
                <Choice label="Use this device version" detail={conflict.localDefinition}
                  selected={conflict.resolution === 'use_device'} disabled={busy}
                  onPress={() => void perform(() => resolveSyncCutoverConflict(conflict.localId, 'use_device'))}/>
              </> : <>
                <AppText variant="caption" style={{ color: theme.muted }}>This renamed device word now conflicts with another account word.</AppText>
                <PrimaryButton label="Keep account versions" variant="secondary" disabled={busy}
                  onPress={() => void perform(() => keepAccountRename(conflict.localId))}/>
                <PrimaryButton label="Return and rename device word" variant="secondary" disabled={busy} onPress={() => router.back()}/>
              </>}
            </View>
          ))}
        </View>
      ) : null}

      {guestImport.phase === 'completed' && ['checking', 'uploading', 'verifying'].includes(cutover.phase) ? (
        <StatusPanel icon="sync-outline" loading text={`Preparing continuous synchronization: ${cutover.uploaded.words}/${cutover.totals.words} changed words processed…`}/>
      ) : null}

      {guestImport.phase === 'completed' && cutover.phase === 'error' ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="alert-circle-outline" color={theme.danger} size={30}/>
          <AppText variant="heading">Synchronization setup paused</AppText>
          <AppText style={{ color: theme.muted }}>{cutover.message ?? 'Connect and retry. Accepted changes will not be duplicated.'}</AppText>
          <PrimaryButton label="Retry synchronization setup" loading={busy} disabled={busy || sync.phase !== 'connected'} onPress={() => void perform(runSyncCutover)}/>
        </View>
      ) : null}

      {dataSource === 'synced' ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="checkmark-circle" color={theme.success} size={34}/>
          <AppText variant="heading">Vocabulary synchronized</AppText>
          <AppText style={{ color: theme.muted }}>This account vocabulary is now stored locally for offline use. Changes synchronize automatically when a connection is available.</AppText>
          <PrimaryButton label="Done" onPress={() => router.back()}/>
        </View>
      ) : null}

      {guestImport.phase === 'error' ? (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="alert-circle-outline" color={theme.danger} size={30}/>
          <AppText variant="heading">Import paused</AppText>
          <AppText style={{ color: theme.muted }}>{guestImport.message ?? 'The import can be retried without creating duplicate records.'}</AppText>
          <PrimaryButton label="Retry import" loading={busy} disabled={busy || sync.phase !== 'connected'} onPress={() => void perform(runGuestImport)}/>
          <PrimaryButton label="Refresh status" variant="secondary" disabled={busy} onPress={() => void perform(refreshGuestImport)}/>
        </View>
      ) : null}

      {message ? <AppText accessibilityLiveRegion="polite" style={{ color: theme.danger }}>{message}</AppText> : null}
    </Screen>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  const theme = useAppTheme();
  return <View style={[styles.count, { backgroundColor: theme.primarySoft }]}><AppText variant="heading" style={{ color: theme.primary }}>{value}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{label}</AppText></View>;
}

function StatusPanel({ icon, text, loading = false }: { icon: keyof typeof Ionicons.glyphMap; text: string; loading?: boolean }) {
  const theme = useAppTheme();
  return <View style={[styles.panel, styles.status, { backgroundColor: theme.surface, borderColor: theme.border }]}>{loading ? <ActivityIndicator color={theme.primary}/> : <Ionicons name={icon} color={theme.primary} size={26}/>}<AppText style={[styles.flex, { color: theme.muted }]}>{text}</AppText></View>;
}

function Choice({ label, detail, selected, disabled, onPress }: {
  label: string; detail: string; selected: boolean; disabled: boolean; onPress(): void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.canvas }]}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} color={selected ? theme.primary : theme.muted} size={22}/>
      <View style={styles.flex}><AppText variant="label">{label}</AppText><AppText variant="caption" style={{ color: theme.muted }}>{detail}</AppText></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  panel: { borderWidth: 1, borderRadius: radii.card, padding: spacing.lg, gap: spacing.md },
  icon: { width: 52, height: 52, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  counts: { flexDirection: 'row', gap: spacing.sm },
  count: { flex: 1, minHeight: 72, borderRadius: radii.control, padding: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  group: { gap: spacing.md },
  choice: { borderWidth: 1, borderRadius: radii.control, padding: spacing.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  status: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
