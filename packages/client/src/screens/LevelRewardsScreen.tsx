/**
 * LevelRewardsScreen — opened by tapping a cat's XP progress bar.
 *
 * Shows the full level ladder (1 → 10) as a progression tracker: levels the
 * user has passed (✓), the level they're currently in (highlighted, with XP
 * progress toward the next level), and locked future levels — each with the
 * rewards granted on reaching it (free food items, badges, feature unlocks).
 * Rewards data comes from GET /gamification/level-rewards (Req 17.11).
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation';
import { api } from '../services/api';

type RewardsRoute = RouteProp<RootStackParamList, 'LevelRewards'>;

interface LevelReward {
  level: number;
  xpRequired: number;
  items: Array<{ name: string; quantity: number }>;
  perks: string[];
}

const ITEM_ICONS: Record<string, string> = {
  'Cat Kibble': '🥣',
  'Cat Snack': '🍪',
  'Tuna Can': '🥫',
};

/** Badge tier per level milestone, used to tint milestone rows. */
const TIER_AT_LEVEL: Record<number, { label: string; color: string }> = {
  3: { label: 'BRONZE', color: '#B9793F' },
  5: { label: 'SILVER', color: '#8D9AA5' },
  7: { label: 'GOLD', color: '#D4A017' },
  10: { label: 'DIAMOND', color: '#4FC3F7' },
};

export function LevelRewardsScreen() {
  const navigation = useNavigation();
  const route = useRoute<RewardsRoute>();
  const { catName, level, xp } = route.params;

  const [rewards, setRewards] = useState<LevelReward[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .get<{ rewards: LevelReward[] }>('/gamification/level-rewards')
        .then((data) => setRewards(data.rewards))
        .catch(() => setRewards([]));
    }, []),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Level Rewards</Text>
        <View style={styles.headerSpacer} />
      </View>

      {rewards == null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>
              {catName ?? 'This cat'} — Level {level}
            </Text>
            <Text style={styles.summarySub}>
              {xp} XP earned{level >= 10 ? ' · Max level reached! 🏆' : ''}
            </Text>
          </View>

          {rewards.map((r, i) => {
            const passed = level >= r.level;
            const isCurrent = level + 1 === r.level; // the tier being worked toward
            const isLast = i === rewards.length - 1;
            const tier = TIER_AT_LEVEL[r.level];

            // XP progress toward the next level, shown on the current tier row
            const prevRequired = i === 0 ? 0 : rewards[i - 1].xpRequired;
            const progress = isCurrent
              ? Math.min(Math.max((xp - prevRequired) / (r.xpRequired - prevRequired), 0), 1)
              : 0;

            return (
              <View key={r.level} style={styles.row}>
                {/* Progression rail */}
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.railDot,
                      passed && styles.railDotPassed,
                      isCurrent && styles.railDotCurrent,
                    ]}
                  >
                    {passed ? (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    ) : (
                      <Text style={[styles.railDotText, isCurrent && styles.railDotTextCurrent]}>
                        {r.level}
                      </Text>
                    )}
                  </View>
                  {!isLast && (
                    <View style={[styles.railLine, passed && styles.railLinePassed]} />
                  )}
                </View>

                {/* Reward card */}
                <View
                  style={[
                    styles.rewardCard,
                    isCurrent && styles.rewardCardCurrent,
                    !passed && !isCurrent && styles.rewardCardLocked,
                  ]}
                >
                  <View style={styles.rewardHeader}>
                    <Text style={styles.rewardLevel}>Level {r.level}</Text>
                    {tier && (
                      <View style={[styles.tierChip, { backgroundColor: tier.color }]}>
                        <Text style={styles.tierChipText}>{tier.label}</Text>
                      </View>
                    )}
                    <Text style={styles.rewardXp}>{r.xpRequired} XP</Text>
                    {!passed && !isCurrent && (
                      <Ionicons name="lock-closed" size={14} color="#bbb" />
                    )}
                  </View>

                  {isCurrent && (
                    <View style={styles.progressWrap}>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { flex: progress }]} />
                        <View style={{ flex: 1 - progress }} />
                      </View>
                      <Text style={styles.progressText}>
                        {xp}/{r.xpRequired} XP — {r.xpRequired - xp} XP to go
                      </Text>
                    </View>
                  )}

                  {r.items.map((item) => (
                    <Text key={item.name} style={styles.rewardLine}>
                      {ITEM_ICONS[item.name] ?? '🎁'} {item.quantity}× {item.name} (free)
                    </Text>
                  ))}
                  {r.perks.map((perk) => (
                    <Text key={perk} style={styles.rewardLine}>
                      ⭐ {perk}
                    </Text>
                  ))}
                  {r.items.length === 0 && r.perks.length === 0 && (
                    <Text style={styles.rewardLineMuted}>Keep going — bigger rewards ahead!</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  headerSpacer: { width: 40 },
  content: { padding: 16, paddingBottom: 40 },
  summaryCard: {
    backgroundColor: '#FF8C00',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  summaryTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  summarySub: { color: '#FFE8CC', fontSize: 13, marginTop: 4 },
  row: { flexDirection: 'row' },
  rail: { width: 36, alignItems: 'center' },
  railDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  railDotPassed: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  railDotCurrent: { borderColor: '#FF8C00', borderWidth: 3 },
  railDotText: { fontSize: 12, fontWeight: '700', color: '#999' },
  railDotTextCurrent: { color: '#FF8C00' },
  railLine: { flex: 1, width: 2, backgroundColor: '#ddd', marginVertical: 2 },
  railLinePassed: { backgroundColor: '#4CAF50' },
  rewardCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    marginLeft: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  rewardCardCurrent: {
    borderWidth: 2,
    borderColor: '#FF8C00',
  },
  rewardCardLocked: { opacity: 0.55 },
  rewardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rewardLevel: { fontSize: 15, fontWeight: '700', color: '#333' },
  tierChip: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  tierChipText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  rewardXp: { flex: 1, textAlign: 'right', fontSize: 12, color: '#999', fontWeight: '600' },
  progressWrap: { marginTop: 8 },
  progressTrack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F0E6D8',
    overflow: 'hidden',
  },
  progressFill: { backgroundColor: '#FF8C00' },
  progressText: { fontSize: 11, color: '#999', marginTop: 4 },
  rewardLine: { fontSize: 13, color: '#444', marginTop: 6 },
  rewardLineMuted: { fontSize: 13, color: '#aaa', fontStyle: 'italic', marginTop: 6 },
});
