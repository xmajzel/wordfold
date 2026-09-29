import { useLocalSearchParams } from 'expo-router';
import WordPlayScreen from '@/features/word-play/screen';
import { parsePlayConfig } from '@/features/word-play/model';

export default function WordPlaySessionScreen() {
  const params = useLocalSearchParams();
  return <WordPlayScreen autoStart initialConfig={parsePlayConfig(params)} initialHaptics={params.haptics === '1'}/>;
}
