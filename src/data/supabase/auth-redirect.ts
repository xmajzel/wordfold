import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export function authRedirectUrl() {
  // Installed dev builds can have a Metro hostUri in createURL(). Email links
  // must use the same registered callback as production, without that host.
  return Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? Linking.createURL('account')
    : 'wordfold://account';
}
