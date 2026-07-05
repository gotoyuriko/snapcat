import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation';
import { api, ApiError, resolvePhotoUrl } from '../services/api';
import { CachedImage } from '../components/CachedImage';
import { FeedCatModal, FeedResult } from '../components/FeedCatModal';

// --- Types ---

interface CatProfile {
  id: string;
  name: string | null;
  photoUrl: string | null;
  description: string | null;
  lastKnownApproxLat: number;
  lastKnownApproxLng: number;
  registeredAt: string;
}

interface Sighting {
  id: string;
  timestamp: string;
  fuzzedLat: number;
  fuzzedLng: number;
  photoUrl: string;
  type: 'scan' | 'manual';
}

interface OwnershipInfo {
  level: number;
  xp: number;
  nextLevelXp: number;
}

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  level: number;
  xp: number;
  rank: number;
}

interface ChatTeaser {
  content: string;
  senderName: string;
  createdAt: string;
}

interface CatProfileData {
  cat: CatProfile;
  ownership: OwnershipInfo | null;
  discovered: boolean;
  sightings: Sighting[];
  chatTeaser: ChatTeaser[];
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type CatProfileRouteProp = RouteProp<RootStackParamList, 'CatProfile'>;

// --- XP Level Thresholds ---

// Must match the server's thresholds (Requirement 6.6: each level's
// increment grows by 5 XP) — see packages/server gamification.service.ts
const LEVEL_THRESHOLDS: number[] = [
  0,   // Lvl0 - Discovered
  1,   // Lvl1 - Owner
  6,   // Lvl2
  16,  // Lvl3
  31,  // Lvl4
  51,  // Lvl5
  76,  // Lvl6
  106, // Lvl7 - unlocks medical/grooming
  141, // Lvl8
  181, // Lvl9
  226, // Lvl10
];

function getNextLevelXp(currentLevel: number): number {
  if (currentLevel >= 10) return LEVEL_THRESHOLDS[10];
  return LEVEL_THRESHOLDS[currentLevel + 1];
}

function getCurrentLevelXp(currentLevel: number): number {
  if (currentLevel < 0) return 0;
  if (currentLevel > 10) return LEVEL_THRESHOLDS[10];
  return LEVEL_THRESHOLDS[currentLevel];
}

// --- Components ---

/** Brief green "(+X XP)" pop shown next to the XP total after feeding.
 *  Shows a cap notice instead when the donation awarded no XP. */
function InlineXPGain({ amount, levelUp, newLevel, onDone }: {
  amount: number;
  levelUp?: boolean;
  newLevel?: number;
  onDone: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  // Keep the latest onDone without re-triggering the animation: the parent
  // re-renders mid-animation (profile refetch) and a re-run of this effect
  // would interrupt the sequence and hide the popup early.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]),
      Animated.delay(levelUp ? 1800 : 1100),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => onDoneRef.current());
    // Runs once per mount — the parent keys this component per feed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (amount <= 0) {
    return (
      <Animated.View
        pointerEvents="none"
        style={[styles.xpGainInline, { opacity, transform: [{ scale }] }]}
      >
        <Text style={styles.xpCapText}>Daily XP cap reached</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.xpGainInline, { opacity, transform: [{ scale }] }]}
    >
      <Text style={styles.xpGainText}>+{amount} XP</Text>
      {levelUp && (
        <Text style={styles.levelUpText}>🎉 Level Up! Now Level {newLevel}</Text>
      )}
    </Animated.View>
  );
}

/** XP Progress Bar — the fill and the XP total count up whenever XP changes. */
function XPProgressBar({ ownership, gain, onGainDone }: {
  ownership: OwnershipInfo;
  gain: (FeedResult & { seq: number }) | null;
  onGainDone: () => void;
}) {
  const currentLevelXp = getCurrentLevelXp(ownership.level);
  const nextLevelXp = getNextLevelXp(ownership.level);
  const xpInLevel = ownership.xp - currentLevelXp;
  const xpNeeded = nextLevelXp - currentLevelXp;
  const progress = ownership.level >= 10 ? 1 : Math.min(xpInLevel / xpNeeded, 1);

  const animatedProgress = useRef(new Animated.Value(progress)).current;
  const prevLevelRef = useRef(ownership.level);

  // Count the displayed XP total up (rolling-number effect) whenever XP changes.
  const [displayXp, setDisplayXp] = useState(ownership.xp);
  const xpCounter = useRef(new Animated.Value(ownership.xp)).current;

  useEffect(() => {
    const listenerId = xpCounter.addListener(({ value }) => {
      setDisplayXp(Math.round(value));
    });
    Animated.timing(xpCounter, {
      toValue: ownership.xp,
      duration: 800,
      useNativeDriver: false, // listener-driven text, no native prop to animate
    }).start(() => setDisplayXp(ownership.xp));
    return () => xpCounter.removeListener(listenerId);
  }, [ownership.xp, xpCounter]);

  useEffect(() => {
    if (prevLevelRef.current !== ownership.level) {
      // On level-up the bar resets to the new level's scale: snap back to 0
      // then fill to the new position so the animation reads as "rolled over".
      prevLevelRef.current = ownership.level;
      animatedProgress.setValue(0);
    }
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 800,
      useNativeDriver: false, // width isn't supported by the native driver
    }).start();
  }, [progress, ownership.level, animatedProgress]);

  const width = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.xpContainer}>
      <View style={styles.xpHeader}>
        <Text style={styles.xpLevelText}>Level {ownership.level}</Text>
        <View style={styles.xpValueRow}>
          {gain && (
            <InlineXPGain
              key={gain.seq}
              amount={gain.xpAwarded}
              levelUp={gain.levelUp}
              newLevel={gain.newLevel}
              onDone={onGainDone}
            />
          )}
          <Text style={styles.xpValueText}>{displayXp} XP</Text>
        </View>
      </View>
      <View style={styles.xpBarBackground}>
        <Animated.View style={[styles.xpBarFill, { width }]} />
      </View>
      {ownership.level < 10 && (
        <Text style={styles.xpNextLevel}>
          {nextLevelXp - ownership.xp} XP to Level {ownership.level + 1}
        </Text>
      )}
      {ownership.level >= 10 && (
        <Text style={styles.xpNextLevel}>Max level reached!</Text>
      )}
    </View>
  );
}

/** Sighting History Item */
function SightingItem({ sighting }: { sighting: Sighting }) {
  const date = new Date(sighting.timestamp);
  return (
    <View style={styles.sightingItem}>
      <CachedImage
        source={{ uri: resolvePhotoUrl(sighting.photoUrl) }}
        style={styles.sightingPhoto}
        contentFit="cover"
      />
      <View style={styles.sightingInfo}>
        <Text style={styles.sightingDate}>
          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <Text style={styles.sightingType}>
          {sighting.type === 'scan' ? '📷 Scan' : '📝 Manual'}
        </Text>
      </View>
    </View>
  );
}

/** Owner Leaderboard */
function OwnerLeaderboard({ catId }: { catId: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const data = await api.get<{ entries: LeaderboardEntry[] }>(
        `/cats/${catId}/leaderboard?limit=20`,
      );
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [catId]);

  // Refetch whenever the screen regains focus so rankings reflect XP earned
  // since the profile was first opened (e.g. after feeding).
  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard();
    }, [fetchLeaderboard]),
  );

  if (loading) {
    return (
      <View style={styles.leaderboardSection}>
        <Text style={styles.sectionTitle}>🏆 Owner Leaderboard</Text>
        <ActivityIndicator size="small" color="#FF8C00" />
      </View>
    );
  }

  return (
    <View style={styles.leaderboardSection}>
      <Text style={styles.sectionTitle}>🏆 Owner Leaderboard</Text>
      {entries.length === 0 ? (
        <Text style={styles.emptyText}>No owners yet</Text>
      ) : (
        entries.map((entry) => (
          <View key={entry.userId} style={styles.leaderboardEntry}>
            <Text style={styles.leaderboardRank}>#{entry.rank}</Text>
            <View style={styles.leaderboardInfo}>
              <Text style={styles.leaderboardName}>{entry.displayName}</Text>
              <Text style={styles.leaderboardDetails}>
                Lvl {entry.level} · {entry.xp} XP
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

/** Chat Teaser (Lvl0 users see 1-2 messages) */
function ChatTeaserSection({ messages }: { messages: ChatTeaser[] }) {
  if (messages.length === 0) return null;

  return (
    <View style={styles.chatTeaserSection}>
      <Text style={styles.sectionTitle}>💬 Community Chat</Text>
      {messages.map((msg, index) => (
        <View key={index} style={styles.chatTeaserBubble}>
          <Text style={styles.chatTeaserSender}>{msg.senderName}</Text>
          <Text style={styles.chatTeaserContent} numberOfLines={2}>
            {msg.content}
          </Text>
        </View>
      ))}
      <Text style={styles.chatTeaserHint}>
        Become an Owner (Lvl1+) to join the conversation
      </Text>
    </View>
  );
}

/** Undiscovered Cat View — silhouette + approximate area only */
function UndiscoveredCatView({ cat }: { cat: CatProfile }) {
  return (
    <View style={styles.undiscoveredContainer}>
      <View style={styles.silhouetteContainer}>
        <Text style={styles.silhouetteIcon}>🐱</Text>
        <View style={styles.silhouetteOverlay} />
      </View>
      <Text style={styles.undiscoveredTitle}>Unknown Cat</Text>
      <Text style={styles.undiscoveredArea}>
        📍 Approximate area: ({cat.lastKnownApproxLat.toFixed(3)}, {cat.lastKnownApproxLng.toFixed(3)})
      </Text>
      <Text style={styles.undiscoveredHint}>
        Scan this cat up close to discover its profile!
      </Text>
    </View>
  );
}

// --- Main Screen ---

export function CatProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<CatProfileRouteProp>();
  const { catId } = route.params;

  const [profileData, setProfileData] = useState<CatProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  const [feedModalVisible, setFeedModalVisible] = useState(false);
  // seq keys the popup so every feed remounts it and replays the animation
  const [xpFeedback, setXpFeedback] = useState<(FeedResult & { seq: number }) | null>(null);
  const feedSeqRef = useRef(0);

  /** Fetch without toggling the full-screen spinner (for silent refreshes). */
  const loadProfile = useCallback(async () => {
    try {
      const data = await api.get<CatProfileData>(`/cats/${catId}`);
      setProfileData(data);
      setError(null);
    } catch (err) {
      setError('Failed to load cat profile');
    }
  }, [catId]);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    await loadProfile();
    setLoading(false);
  }, [loadProfile]);

  // First focus: full load with spinner. Later focuses (e.g. returning from
  // the feeding flow): silent refetch so XP/level reflect new donations.
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        fetchProfile();
      } else {
        loadProfile();
      }
    }, [fetchProfile, loadProfile]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  }, [loadProfile]);

  const handleFeedCat = () => {
    setFeedModalVisible(true);
  };

  /** Donation succeeded: close the modal, bump XP locally so the bar animates
   *  right away, show the "+X XP" toast, then confirm with the server. */
  const handleFeedSuccess = useCallback(
    (result: FeedResult) => {
      setFeedModalVisible(false);
      // Always show feedback — a 0-XP result means the daily cap was hit,
      // which the popup explains instead of failing silently.
      feedSeqRef.current += 1;
      setXpFeedback({ ...result, seq: feedSeqRef.current });
      if (result.xpAwarded > 0) {
        setProfileData((prev) => {
          if (!prev) return prev;
          const prevOwnership = prev.ownership ?? { level: 0, xp: 0, nextLevelXp: 1 };
          const newXp = prevOwnership.xp + result.xpAwarded;
          const newLevel = result.levelUp && result.newLevel != null
            ? result.newLevel
            : prevOwnership.level;
          return {
            ...prev,
            ownership: {
              ...prevOwnership,
              xp: newXp,
              level: newLevel,
              nextLevelXp: getNextLevelXp(newLevel),
            },
          };
        });
      }
      // Reconcile with the server (leaderboard, ownership, sightings).
      loadProfile();
    },
    [loadProfile],
  );

  const startEditName = () => {
    setNameDraft(profileData?.cat.name ?? '');
    setEditingName(true);
  };

  const cancelEditName = () => {
    setEditingName(false);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a name for this cat.');
      return;
    }
    setSavingName(true);
    try {
      await api.patch<{ id: string; name: string }>(`/cats/${catId}`, { name: trimmed });
      setProfileData((prev) => (prev ? { ...prev, cat: { ...prev.cat, name: trimmed } } : prev));
      setEditingName(false);
    } catch (err) {
      Alert.alert(
        'Could not rename cat',
        err instanceof ApiError ? err.friendlyMessage : 'Please try again.',
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleBack = () => {
    if (editingName) {
      Alert.alert(
        'Discard name change?',
        'You started editing this cat\'s name but haven\'t saved it. Leaving now will lose that change.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ],
      );
      return;
    }
    if (!profileData?.cat.name) {
      Alert.alert(
        'This cat has no name yet',
        'Give it a name so other users can recognize it. Leave without naming it?',
        [
          { text: 'Name It', style: 'cancel' },
          { text: 'Leave Anyway', style: 'destructive', onPress: () => navigation.goBack() },
        ],
      );
      return;
    }
    navigation.goBack();
  };

  const handleRequestMedical = () => {
    // Only Lvl7+ owners can trigger medical requests (Req 9.1);
    // the button is greyed out for lower levels (Req 9.3).
    if (profileData?.ownership && profileData.ownership.level >= 7) {
      navigation.navigate('MedicalRequest', { catId });
    }
  };

  const handleOpenChat = () => {
    navigation.navigate('Chat', { catId });
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator size="large" color="#FF8C00" />
        <Text style={styles.loadingText}>Loading cat profile...</Text>
      </SafeAreaView>
    );
  }

  // Error state
  if (error || !profileData) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.errorText}>{error ?? 'Something went wrong'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchProfile}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Undiscovered cat — show only silhouette + approximate area
  // Req 14.8: no name, photo, leaderboard, chat teaser, or action buttons
  if (!profileData.discovered) {
    return (
      <SafeAreaView style={styles.scrollContainer} edges={['top']}>
        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <UndiscoveredCatView cat={profileData.cat} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Discovered cat — full profile view
  const { cat, ownership, sightings, chatTeaser } = profileData;
  const ownershipLevel = ownership?.level ?? 0;
  const canRequestMedical = ownershipLevel >= 7;
  const canChat = ownershipLevel >= 1;

  return (
    <SafeAreaView style={styles.scrollContainer} edges={['top']}>
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Back button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleBack}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      {/* Cat Photo & Name */}
      <View style={styles.headerSection}>
        {cat.photoUrl ? (
          <CachedImage
            source={{ uri: resolvePhotoUrl(cat.photoUrl) }}
            style={styles.catPhoto}
            contentFit="cover"
          />
        ) : (
          <View style={styles.catPhotoPlaceholder}>
            <Text style={styles.catPhotoPlaceholderText}>🐱</Text>
          </View>
        )}
        {editingName ? (
          <View style={styles.nameEditRow}>
            <TextInput
              style={styles.nameInput}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Cat name"
              placeholderTextColor="#999"
              maxLength={50}
              autoFocus
              editable={!savingName}
            />
            <TouchableOpacity
              style={styles.nameSaveButton}
              onPress={saveName}
              disabled={savingName}
              accessibilityLabel="Save name"
              accessibilityRole="button"
            >
              {savingName ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.nameSaveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.nameCancelButton}
              onPress={cancelEditName}
              disabled={savingName}
              accessibilityLabel="Cancel editing name"
              accessibilityRole="button"
            >
              <Text style={styles.nameCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.nameRow}
            onPress={startEditName}
            accessibilityLabel="Edit cat name"
            accessibilityRole="button"
          >
            <Text style={styles.catName}>{cat.name ?? 'Unnamed Cat'}</Text>
            <Text style={styles.nameEditIcon}>✏️</Text>
          </TouchableOpacity>
        )}
        {cat.description && (
          <Text style={styles.catDescription}>{cat.description}</Text>
        )}
        <Text style={styles.catLocation}>
          📍 Last seen: ({cat.lastKnownApproxLat.toFixed(3)}, {cat.lastKnownApproxLng.toFixed(3)})
        </Text>
      </View>

      {/* Ownership Level & XP Progress Bar — tap to see the full level
          rewards ladder (passed / current / upcoming tiers). */}
      {/* Req 6.7: accumulated XP always visible; Req 14.3 */}
      {ownership ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() =>
            navigation.navigate('LevelRewards', {
              catId,
              catName: cat.name,
              level: ownership.level,
              xp: ownership.xp,
            })
          }
          accessibilityLabel="View level rewards"
          accessibilityRole="button"
        >
          <XPProgressBar
            ownership={ownership}
            gain={xpFeedback}
            onGainDone={() => setXpFeedback(null)}
          />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.xpContainer}
          activeOpacity={0.7}
          onPress={() =>
            navigation.navigate('LevelRewards', {
              catId,
              catName: cat.name,
              level: 0,
              xp: 0,
            })
          }
          accessibilityLabel="View level rewards"
          accessibilityRole="button"
        >
          <Text style={styles.xpLevelText}>Level 0 — Discovered</Text>
          <Text style={styles.xpValueText}>0 XP · Tap to see level rewards</Text>
        </TouchableOpacity>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtonsSection}>
        {/* Feed Cat — available for Lvl0+ discovered users (Req 14.4) */}
        <TouchableOpacity
          style={styles.feedButton}
          onPress={handleFeedCat}
          accessibilityLabel="Feed Cat"
          accessibilityRole="button"
        >
          <Text style={styles.feedButtonText}>🍖 Feed Cat</Text>
        </TouchableOpacity>

        {/* Community Chat — gated to Lvl1+ (Req 8.1) */}
        {canChat && (
          <TouchableOpacity
            style={styles.chatButton}
            onPress={handleOpenChat}
            accessibilityLabel="Open Community Chat"
            accessibilityRole="button"
          >
            <Text style={styles.chatButtonText}>💬 Community Chat</Text>
          </TouchableOpacity>
        )}

        {/* Request Medical/Grooming — Lvl7+ required (Req 9.1, 9.3) */}
        <TouchableOpacity
          style={[
            styles.medicalButton,
            !canRequestMedical && styles.medicalButtonDisabled,
          ]}
          onPress={handleRequestMedical}
          disabled={!canRequestMedical}
          accessibilityLabel={
            canRequestMedical
              ? 'Request Medical or Grooming'
              : 'Medical requests available after Level 7'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: !canRequestMedical }}
        >
          <Text
            style={[
              styles.medicalButtonText,
              !canRequestMedical && styles.medicalButtonTextDisabled,
            ]}
          >
            🏥 Request Medical/Grooming
          </Text>
          {!canRequestMedical && (
            <Text style={styles.medicalLockText}>
              🔒 Available after Level 7
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Owner Leaderboard (Req 14.5, 14.6, 14.7) */}
      <OwnerLeaderboard catId={catId} />

      {/* Chat Teaser — for Lvl0 discovered users (Req 14.2) */}
      {ownershipLevel < 1 && chatTeaser && chatTeaser.length > 0 && (
        <ChatTeaserSection messages={chatTeaser} />
      )}

      {/* Sighting History (Req 14.1) */}
      <View style={styles.sightingsSection}>
        <Text style={styles.sectionTitle}>📍 Sighting History</Text>
        {sightings.length === 0 ? (
          <Text style={styles.emptyText}>No sightings recorded yet</Text>
        ) : (
          sightings.map((sighting) => (
            <SightingItem key={sighting.id} sighting={sighting} />
          ))
        )}
      </View>
    </ScrollView>

    {/* Floating feeding window */}
    <FeedCatModal
      visible={feedModalVisible}
      catId={catId}
      onClose={() => setFeedModalVisible(false)}
      onSuccess={handleFeedSuccess}
    />
    </SafeAreaView>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#FF8C00',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF8C00',
    fontWeight: '600',
  },

  // Header / Cat Info
  headerSection: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  catPhoto: {
    width: 160,
    height: 160,
    borderRadius: 80,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#FF8C00',
  },
  catPhotoPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#FF8C00',
  },
  catPhotoPlaceholderText: {
    fontSize: 64,
  },
  catName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  nameEditIcon: {
    fontSize: 16,
    marginBottom: 4,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
    width: '100%',
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  nameSaveButton: {
    backgroundColor: '#FF8C00',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  nameSaveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  nameCancelButton: {
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  nameCancelButtonText: {
    color: '#999',
    fontSize: 14,
  },
  catDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 24,
  },
  catLocation: {
    fontSize: 12,
    color: '#999',
  },

  // XP Progress
  xpValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  xpGainInline: {
    alignItems: 'flex-end',
  },
  xpGainText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4CAF50',
  },
  levelUpText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF8C00',
    marginTop: 1,
  },
  xpCapText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E6A23C',
  },
  xpContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  xpLevelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF8C00',
  },
  xpValueText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  xpBarBackground: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    backgroundColor: '#FF8C00',
    borderRadius: 5,
  },
  xpNextLevel: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
    textAlign: 'right',
  },

  // Action Buttons
  actionButtonsSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },
  feedButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  feedButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  chatButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  chatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  medicalButton: {
    backgroundColor: '#9C27B0',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  medicalButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  medicalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  medicalButtonTextDisabled: {
    color: '#999',
  },
  medicalLockText: {
    color: '#999',
    fontSize: 12,
    marginTop: 4,
  },

  // Owner Leaderboard
  leaderboardSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  leaderboardEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  leaderboardRank: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF8C00',
    width: 40,
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  leaderboardDetails: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },

  // Chat Teaser
  chatTeaserSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  chatTeaserBubble: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  chatTeaserSender: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 2,
  },
  chatTeaserContent: {
    fontSize: 13,
    color: '#333',
  },
  chatTeaserHint: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Sighting History
  sightingsSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  sightingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sightingPhoto: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#eee',
  },
  sightingInfo: {
    flex: 1,
  },
  sightingDate: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  sightingType: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },

  // Section headers
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Undiscovered cat view
  undiscoveredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 48,
  },
  silhouetteContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    overflow: 'hidden',
  },
  silhouetteIcon: {
    fontSize: 64,
    opacity: 0.3,
  },
  silhouetteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  undiscoveredTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#555',
    marginBottom: 12,
  },
  undiscoveredArea: {
    fontSize: 14,
    color: '#777',
    marginBottom: 16,
    textAlign: 'center',
  },
  undiscoveredHint: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
