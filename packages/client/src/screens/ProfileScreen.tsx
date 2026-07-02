import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

interface UserStats {
  userId: string;
  displayName: string;
  email: string;
  xp: number;
  catsDiscovered: number;
  catsOwned: number;
  rank: number;
}

interface WalletInfo {
  balance: number; // MYR cents
}

export function ProfileScreen() {
  const navigation = useNavigation();
  const logout = useAuth((s) => s.logout);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [balanceMyr, setBalanceMyr] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [statsData, wallet] = await Promise.all([
        api.get<UserStats>('/gamification/stats'),
        api.get<WalletInfo>('/wallet/balance'),
      ]);
      setStats(statsData);
      setBalanceMyr(wallet.balance / 100);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

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
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      ) : error ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Couldn't load profile.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadProfile}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={40} color="#fff" />
            </View>
            <Text style={styles.displayName}>{stats?.displayName ?? 'Unknown user'}</Text>
            <Text style={styles.email}>{stats?.email}</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={styles.statCardInner}>
                <Ionicons name="star" size={22} color="#FF8C00" />
                <Text style={styles.statValue}>{stats?.xp ?? 0}</Text>
                <Text style={styles.statLabel}>Total XP</Text>
              </View>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statCardInner}>
                <Ionicons name="trophy" size={22} color="#FF8C00" />
                <Text style={styles.statValue}>#{stats?.rank ?? '—'}</Text>
                <Text style={styles.statLabel}>Global Rank</Text>
              </View>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statCardInner}>
                <Ionicons name="paw" size={22} color="#FF8C00" />
                <Text style={styles.statValue}>{stats?.catsDiscovered ?? 0}</Text>
                <Text style={styles.statLabel}>Cats Discovered</Text>
              </View>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statCardInner}>
                <Ionicons name="heart" size={22} color="#FF8C00" />
                <Text style={styles.statValue}>{stats?.catsOwned ?? 0}</Text>
                <Text style={styles.statLabel}>Cats Owned</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Wallet Balance</Text>
            <Text style={styles.cardValue}>
              {balanceMyr != null ? `RM ${balanceMyr.toFixed(2)}` : '—'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            accessibilityLabel="Log out"
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={20} color="#e53935" />
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    backgroundColor: '#FF8C00',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  displayName: {
    fontSize: 18,
    color: '#333',
    fontWeight: '700',
  },
  email: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  statCard: {
    width: '50%',
    padding: 6,
  },
  statCardInner: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'flex-start',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardLabel: {
    fontSize: 13,
    color: '#999',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FF8C00',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#FFF0F0',
    gap: 8,
  },
  logoutText: {
    color: '#e53935',
    fontSize: 15,
    fontWeight: '600',
  },
});
