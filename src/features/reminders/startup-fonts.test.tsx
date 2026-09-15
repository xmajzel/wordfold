import { act, render } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import RootLayout from '@/app/_layout';

const mockLoadFonts = jest.fn<Promise<void>, []>();
jest.mock('expo-font', () => ({
  useFonts: () => {
    const React = jest.requireActual('react');
    const [loaded, setLoaded] = React.useState(false);
    const [error, setError] = React.useState(null);
    React.useEffect(() => { mockLoadFonts().then(() => setLoaded(true), setError); }, []);
    return [loaded, error];
  },
}));
jest.mock('@/providers/app-data-provider', () => {
  const React = jest.requireActual('react');
  return {
    // Match SQLiteProvider's comparator: changes to children are ignored.
    AppDataProvider: React.memo(function FrozenDatabaseProvider({ children }: { children: React.ReactNode }) { return children; }, () => true),
    useAppData: () => ({ onboardingComplete: true, noteNotificationOpen: jest.fn() }),
  };
});
jest.mock('@/providers/auth-provider', () => ({ AuthProvider: ({ children }: React.PropsWithChildren) => children }));
jest.mock('@/providers/purchase-provider', () => ({ PurchaseProvider: ({ children }: React.PropsWithChildren) => children }));
jest.mock('@/providers/sync-provider', () => ({ SyncProvider: ({ children }: React.PropsWithChildren) => children }));
jest.mock('@/features/pronunciation/private-consent-provider', () => ({ PrivatePronunciationConsentProvider: ({ children }: React.PropsWithChildren) => children }));
jest.mock('@/features/pronunciation/offline-downloads-provider', () => ({ OfflinePronunciationDownloadsProvider: ({ children }: React.PropsWithChildren) => children }));
jest.mock('@/features/pronunciation/cache-scope-provider', () => ({ PronunciationCacheScopeProvider: ({ children }: React.PropsWithChildren) => children }));
jest.mock('@/features/pronunciation/library-download-coordinator', () => ({ PronunciationLibraryDownloadCoordinator: () => null }));
jest.mock('@/features/feedback/feedback-coordinator', () => ({ FeedbackCoordinator: () => null }));
jest.mock('@/features/updates/app-update-gate', () => ({ AppUpdateGate: ({ children }: React.PropsWithChildren) => children }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: React.PropsWithChildren) => children }));
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn(), addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }) }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => undefined), setOptions: jest.fn(), hideAsync: jest.fn(async () => undefined) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return { ThemeProvider: ({ children }: React.PropsWithChildren) => children, Stack: Object.assign(() => React.createElement(Text, null, 'App navigation'), { Screen: () => null }) };
});
jest.mock('@/components/launch-screen', () => ({ LaunchScreen: () => null }));

it.each(['success', 'error'])('releases startup after delayed font %s through a memoized database provider', async (outcome) => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  mockLoadFonts.mockImplementation(() => new Promise<void>((res, rej) => { resolve = res; reject = rej; }));
  jest.mocked(SplashScreen.hideAsync).mockClear();
  const view = await render(<RootLayout />);
  expect(view.queryByText('App navigation')).toBeNull();
  await act(async () => { if (outcome === 'success') resolve(); else reject(new Error('Font unavailable')); });
  expect(view.getByText('App navigation')).toBeTruthy();
  expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
});
