export interface NotificationDataCarrier {
  request: {
    content: {
      data?: Record<string, unknown>;
    };
  };
}

export function getNotificationWordTarget(notification: NotificationDataCarrier) {
  const wordId = notification.request.content.data?.wordId;
  if (typeof wordId !== 'string' || wordId.length === 0) return null;

  return {
    wordId,
    href: {
      pathname: '/word/[id]' as const,
      params: { id: wordId },
    },
  };
}
