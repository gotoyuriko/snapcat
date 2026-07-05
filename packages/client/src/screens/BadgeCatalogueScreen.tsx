import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

// GET /gamification/badges/catalogue (Requirement 18.6)
interface CatalogueBadge {
  id: string;
  title: string;
  icon: string;
  type: 'global' | 'per-cat';
  criteria: string;
  target: number;
  progress: number;
  earned: boolean;
  /** Per-cat tiers only: with how many cats this tier has been reached. */
  earnedCount?: number;
}

const TIER_COLORS: Record<string, string> = {
  'tier-bronze': '#CD7F32',
  'tier-silver': '#9EA7AD',
  'tier-gold': '#D4A017',
  'tier-diamond': '#4FC3F7',
};

/**
 * Requirement 18.6: badge catalogue — every available badge, its unlock
 * criteria, and the user's current progress toward it.
 */
export function BadgeCatalogueScreen() {
  const navigation = useNavigation();
  const [badges, setBadges] = useState<CatalogueBadge[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await api.get<{ badges: CatalogueBadge[] }>('/gamification/badges/catalogue');
      setBadges(data.badges);
    } catch {
      setError(true);
      setBadges([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const globals = (badges ?? []).filter((b) => b.type === 'global');
  const tiers = (badges ?? []).filter((b) => b.type === 'per-cat');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Badge Catalogue</Text>
      </View>

      {badges == null ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>Could not load the badge catalogue.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.sectionTitle}>Milestones</Text>
          {globals.map((badge) => (
            <BadgeRow key={badge.id} badge={badge} />
          ))}

          <Text style={styles.sectionTitle}>Cat Level Badges</Text>
          <Text style={styles.sectionHint}>
            Earned per cat — level up with a cat to collect its badge tiers.
          </Text>
          {tiers.map((badge) => (
            <BadgeRow key={badge.id} badge={badge} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function BadgeRow({ badge }: { badge: CatalogueBadge }) {
  const ratio = badge.target > 0 ? Math.min(badge.progress / badge.target, 1) : 0;
  const tint = TIER_COLORS[badge.id] ?? '#FF8C00';

  return (
    <View style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}>
      <View style={[styles.badgeIconCircle, { backgroundColor: badge.earned ? '#FFF7E0' : '#F0F0F0' }]}>
        <Ionicons
          name={(badge.icon as never) ?? 'ribbon'}
          size={26}
          color={badge.earned ? tint : '#BDBDBD'}
        />
      </View>
      <View style={styles.badgeMain}>
        <View style={styles.badgeTitleRow}>
          <Text style={styles.badgeTitle}>{badge.title}</Text>
          {badge.earned && (
            <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
          )}
        </View>
        <Text style={styles.badgeCriteria}>{badge.criteria}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${ratio * 100}%`, backgroundColor: tint }]} />
        </View>
        <Text style={styles.progressLabel}>
          {badge.progress}/{badge.target}
          {badge.earnedCount != null && badge.earnedCount > 0
            ? ` · earned with ${badge.earnedCount} cat${badge.earnedCount > 1 ? 's' : ''}`
            : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#666',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#FF8C00',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginTop: 8,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 13,
    color: '#888',
    marginBottom: 8,
  },
  badgeCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  badgeCardLocked: {
    opacity: 0.75,
  },
  badgeIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeMain: {
    flex: 1,
  },
  badgeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  badgeCriteria: {
    fontSize: 13,
    color: '#777',
    marginTop: 2,
    marginBottom: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EEE',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});
