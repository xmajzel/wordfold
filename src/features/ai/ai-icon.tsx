import { Image } from 'expo-image';
import { useColorScheme } from 'react-native';

// These local SVGs use the same light/dark stops as theme.aiGradient.
const icons = {
  light: { sparkles: require('../../../assets/images/ai/sparkles-light.svg'), accept: require('../../../assets/images/ai/accept-light.svg') },
  dark: { sparkles: require('../../../assets/images/ai/sparkles-dark.svg'), accept: require('../../../assets/images/ai/accept-dark.svg') },
};
export function AiIcon({ name = 'sparkles', size = 22 }: { name?: 'sparkles' | 'accept'; size?: number }) {
  const theme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return <Image source={icons[theme][name]} style={{ width: size, height: size }} contentFit="contain" accessible={false} alt="" transition={0}/>;
}
