import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Redirect } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { getNotificationWordTarget } from '@/features/reminders/notification-navigation';
import { useAppData } from '@/providers/app-data-provider';

export default function Index() {
  const { noteNotificationOpen } = useAppData();
  const handledNotificationId = useRef<string | null>(null);
  const [initialNotification] = useState(() => Platform.OS === 'web'
    ? null
    : Notifications.getLastNotificationResponse()?.notification ?? null);
  const target = initialNotification ? getNotificationWordTarget(initialNotification) : null;

  useEffect(() => {
    if (!initialNotification) return;
    const notificationId = initialNotification.request.identifier;
    if (handledNotificationId.current === notificationId) return;
    handledNotificationId.current = notificationId;
    Notifications.clearLastNotificationResponse();
    void noteNotificationOpen(target?.wordId ?? null);
  }, [initialNotification, noteNotificationOpen, target?.wordId]);

  return <Redirect href={target?.href ?? '/(tabs)'} />;
}
