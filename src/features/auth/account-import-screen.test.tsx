import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AccountImportScreen from '@/app/account-import';
import type { GuestImportViewModel } from '@/data/sync/guest-import-types';
import type { SyncCutoverViewModel } from '@/data/sync/cutover-types';

const mockPrepare = jest.fn(async () => undefined);
const mockResolve = jest.fn(async () => undefined);
const mockRun = jest.fn(async () => undefined);
const mockRefresh = jest.fn(async () => undefined);
let mockGuestImport: GuestImportViewModel;
let mockCutover: SyncCutoverViewModel;
let mockDataSource: 'guest' | 'reconciling' | 'synced';
const mockRunCutover = jest.fn(async () => undefined);
const mockResolveCutover = jest.fn(async () => undefined);
const mockKeepAccountRename = jest.fn(async () => undefined);

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    guestImport: mockGuestImport,
    prepareGuestImport: mockPrepare,
    resolveGuestImportConflict: mockResolve,
    runGuestImport: mockRun,
    refreshGuestImport: mockRefresh,
    cutover: mockCutover,
    dataSource: mockDataSource,
    runSyncCutover: mockRunCutover,
    resolveSyncCutoverConflict: mockResolveCutover,
    keepAccountRename: mockKeepAccountRename,
  }),
}));
jest.mock('@/providers/sync-provider', () => ({
  useSync: () => ({ phase: 'connected' }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    cancelAnimation: jest.fn(),
    interpolate: jest.fn((_value: number, _input: number[], output: number[]) => output[0]),
    ReduceMotion: { System: 'system' },
    useSharedValue: jest.fn((initialValue: number) => ({ value: initialValue, set(nextValue: number) { this.value = nextValue; } })),
    useAnimatedStyle: jest.fn((factory: () => object) => factory()),
    withRepeat: jest.fn((value: number) => value),
    withSpring: jest.fn((value: number) => value),
    withTiming: jest.fn((value: number) => value),
  };
});

describe('AccountImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGuestImport = {
      phase: 'ready',
      totals: { collections: 1, words: 2, events: 3 },
      uploaded: { collections: 0, words: 0, events: 0 },
      conflicts: [],
      message: null,
    };
    mockCutover = {
      phase: 'checking', totals: { collections: 0, words: 0, events: 0 },
      uploaded: { collections: 0, words: 0, events: 0 }, conflicts: [], message: null,
    };
    mockDataSource = 'guest';
  });

  it('shows counts and requires explicit confirmation before preparation', async () => {
    const view = await render(<AccountImportScreen/>);

    expect(view.getByText('2')).toBeTruthy();
    expect(mockPrepare).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: 'Check account and prepare import' }));
    await waitFor(() => expect(mockPrepare).toHaveBeenCalledTimes(1));
  });

  it('records an explicit per-word conflict choice', async () => {
    mockGuestImport = {
      ...mockGuestImport,
      phase: 'needs_conflicts',
      conflicts: [{
        localId: 'local-word', remoteId: 'remote-word', term: 'Scope',
        localDefinition: 'Device definition', accountDefinition: 'Account definition', resolution: null,
      }],
    };
    const view = await render(<AccountImportScreen/>);

    await fireEvent.press(view.getByRole('radio', { name: /Use this device version/ }));

    await waitFor(() => expect(mockResolve).toHaveBeenCalledWith('local-word', 'use_device'));
  });

  it('reports continuous synchronization only after cutover is ready', async () => {
    mockGuestImport = { ...mockGuestImport, phase: 'completed' };
    mockCutover = { ...mockCutover, phase: 'ready' };
    mockDataSource = 'synced';
    const view = await render(<AccountImportScreen/>);

    expect(view.getByText('Vocabulary synchronized')).toBeTruthy();
    expect(view.getByText(/synchronize automatically when a connection is available/)).toBeTruthy();
  });

  it('requires a choice for a post-import conflicting word', async () => {
    mockGuestImport = { ...mockGuestImport, phase: 'completed' };
    mockCutover = {
      ...mockCutover,
      phase: 'needs_conflicts',
      conflicts: [{
        kind: 'new_word', localId: 'new-local', remoteId: 'account-word', term: 'Scope',
        localDefinition: 'Device definition', accountDefinition: 'Account definition', resolution: null,
      }],
    };
    mockDataSource = 'reconciling';
    const view = await render(<AccountImportScreen/>);

    await fireEvent.press(view.getByRole('radio', { name: /Keep account version/ }));

    await waitFor(() => expect(mockResolveCutover).toHaveBeenCalledWith('new-local', 'keep_account'));
  });

  it('offers a retry when PowerSync verification times out', async () => {
    mockGuestImport = {
      ...mockGuestImport,
      phase: 'verifying',
      message: 'PowerSync verification timed out. Retry when synchronization is connected.',
    };
    const view = await render(<AccountImportScreen/>);

    await fireEvent.press(view.getByRole('button', { name: 'Retry verification' }));

    await waitFor(() => expect(mockRun).toHaveBeenCalledTimes(1));
  });
});
