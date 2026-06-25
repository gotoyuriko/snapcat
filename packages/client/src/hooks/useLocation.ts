/**
 * TODO: Implement useLocation hook
 * - Request location permissions
 * - Track current user position
 * - Calculate bounding box for map queries
 * - Watch position for real-time updates
 */

export interface LocationState {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
}

export function useLocation(): LocationState & {
  requestPermission: () => Promise<boolean>;
  refreshLocation: () => Promise<void>;
} {
  // TODO: Implement with expo-location
  return {
    latitude: null,
    longitude: null,
    loading: false,
    error: null,
    requestPermission: async () => {
      // TODO: Request location permission
      return false;
    },
    refreshLocation: async () => {
      // TODO: Get current position
    },
  };
}
