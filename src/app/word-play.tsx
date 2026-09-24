import { useLocalSearchParams } from 'expo-router';
import WordPlayScreen from '@/features/word-play/screen';

export default function WordPlaySessionScreen() {
  const { haptics } = useLocalSearchParams<{ haptics?: string }>();
  return <WordPlayScreen autoStart initialHaptics={haptics === '1'}/>;
}
