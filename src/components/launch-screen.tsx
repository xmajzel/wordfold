import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

interface LaunchScreenProps {
  ready?: boolean;
  onFinish?(): void;
}

export function LaunchScreen({ ready = false, onFinish }: LaunchScreenProps) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => new Animated.Value(0.9));

  useEffect(() => {
    if (!ready) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 420,
        delay: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.06,
          damping: 13,
          stiffness: 120,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.18,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) onFinish?.();
    });
  }, [onFinish, opacity, ready, scale]);

  return (
    <Animated.View accessibilityLabel="Wordfold is loading" style={[styles.screen, { opacity }]}>
      <View style={styles.glow}/>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image source={require('../../assets/images/splash-icon.png')} resizeMode="contain" style={styles.logo}/>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { position: 'absolute', inset: 0, zIndex: 100, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4F4DBB' },
  glow: { position: 'absolute', width: 310, height: 310, borderRadius: 155, backgroundColor: '#8D83F033' },
  logo: { width: 224, height: 224 },
});
