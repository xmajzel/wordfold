import AsyncStorage from '@react-native-async-storage/async-storage';
export async function clearAiAccountData(userId: string) {
  const keys = await AsyncStorage.getAllKeys();
  const owned = keys.filter((key) => key.startsWith(`ai-suggestion-v1:["${userId}",`)
    || key.startsWith(`word-review-v1:${userId}:`) || key === `revenuecat-account-v1:${userId}`);
  if (owned.length) await AsyncStorage.multiRemove(owned);
}
