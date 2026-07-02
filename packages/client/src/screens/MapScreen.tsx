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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const logout = useAuth((s) => s.logout);
  const {
    latitude,
    longitude,
    loading: locationLoading,
    error: locationError,
    refreshLocation,
  } = useLocation();

  const [pins, setPins] = useState<MapPin[]>([]);
  const [loadingPins, setLoadingPins] = useState(false);
  const [selectedSilhouette, setSelectedSilhouette] = useState<MapPin | null>(null);

  const mapRef = useRef<MapView>(null);
  // Track the last position where we fetched pins to avoid unnecessary refetches
  const lastFetchPos = useRef<{ lat: number; lng: number } | null>(null);
  // Only auto-recenter once, on the first GPS fix — avoid yanking the map
  // out from under the user while they're panning around later.
  const hasAutoRecentered = useRef(false);

  // Fetch the device's current location on mount so the map centers on the
  // user instead of the fallback coordinate.
  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  useEffect(() => {
    if (latitude == null || longitude == null || hasAutoRecentered.current) return;
    hasAutoRecentered.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      500,
    );
  }, [latitude, longitude]);

  const recenterOnUser = useCallback(() => {
    if (latitude != null && longitude != null) {
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500,
      );
    } else {
      refreshLocation();
    }
  }, [latitude, longitude, refreshLocation]);

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
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
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
        <View style={[styles.loadingBadge, { top: insets.top + 16 }]}>
          <ActivityIndicator size="small" color="#FF8C00" />
        </View>
      )}

      {/* Logout button */}
      <TouchableOpacity
        style={[styles.logoutBtn, { top: insets.top + 8 }]}
        onPress={logout}
        accessibilityLabel="Log out"
        accessibilityRole="button"
      >
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>

      {/* Profile button */}
      <TouchableOpacity
        style={[styles.profileBtn, { top: insets.top + 8 }]}
        onPress={() => navigation.navigate('Profile')}
        accessibilityLabel="Open profile"
        accessibilityRole="button"
      >
        <Ionicons name="person-circle" size={36} color="#FF6B35" />
      </TouchableOpacity>

      {/* Recenter button — custom, identically placed on Android and iOS
          (the native showsMyLocationButton is Android-only and its position
          is controlled by the Google Maps SDK, not us). */}
      <TouchableOpacity
        style={styles.recenterBtn}
        onPress={recenterOnUser}
        accessibilityLabel="Recenter on my location"
        accessibilityRole="button"
      >
        <Ionicons name="locate" size={22} color="#333" />
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
  recenterBtn: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
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
  profileBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
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
