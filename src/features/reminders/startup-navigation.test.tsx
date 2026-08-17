import { render, waitFor } from '@testing-library/react-native';

import Index from '@/app/index';

const mockClearLastNotificationResponse = jest.fn();
const mockGetLastNotificationResponse = jest.fn();
const mockNoteNotificationOpen = jest.fn(async () => undefined);

jest.mock('expo-notifications', () => ({
  clearLastNotificationResponse: () => mockClearLastNotificationResponse(),
  getLastNotificationResponse: () => mockGetLastNotificationResponse(),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: unknown }) => React.createElement(
      Text,
      { testID: 'redirect-target' },
      JSON.stringify(href),
    ),
  };
});

jest.mock('@/providers/app-data-provider', () => ({
  useAppData: () => ({ noteNotificationOpen: mockNoteNotificationOpen }),
}));

describe('startup navigation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the exact word from the notification on a cold start', async () => {
    mockGetLastNotificationResponse.mockReturnValue({
      notification: {
        request: {
          identifier: 'wordfold-abysmal',
          content: {
            data: {
              wordId: 'seed-headway-upper-intermediate-se3qku',
              url: '/word/a-different-word',
            },
          },
        },
      },
    });

    const view = await render(<Index />);

    expect(view.getByTestId('redirect-target').props.children).toBe(JSON.stringify({
      pathname: '/word/[id]',
      params: { id: 'seed-headway-upper-intermediate-se3qku' },
    }));
    await waitFor(() => {
      expect(mockNoteNotificationOpen).toHaveBeenCalledWith('seed-headway-upper-intermediate-se3qku');
      expect(mockClearLastNotificationResponse).toHaveBeenCalledTimes(1);
    });
  });

  it('opens the regular feed without a notification response', async () => {
    mockGetLastNotificationResponse.mockReturnValue(null);

    const view = await render(<Index />);

    expect(view.getByTestId('redirect-target').props.children).toBe(JSON.stringify('/(tabs)'));
    expect(mockNoteNotificationOpen).not.toHaveBeenCalled();
  });
});
