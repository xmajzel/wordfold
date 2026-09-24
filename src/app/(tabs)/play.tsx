import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAppData } from '@/providers/app-data-provider';
import WordPlayScreen from '@/features/word-play/screen';

export default function PlayTab() {
  const { activeCourseId, dismissWordPlayIntroduction, wordPlayIntroductions } = useAppData();
  const introduced = wordPlayIntroductions.includes(activeCourseId);
  useFocusEffect(useCallback(() => {
    if (!introduced) {
      void dismissWordPlayIntroduction(activeCourseId).catch(() => {
        // Retrying on the next visit preserves the banner if storage is unavailable.
      });
    }
  }, [activeCourseId, dismissWordPlayIntroduction, introduced]));
  return <WordPlayScreen inTab/>;
}
