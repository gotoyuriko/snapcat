import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { useLocation } from '../hooks/useLocation';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';

/** Shape returned by GET /map */
interface MapPin {
  catId: string;
  approxLat: number;
  approxLng: number;
  discovered: boolean;
  name?: string;
  photoUrl?: string;
  areaLabel?: string;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/** Haversine distance in meters between two lat/lng points */
function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const REFETCH_DISTANCE_THRESHOLD = 200; // meters

export function MapScreen() {
  const navigation = useNavigation<NavigationProp>();
  const logout = useAuth((s) => s.logout);
  const { latitude, longitude, loading: locationLoading, error: locationError } = useLocation();

  const [pins, setPins] = useState<MapPin[]>([]);
  const [loadingPins, setLoadingPins] = useState(false);
  const [selectedSilhouette, setSelectedSilhouette] = useState<MapPin | null>(null);

  // Track the last position where we fetched pins to avoid unnecessary refetches
  const lastFetchPos = useRef<{ lat: number; lng: number } | null>(null);

  const fetchPins = useCallback(async () => {
    setLoadingPins(true);
    try {
      const data = await api.get<MapPin[]>('/map');
      setPins(data);
    } catch {
      // Silently handle — pins just won't update
    } finally {
      setLoadingPins(false);
    }
  }, []);

  // Fetch on initial load
  useEffect(() => {
    fetchPins();
  }, [fetchPins]);

  // Refetch when GPS changes significantly (>200m from last fetch position)
  useEffect(() => {
    if (latitude == null || longitude == null) return;

    if (lastFetchPos.current == null) {
      lastFetchPos.current = { lat: latitude, lng: longitude };
      return; // initial fetch already handled above
    }

    const distance = distanceMeters(
      lastFetchPos.current.lat,
      lastFetchPos.current.lng,
      latitude,
      longitude,
    );

    if (distance > REFETCH_DISTANCE_THRESHOLD) {
      lastFetchPos.current = { lat: latitude, lng: longitude };
      fetchPins();
    }
  }, [latitude, longitude, fetchPins]);

  const handleMarkerPress = (pin: MapPin) => {
    if (pin.discovered) {
      // Navigate to full cat profile
      navigation.navigate('CatProfile', { catId: pin.catId });
    } else {
      // Show approximate area modal — do NOT reveal name or photo
      setSelectedSilhouette(pin);
    }
  };

  // Location permission denied overlay
  if (locationError) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionOverlay}>
          <Text style={styles.permissionTitle}>Location Access Required</Text>
          <Text style={styles.permissionMessage}>
            Please enable location permissions to see cats near you on the map.
          </Text>
        </View>
      </View>
    );
  }

  // Loading state while getting initial location
  if (locationLoading && latitude == null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FF8C00" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  const initialRegion = {
    latitude: latitude ?? 37.7749,
    longitude: longitude ?? -122.4194,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {pins.map((pin) => (
          <Marker
            key={pin.catId}
            coordinate={{ latitude: pin.approxLat, longitude: pin.approxLng }}
            pinColor={pin.discovered ? '#FF8C00' : '#9E9E9E'}
            title={pin.discovered ? pin.name : undefined}
            onPress={() => handleMarkerPress(pin)}
          />
        ))}
      </MapView>

      {/* Loading indicator for pin fetching */}
      {loadingPins && (
        <View style={styles.loadingBadge}>
          <ActivityIndicator size="small" color="#FF8C00" />
        </View>
      )}

      {/* Floating Action Button → Scan screen */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Scan')}
        accessibilityLabel="Scan for cats"
        accessibilityRole="button"
      >
        <Text style={styles.fabIcon}>📷</Text>
      </TouchableOpacity>

      {/* Logout button */}
      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={logout}
        accessibilityLabel="Log out"
        accessibilityRole="button"
      >
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>

      {/* Silhouette tap modal — shows approximate area only */}
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
            <Text style={styles.modalTitle}>Unknown Cat</Text>
            <Text style={styles.modalArea}>
              Approximate area: {selectedSilhouette?.areaLabel ?? 'Nearby'}
            </Text>
            <Text style={styles.modalHint}>
              Discover this cat by scanning it up close!
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF8C00',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabIcon: {
    fontSize: 24,
  },
  logoutBtn: {
    position: 'absolute',
    top: 48,
    left: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e53935',
  },
  loadingBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    elevation: 4,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  permissionOverlay: {
    padding: 32,
    alignItems: 'center',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  permissionMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
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
    paddingVertical: 8,
    paddingHorizontal: 24,
    backgroundColor: '#FF8C00',
    borderRadius: 8,
  },
  modalCloseText: {
    color: '#fff',
    fontWeight: '600',
  },
});
