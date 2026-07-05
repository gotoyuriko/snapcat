import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface CelebratedBadge {
  id: string;
  title: string;
  icon: string;
}

interface BadgeCelebrationProps {
  badges: CelebratedBadge[];
  onDone: () => void;
}

/**
 * Requirement 18.2: congratulatory animation shown when a badge is earned.
 * A card pops in with a spring, floats briefly, then fades out (or is
 * dismissed by tapping anywhere).
 */
export function BadgeCelebration({ badges, onDone }: BadgeCelebrationProps) {
  const scale = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(opacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onDone());
  };

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(finish, 2600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (badges.length === 0) return null;

  return (
    <TouchableWithoutFeedback onPress={finish} accessibilityLabel="Dismiss badge celebration">
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.confetti}>🎉</Text>
          <View style={styles.iconCircle}>
            <Ionicons
              name={(badges[0].icon as never) ?? 'ribbon'}
              size={42}
              color="#FFD700"
            />
          </View>
          <Text style={styles.heading}>Badge Earned!</Text>
          {badges.map((badge) => (
            <Text key={badge.id} style={styles.badgeTitle}>
              {badge.title}
            </Text>
          ))}
        </Animated.View>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 32,
    alignItems: 'center',
    maxWidth: '82%',
  },
  confetti: {
    fontSize: 34,
    marginBottom: 4,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFF7E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 6,
  },
  badgeTitle: {
    fontSize: 15,
    color: '#FF8C00',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
});
