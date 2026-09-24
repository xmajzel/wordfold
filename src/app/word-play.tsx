import { isLearningFilter } from '@/data/cefr-levels';
import { useLocalSearchParams } from 'expo-router';
import WordPlayScreen from '@/features/word-play/screen';

export default function WordPlaySessionScreen() {
  const { haptics, filter } = useLocalSearchParams<{ haptics?: string; filter?: string }>();
  return <WordPlayScreen autoStart initialFilter={isLearningFilter(filter) ? filter : 'all'} initialHaptics={haptics === '1'}/>;
}
