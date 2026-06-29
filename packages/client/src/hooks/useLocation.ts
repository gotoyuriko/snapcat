import { useState, useCallback } from 'react';
import * as Location from 'expo-location';

export interface LocationState {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
  permissionStatus: Location.PermissionStatus | null;
}

export function useLocation(): LocationState & {
  requestPermission: () => Promise<boolean>;
  refreshLocation: () => Promise<void>;
} {
  const [state, setState] = useState<LocationState>({
    latitude: null,
    longitude: null,
    loading: false,
    error: null,
    permissionStatus: null,
  });

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setState((prev) => ({ ...prev, permissionStatus: status }));
      return status === Location.PermissionStatus.GRANTED;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: 'Failed to request location permission',
        permissionStatus: Location.PermissionStatus.DENIED,
      }));
      return false;
    }
  }, []);

  const refreshLocation = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: 'Location permission not granted',
          permissionStatus: status,
        }));
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setState({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        loading: false,
        error: null,
        permissionStatus: status,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'Failed to get current location',
      }));
    }
  }, []);

  return {
    ...state,
    requestPermission,
    refreshLocation,
  };
}
