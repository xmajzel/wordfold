import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppData } from '@/providers/app-data-provider';

export default function TabsLayout() {
  const theme = useAppTheme();
  const { onboardingComplete } = useAppData();
  if (onboardingComplete === null) return <View style={[styles.loading, { backgroundColor: theme.canvas }]}><ActivityIndicator color={theme.primary}/></View>;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.primary, tabBarInactiveTintColor: theme.muted, tabBarLabelStyle: styles.label, tabBarItemStyle: styles.item, tabBarStyle: [styles.tabBar, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }], sceneStyle: { backgroundColor: theme.canvas } }}>
      <Tabs.Screen name="index" options={{ title: 'Learn', tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" color={color} size={size}/> }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: ({ color, size }) => <Ionicons name="layers-outline" color={color} size={size}/> }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" color={color} size={size}/> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, tabBar: { height: 72, marginHorizontal: 12, marginBottom: 8, borderRadius: 24, borderTopWidth: 1, borderWidth: 1, paddingTop: 7, paddingBottom: 8, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 20, elevation: 8 }, item: { borderRadius: 18 }, label: { fontFamily: 'Inter_600SemiBold', fontSize: 11 } });
