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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { useLocation } from '../hooks/useLocation';
import { api, resolvePhotoUrl } from '../services/api';
import { CachedImage } from '../components/CachedImage';

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
// Requirement 2.6: pin positions should reflect new sightings within 60s.
// Poll well inside that window while the map is focused.
const PIN_POLL_INTERVAL_MS = 30_000;
const RECENTER_ANIMATION_MS = 500;
const LOCATING_TIMEOUT_MS = 1500;

export function MapScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const {
    latitude,
    longitude,
    error: locationError,
    refreshLocation,
  } = useLocation();

  const [pins, setPins] = useState<MapPin[]>([]);
  const [loadingPins, setLoadingPins] = useState(false);
  const [selectedSilhouette, setSelectedSilhouette] = useState<MapPin | null>(null);
  // Preview bubble for a discovered cat's pin — photo, name and a "View
  // Profile" button, so tapping a pin never yanks the user to another page.
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);

  const mapRef = useRef<MapView>(null);
  // Track the last position where we fetched pins to avoid unnecessary refetches
  const lastFetchPos = useRef<{ lat: number; lng: number } | null>(null);
  // Only auto-recenter once, on the first GPS fix — avoid yanking the map
  // out from under the user while they're panning around later.
  const hasAutoRecentered = useRef(false);

  // Covers the map with a small "Locating you..." overlay so the fallback
  // coordinate is never visibly shown before we jump to the real one. Capped
  // at LOCATING_TIMEOUT_MS so a slow/stuck GPS fix doesn't block the map
  // indefinitely — same failure mode as the old blocking spinner we removed.
  const [locating, setLocating] = useState(true);
  const locatingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    locatingTimeoutRef.current = setTimeout(() => setLocating(false), LOCATING_TIMEOUT_MS);
    return () => {
      if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
    };
  }, []);

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
      RECENTER_ANIMATION_MS,
    );
    // Keep the overlay up until the pan animation finishes so the user never
    // sees the fallback location before the jump.
    if (locatingTimeoutRef.current) clearTimeout(locatingTimeoutRef.current);
    setTimeout(() => setLocating(false), RECENTER_ANIMATION_MS);
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
        RECENTER_ANIMATION_MS,
      );
    } else {
      refreshLocation();
    }
  }, [latitude, longitude, refreshLocation]);

  // Background polls pass silent=true so the loading badge doesn't flash
  // every 30 seconds; it only shows for user-visible loads.
  const fetchPins = useCallback(async (silent = false) => {
    if (!silent) setLoadingPins(true);
    try {
      const data = await api.get<MapPin[]>('/map');
      setPins(data);
    } catch {
      // Silently handle — pins just won't update
    } finally {
      if (!silent) setLoadingPins(false);
    }
  }, []);

  // Fetch on focus (covers initial load and returning from Scan/CatProfile,
  // where a new sighting may just have moved a pin), then poll every 30s while
  // the map stays focused so new sightings appear within the 60s target
  // (Requirement 2.6). The interval is torn down on blur to avoid background
  // requests.
  useFocusEffect(
    useCallback(() => {
      fetchPins();
      const interval = setInterval(() => fetchPins(true), PIN_POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [fetchPins]),
  );

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
      // Show the preview bubble; profile only opens via its button
      setSelectedPin(pin);
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
        onPress={() => setSelectedPin(null)}
      >
        {pins.map((pin) => (
          <Marker
            key={pin.catId}
            coordinate={{ latitude: pin.approxLat, longitude: pin.approxLng }}
            pinColor={pin.discovered ? '#FF8C00' : '#9E9E9E'}
            onPress={(e) => {
              // Keep the tap from also reaching the map's onPress (which
              // closes the preview) and suppress the native callout.
              e.stopPropagation();
              handleMarkerPress(pin);
            }}
          />
        ))}
      </MapView>

      {/* Cat preview bubble — photo, name and View Profile (discovered pins) */}
      {selectedPin && (
        <View style={styles.previewCard}>
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setSelectedPin(null)}
            accessibilityLabel="Close preview"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={18} color="#999" />
          </TouchableOpacity>
          <View style={styles.previewRow}>
            {selectedPin.photoUrl ? (
              <CachedImage
                source={{ uri: resolvePhotoUrl(selectedPin.photoUrl) }}
                style={styles.previewPhoto}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.previewPhoto, styles.previewPhotoFallback]}>
                <Ionicons name="paw" size={28} color="#fff" />
              </View>
            )}
            <View style={styles.previewInfo}>
              <Text style={styles.previewName} numberOfLines={1}>
                {selectedPin.name ?? 'Unnamed cat'}
              </Text>
              {selectedPin.areaLabel ? (
                <Text style={styles.previewArea} numberOfLines={1}>
                  📍 {selectedPin.areaLabel}
                </Text>
              ) : null}
              <TouchableOpacity
                style={styles.previewButton}
                onPress={() => {
                  const catId = selectedPin.catId;
                  setSelectedPin(null);
                  navigation.navigate('CatProfile', { catId });
                }}
                accessibilityLabel="View cat profile"
                accessibilityRole="button"
              >
                <Text style={styles.previewButtonText}>View Profile ›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Locating overlay — hides the fallback coordinate until we've panned
          to the real GPS fix (or the timeout gives up and reveals the map
          as-is), so the user never sees the map jump from one place to another. */}
      {locating && (
        <View style={styles.locatingOverlay}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <Text style={styles.locatingText}>Locating you...</Text>
        </View>
      )}

      {/* Loading indicator for pin fetching */}
      {loadingPins && (
        <View style={[styles.loadingBadge, { top: insets.top + 16 }]}>
          <ActivityIndicator size="small" color="#FF8C00" />
        </View>
      )}

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
  locatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locatingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
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
  previewCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 84,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  previewClose: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    padding: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewPhoto: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#eee',
  },
  previewPhotoFallback: {
    backgroundColor: '#FF8C00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  previewArea: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  previewButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF8C00',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
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
