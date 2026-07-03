import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { api } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type CatpediaFilter = 'all' | 'discovered' | 'owned';

/** A cat that the user has discovered or owns — full details visible */
interface DiscoveredCatEntry {
  id: string;
  name: string | null;
  photoUrl: string | null;
  level: number;
  xp: number;
  approxLat: number;
  approxLng: number;
  discovered: true;
  owned: boolean;
}

/** A cat the user has NOT discovered — silhouette only */
interface UndiscoveredCatEntry {
  id: string;
  approxLat: number;
  approxLng: number;
  discovered: false;
}

type CatpediaEntry = DiscoveredCatEntry | UndiscoveredCatEntry;

const FILTER_TABS: { label: string; value: CatpediaFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Discovered', value: 'discovered' },
  { label: 'Owned', value: 'owned' },
];

export function CatpediaScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [filter, setFilter] = useState<CatpediaFilter>('all');
  const [entries, setEntries] = useState<CatpediaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSilhouette, setSelectedSilhouette] = useState<UndiscoveredCatEntry | null>(null);

  const fetchCatpedia = useCallback(async (filterValue: CatpediaFilter) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<CatpediaEntry[]>(`/catpedia?filter=${filterValue}`);
      setEntries(data);
    } catch (err) {
      setError('Failed to load Catpedia. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatpedia(filter);
  }, [filter, fetchCatpedia]);

  const handleFilterChange = (newFilter: CatpediaFilter) => {
    setFilter(newFilter);
  };

  const handleCatPress = (entry: CatpediaEntry) => {
    if (entry.discovered) {
      navigation.navigate('CatProfile', { catId: entry.id });
    } else {
      setSelectedSilhouette(entry);
    }
  };

  const renderCatItem = ({ item }: { item: CatpediaEntry }) => {
    if (item.discovered) {
      return (
        <TouchableOpacity
          style={styles.catCard}
          onPress={() => handleCatPress(item)}
          accessibilityLabel={`View profile for ${item.name ?? 'cat'}`}
          accessibilityRole="button"
        >
          {item.photoUrl ? (
            <Image
              source={{ uri: item.photoUrl }}
              style={styles.catPhoto}
              onError={(e) =>
                console.warn(
                  `Failed to load cat photo for ${item.name ?? item.id}:`,
                  item.photoUrl,
                  e.nativeEvent.error
                )
              }
            />
          ) : (
            <View style={[styles.catPhoto, styles.placeholderPhoto]}>
              <Text style={styles.placeholderEmoji}>🐱</Text>
            </View>
          )}
          <View style={styles.catInfo}>
            <Text style={styles.catName} numberOfLines={1}>
              {item.name ?? 'Unnamed Cat'}
            </Text>
            <Text style={styles.catLevel}>
              {item.owned ? `Owner Lvl ${item.level}` : 'Discovered'}
            </Text>
            <Text style={styles.catXp}>{item.xp} XP</Text>
          </View>
        </TouchableOpacity>
      );
    }

    // Undiscovered cat — locked silhouette
    return (
      <TouchableOpacity
        style={[styles.catCard, styles.silhouetteCard]}
        onPress={() => handleCatPress(item)}
        accessibilityLabel="Unknown cat - tap to see approximate area"
        accessibilityRole="button"
      >
        <View style={[styles.catPhoto, styles.silhouettePhoto]}>
          <Text style={styles.lockIcon}>🔒</Text>
        </View>
        <View style={styles.catInfo}>
          <Text style={styles.silhouetteName}>???</Text>
          <Text style={styles.silhouetteHint}>Undiscovered</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Catpedia</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.filterTab, filter === tab.value && styles.filterTabActive]}
            onPress={() => handleFilterChange(tab.value)}
            accessibilityLabel={`Filter by ${tab.label}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === tab.value }}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === tab.value && styles.filterTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <Text style={styles.loadingText}>Loading cats...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchCatpedia(filter)}
            accessibilityLabel="Retry loading"
            accessibilityRole="button"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>
            {filter === 'all'
              ? 'No cats registered yet.'
              : filter === 'discovered'
                ? 'No stray cats discovered yet.'
                : "You don't own any cats yet."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderCatItem}
          contentContainerStyle={styles.listContent}
          numColumns={2}
          columnWrapperStyle={styles.row}
        />
      )}

      {/* Silhouette tap modal — approximate area only */}
      <Modal
        visible={selectedSilhouette != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedSilhouette(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedSilhouette(null)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalSilhouette}>
              <Text style={styles.modalLockIcon}>🔒</Text>
            </View>
            <Text style={styles.modalTitle}>Unknown Cat</Text>
            <Text style={styles.modalArea}>
              Approximate area: ({selectedSilhouette?.approxLat.toFixed(3)},{' '}
              {selectedSilhouette?.approxLng.toFixed(3)})
            </Text>
            <Text style={styles.modalHint}>
              Scan this cat in person to discover it!
            </Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setSelectedSilhouette(null)}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
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
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FF8C00',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFF',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 20,
    marginHorizontal: 4,
    backgroundColor: '#F0F0F0',
  },
  filterTabActive: {
    backgroundColor: '#FF8C00',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  filterTabTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorText: {
    fontSize: 14,
    color: '#E53935',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#FF8C00',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  listContent: {
    padding: 12,
  },
  row: {
    justifyContent: 'space-between',
  },
  catCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  silhouetteCard: {
    backgroundColor: '#E8E8E8',
  },
  catPhoto: {
    width: '100%',
    height: 120,
    backgroundColor: '#F5F5F5',
  },
  placeholderPhoto: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFE0B2',
  },
  placeholderEmoji: {
    fontSize: 40,
  },
  silhouettePhoto: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#BDBDBD',
  },
  lockIcon: {
    fontSize: 32,
  },
  catInfo: {
    padding: 10,
  },
  catName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  catLevel: {
    fontSize: 12,
    color: '#FF8C00',
    marginBottom: 2,
  },
  catXp: {
    fontSize: 11,
    color: '#999',
  },
  silhouetteName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 2,
  },
  silhouetteHint: {
    fontSize: 12,
    color: '#AAA',
  },
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  modalSilhouette: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#BDBDBD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalLockIcon: {
    fontSize: 32,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  modalArea: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalClose: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#FF8C00',
    borderRadius: 8,
  },
  modalCloseText: {
    color: '#FFF',
    fontWeight: '600',
  },
});
