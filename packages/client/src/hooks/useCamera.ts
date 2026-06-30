import { useState, useCallback } from 'react';
import { Camera } from 'expo-camera';
import { PermissionStatus } from 'expo-modules-core';

export interface CameraState {
  permissionStatus: PermissionStatus | null;
  error: string | null;
}

export function useCamera(): CameraState & {
  requestPermission: () => Promise<boolean>;
} {
  const [state, setState] = useState<CameraState>({
    permissionStatus: null,
    error: null,
  });

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setState({ permissionStatus: status, error: null });
      return status === PermissionStatus.GRANTED;
    } catch (err) {
      setState({
        permissionStatus: PermissionStatus.DENIED,
        error: 'Failed to request camera permission',
      });
      return false;
    }
  }, []);

  return {
    ...state,
    requestPermission,
  };
}
