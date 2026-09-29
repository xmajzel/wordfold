import { Redirect, useLocalSearchParams } from 'expo-router';

// Preserve existing collection links while keeping practice in Play.
export default function CollectionCardsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/(tabs)/play', params: { filter: `collection:${id}`, activity: 'cards', status: 'all', length: 'all' } } as never}/>;
}
