import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AccountImportScreen from '@/app/account-import';
import type { GuestImportViewModel } from '@/data/sync/guest-import-types';

const mockPrepare = jest.fn(async () => undefined);
const mockResolve = jest.fn(async () => undefined);
const mockRun = jest.fn(async () => undefined);
const mockRefresh = jest.fn(async () => undefined);
let mockGuestImport: GuestImportViewModel;

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({
    guestImport: mockGuestImport,
    prepareGuestImport: mockPrepare,
    resolveGuestImportConflict: mockResolve,
    runGuestImport: mockRun,
    refreshGuestImport: mockRefresh,
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

  it('does not claim that later device changes are synchronized', async () => {
    mockGuestImport = { ...mockGuestImport, phase: 'completed' };
    const view = await render(<AccountImportScreen/>);

    expect(view.getByText('Device snapshot imported')).toBeTruthy();
    expect(view.getByText(/New device changes remain local until Phase 4C/)).toBeTruthy();
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
