import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';

import { AppDataProvider } from './app-data-provider';

const mockSQLiteProvider = jest.fn(({ children }: { children: ReactNode }) => children);

jest.mock('../../assets/catalog/wordnet.sqlite', () => 1);

jest.mock('expo-sqlite', () => ({
  SQLiteProvider: (props: { children: ReactNode }) => mockSQLiteProvider(props),
  useSQLiteContext: jest.fn(() => ({})),
}));

jest.mock('@/data/repository', () => ({
  listWords: jest.fn(async () => []),
  listCollections: jest.fn(async () => []),
  getStats: jest.fn(async () => ({
    totalWords: 0,
    newWords: 0,
    difficultWords: 0,
    understoodWords: 0,
    learnedWords: 0,
    viewedToday: 0,
    viewedLifetime: 0,
    notificationOpens: 0,
    recentActivity: [],
  })),
  getReminderSettings: jest.fn(async () => ({
    enabled: false,
    countPerDay: 1,
    windowStartMinutes: 600,
    windowEndMinutes: 1200,
    timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
  })),
  getContentPacks: jest.fn(async () => []),
  isOnboardingComplete: jest.fn(async () => false),
  getLearningFilter: jest.fn(async () => 'all'),
}));

jest.mock('@/features/reminders/scheduler', () => ({
  rebuildReminderSchedule: jest.fn(async () => 0),
}));

describe('AppDataProvider', () => {
  it('uses Suspense for only one SQLite provider', async () => {
    const providerTree = AppDataProvider({ children: <Text>Ready</Text> }) as ReactElement<{
      children: ReactElement<{ databaseName: string; useSuspense?: boolean }>;
    }>;
    expect(providerTree.props.children.props.useSuspense).toBe(true);

    const view = await render(<AppDataProvider><Text>Ready</Text></AppDataProvider>);
    view.getByText('Ready');

    const providerCalls = mockSQLiteProvider.mock.calls
      .map(([props]) => props as unknown as { databaseName: string; useSuspense?: boolean });
    const catalogProvider = providerCalls.find(({ databaseName }) => databaseName === 'wordnet.sqlite');

    expect(catalogProvider?.useSuspense).not.toBe(true);
  });
});
