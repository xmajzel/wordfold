import { useEffect } from 'react';
import { AppState } from 'react-native';
import { feedbackQueue } from './service';

export function FeedbackCoordinator() {
  useEffect(() => {
    const flush = () => { void feedbackQueue.flush().catch(() => undefined); };
    flush();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') flush(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') flush(); }, 60000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, []);
  return null;
}
