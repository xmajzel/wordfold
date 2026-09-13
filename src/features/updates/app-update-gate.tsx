import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import * as Application from 'expo-application';

import { AppText } from '@/components/app-text';
import { PrimaryButton } from '@/components/primary-button';
import { useAppTheme } from '@/hooks/use-app-theme';
import { radii, spacing } from '@/theme/tokens';
import { isSnoozed, parseBuild, parsePolicy, type ReleasePolicy, type ReleaseTarget, updateRequirement } from './release-policy';
import { fetchReleasePolicy, readStoredValue, releaseCacheKey, writeStoredValue } from './release-policy-client';

function getTarget(): ReleaseTarget | null {
  const build = parseBuild(Application.nativeBuildVersion);
  if (__DEV__ || (Platform.OS !== 'android' && Platform.OS !== 'ios')
    || !build || !Application.applicationId) return null;
  // Development clients may not include ExpoUpdates; only releases need the channel.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Updates: typeof import('expo-updates') = require('expo-updates');
  return {
    platform: Platform.OS, build, applicationId: Application.applicationId,
    channel: Updates.channel || 'preview',
  };
}

export function AppUpdateGate({ children }: PropsWithChildren) {
  const [target] = useState(getTarget);
  return target ? <ReleaseGate target={target}>{children}</ReleaseGate> : <>{children}</>;
}

export function ReleaseGate({ children, target }: PropsWithChildren<{ target: ReleaseTarget }>) {
  const theme = useAppTheme();
  const [policy, setPolicy] = useState<ReleasePolicy | null>(null);
  const [snooze, setSnooze] = useState<unknown>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const alive = useRef(false);
  const pending = useRef(false);
  const lastCheck = useRef(0);
  const cacheKey = releaseCacheKey(target);

  const check = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    lastCheck.current = Date.now();
    setChecking(true);
    setError(null);
    setNow(Date.now());
    try {
      const next = await fetchReleasePolicy(target);
      if (!alive.current) return;
      setPolicy(next);
      await writeStoredValue(cacheKey, next);
    } catch {
      if (alive.current) setError('Could not check for updates. Please try again when you are online.');
    } finally {
      pending.current = false;
      if (alive.current) setChecking(false);
    }
  }, [cacheKey, target]);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    let hydrated = false;
    void (async () => {
      const [cached, storedSnooze] = await Promise.all([
        readStoredValue(cacheKey), readStoredValue(`${cacheKey}:snooze`),
      ]);
      if (cancelled) return;
      setPolicy(parsePolicy(cached, target));
      setSnooze(storedSnooze);
      hydrated = true;
      await check();
    })();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !hydrated) return;
      setNow(Date.now());
      if (Date.now() - lastCheck.current >= 60_000) void check();
    });
    return () => { cancelled = true; alive.current = false; subscription.remove(); };
  }, [cacheKey, check, target]);

  const requirement = updateRequirement(policy, target.build);
  const required = requirement === 'required';
  const visible = required || (requirement === 'optional' && !!policy && !isSnoozed(snooze, policy.latest_build, now));
  const dismiss = () => {
    if (required || !policy) return;
    const value = { build: policy.latest_build, at: Date.now() };
    setNow(value.at);
    setSnooze(value);
    void writeStoredValue(`${cacheKey}:snooze`, value);
  };
  const openStore = async () => {
    if (!policy) return;
    setError(null);
    try { await Linking.openURL(policy.store_url); }
    catch { setError('Could not open the store. Please try again.'); }
  };

  return <>
    {children}
    <Modal testID="app-update-dialog" visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop} accessibilityViewIsModal>
        <ScrollView style={[styles.card, { backgroundColor: theme.canvas }]} contentContainerStyle={styles.content}>
          <AppText variant="title">{required ? 'Update Wordfold to continue' : 'A new Wordfold is available'}</AppText>
          <AppText>{policy?.message || 'Get the latest improvements by updating Wordfold.'}</AppText>
          {required ? <AppText>This version is no longer supported. Your saved words will stay on this device.</AppText> : null}
          {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
          <PrimaryButton label="Update Wordfold" onPress={() => { void openStore(); }} />
          {required
            ? <PrimaryButton label="Try again" variant="secondary" loading={checking} onPress={() => { void check(); }} />
            : <PrimaryButton label="Remind me later" variant="secondary" onPress={dismiss} />}
        </ScrollView>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000099', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  card: { width: '100%', maxWidth: 480, maxHeight: '85%', flexGrow: 0, borderRadius: radii.sheet },
  content: { padding: spacing.xl, gap: spacing.lg },
});
