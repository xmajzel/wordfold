import { getNotificationWordTarget, type NotificationDataCarrier } from './notification-navigation';

function notification(data?: Record<string, unknown>): NotificationDataCarrier {
  return { request: { content: { data } } };
}

describe('notification navigation', () => {
  it('builds the detail route from the notification word id', () => {
    expect(getNotificationWordTarget(notification({
      wordId: 'seed-headway-upper-intermediate-se3qku',
      url: '/word/a-different-word',
    }))).toEqual({
      wordId: 'seed-headway-upper-intermediate-se3qku',
      href: {
        pathname: '/word/[id]',
        params: { id: 'seed-headway-upper-intermediate-se3qku' },
      },
    });
  });

  it.each([undefined, {}, { wordId: null }, { wordId: '' }])(
    'rejects a notification without a usable word id',
    (data) => expect(getNotificationWordTarget(notification(data))).toBeNull(),
  );
});
