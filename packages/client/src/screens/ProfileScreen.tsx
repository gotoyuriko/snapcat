import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
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

interface Badge {
  id: string;
  title: string;
  icon: string;
  type: 'global' | 'per-cat';
  tier?: 'bronze' | 'silver' | 'gold' | 'diamond';
  catPhotoUrl?: string | null;
}

const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32',
  silver: '#9EA7AD',
  gold: '#D4A017',
  diamond: '#4FC3F7',
};

interface InventoryEntry {
  foodItemId: string;
  name: string;
  priceMyr: number;
  quantity: number;
}

interface DonationRecord {
  id: string;
  foodItem: string;
  amountCents: number;
  status: string;
  createdAt: string;
}

export function ProfileScreen() {
  const navigation = useNavigation();
  const logout = useAuth((s) => s.logout);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [statsData, badgeData] = await Promise.all([
        api.get<UserStats>('/gamification/stats'),
        api.get<{ badges: Badge[] }>('/gamification/badges'),
      ]);
      setStats(statsData);
      setBadges(badgeData.badges);
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

  // Edit Profile modal
  const [editVisible, setEditVisible] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const openEditProfile = useCallback(() => {
    setNameDraft(stats?.displayName ?? '');
    setEditVisible(true);
  }, [stats]);

  const saveProfile = useCallback(async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert('Invalid name', 'Display name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const updated = await api.patch<{ displayName: string }>('/auth/me', {
        displayName: trimmed,
      });
      setStats((prev) => (prev ? { ...prev, displayName: updated.displayName } : prev));
      setEditVisible(false);
    } catch {
      Alert.alert('Update failed', 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [nameDraft]);

  // My Rewards (level rewards inventory — Requirement 17.11) and Donation History
  // modals; each fetches on open.
  const [rewardsVisible, setRewardsVisible] = useState(false);
  const [rewards, setRewards] = useState<InventoryEntry[] | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [history, setHistory] = useState<DonationRecord[] | null>(null);

  const openRewards = useCallback(async () => {
    setRewardsVisible(true);
    setRewards(null);
    try {
      const data = await api.get<{ inventory: InventoryEntry[] }>('/food-items');
      setRewards(data.inventory);
    } catch {
      setRewards([]);
    }
  }, []);

  const openHistory = useCallback(async () => {
    setHistoryVisible(true);
    setHistory(null);
    try {
      setHistory(await api.get<DonationRecord[]>('/donations/history'));
    } catch {
      setHistory([]);
    }
  }, []);

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
        <ScrollView>
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
            <Text style={styles.cardLabel}>Badges</Text>
            {badges.length === 0 ? (
              <Text style={styles.badgeEmptyText}>
                No badges yet — discover cats and donate to earn them!
              </Text>
            ) : (
              <View style={styles.badgeRow}>
                {badges.map((badge) => (
                  <View key={badge.id} style={styles.badgeItem}>
                    <View
                      style={[
                        styles.badgeCircle,
                        badge.tier ? { backgroundColor: TIER_COLORS[badge.tier] } : null,
                      ]}
                    >
                      {badge.type === 'per-cat' && badge.catPhotoUrl ? (
                        <Image source={{ uri: badge.catPhotoUrl }} style={styles.badgeCatPhoto} />
                      ) : (
                        <Ionicons
                          name={badge.icon as keyof typeof Ionicons.glyphMap}
                          size={24}
                          color="#fff"
                        />
                      )}
                    </View>
                    <Text style={styles.badgeTitle} numberOfLines={2}>
                      {badge.title}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={openEditProfile}
              accessibilityLabel="Edit profile"
              accessibilityRole="button"
            >
              <Ionicons name="create-outline" size={20} color="#FF8C00" />
              <Text style={styles.menuLabel}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuRow}
              onPress={openRewards}
              accessibilityLabel="My rewards"
              accessibilityRole="button"
            >
              <Ionicons name="gift-outline" size={20} color="#FF8C00" />
              <Text style={styles.menuLabel}>My Rewards</Text>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuRow}
              onPress={openHistory}
              accessibilityLabel="Donation history"
              accessibilityRole="button"
            >
              <Ionicons name="receipt-outline" size={20} color="#FF8C00" />
              <Text style={styles.menuLabel}>Donation History</Text>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
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
        </ScrollView>
      )}

      {/* Edit Profile modal */}
      <Modal visible={editVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <Text style={styles.modalFieldLabel}>Display name</Text>
            <TextInput
              style={styles.modalInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              maxLength={100}
              autoFocus
              accessibilityLabel="Display name"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditVisible(false)}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveProfile} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* My Rewards modal — level rewards inventory (Requirement 17.11) */}
      <Modal visible={rewardsVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>My Rewards</Text>
            {rewards == null ? (
              <ActivityIndicator size="small" color="#FF8C00" style={styles.modalSpinner} />
            ) : rewards.length === 0 ? (
              <Text style={styles.modalEmptyText}>
                No rewards yet — level up with your cats to earn free food items!
              </Text>
            ) : (
              <ScrollView style={styles.modalList}>
                {rewards.map((entry) => (
                  <View key={entry.foodItemId} style={styles.modalListRow}>
                    <Ionicons name="fast-food-outline" size={18} color="#FF8C00" />
                    <Text style={styles.modalListLabel}>{entry.name}</Text>
                    <Text style={styles.modalListValue}>×{entry.quantity}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setRewardsVisible(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Donation History modal */}
      <Modal visible={historyVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Donation History</Text>
            {history == null ? (
              <ActivityIndicator size="small" color="#FF8C00" style={styles.modalSpinner} />
            ) : history.length === 0 ? (
              <Text style={styles.modalEmptyText}>No donations yet.</Text>
            ) : (
              <ScrollView style={styles.modalList}>
                {history.map((d) => (
                  <View key={d.id} style={styles.modalListRow}>
                    <Ionicons name="heart-outline" size={18} color="#FF8C00" />
                    <View style={styles.modalListMain}>
                      <Text style={styles.modalListLabel}>
                        {d.foodItem || `RM ${(d.amountCents / 100).toFixed(2)}`}
                      </Text>
                      <Text style={styles.modalListSub}>
                        {new Date(d.createdAt).toLocaleDateString()} · {d.status}
                      </Text>
                    </View>
                    <Text style={styles.modalListValue}>
                      RM {(d.amountCents / 100).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setHistoryVisible(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  badgeEmptyText: {
    fontSize: 13,
    color: '#999',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  badgeItem: {
    width: 72,
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  badgeCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF8C00',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  badgeCatPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  badgeTitle: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#eee',
    marginLeft: 48,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  modalFieldLabel: {
    fontSize: 13,
    color: '#999',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#333',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelText: {
    color: '#999',
    fontSize: 15,
    fontWeight: '600',
  },
  modalSaveBtn: {
    backgroundColor: '#FF8C00',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    minWidth: 80,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalSpinner: {
    marginVertical: 16,
  },
  modalEmptyText: {
    fontSize: 14,
    color: '#666',
    marginVertical: 8,
  },
  modalList: {
    marginVertical: 4,
  },
  modalListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  modalListMain: {
    flex: 1,
  },
  modalListLabel: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  modalListSub: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  modalListValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  modalCloseBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  logoutButton: {
    marginBottom: 24,
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
