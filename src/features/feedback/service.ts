import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createFeedbackQueue, type DeliveryResult } from './queue';
import type { FeedbackReport } from '../../../supabase/functions/_shared/feedback';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
export const feedbackConfigured = !!url && !!key;
let installation: Promise<string> | undefined;

export function getFeedbackInstallationId() {
  installation ??= (async () => {
    const stored = await AsyncStorage.getItem('wordfold.feedback.installation.v1');
    if (stored) return stored;
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem('wordfold.feedback.installation.v1', id);
    return id;
  })().catch((error) => { installation = undefined; throw error; });
  return installation;
}

export async function deliverFeedback(report: FeedbackReport): Promise<DeliveryResult> {
  if (!url || !key) return { status: 'retry' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${url}/functions/v1/feedback-submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify(report), signal: controller.signal,
    });
    if (response.ok) {
      const body = await response.json();
      return body.accepted === true && body.id === report.id ? { status: 'sent' } : { status: 'retry' };
    }
    if ([400, 409, 413, 422].includes(response.status)) return { status: 'rejected' };
    return { status: 'retry' };
  } finally { clearTimeout(timeout); }
}

export const feedbackQueue = createFeedbackQueue(AsyncStorage, deliverFeedback);
