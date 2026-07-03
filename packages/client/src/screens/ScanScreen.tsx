import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { api, ApiError, resolvePhotoUrl } from '../services/api';
import { useLocation } from '../hooks/useLocation';

/** Types matching the POST /scan response */
interface Cat {
  id: string;
  name: string;
  photoUrl?: string;
}

interface UserGPS {
  lat: number;
  lng: number;
}

type RecognitionResult =
  | { result: 'no_cat' }
  | { result: 'matched'; cat: Cat; xpAwarded: number; levelUp: boolean }
  | { result: 'confirm_needed'; candidateCat: Cat; embedding: number[]; photoUrl: string }
  | { result: 'new_cat'; cat: Cat; xpAwarded: number };

type ConfirmResult =
  | { result: 'matched'; cat: Cat; xpAwarded: number; levelUp: boolean }
  | { result: 'new_cat'; cat: Cat; xpAwarded: number };

type ScanState =
  | { type: 'camera' }
  | { type: 'loading' }
  | { type: 'no_cat' }
  | { type: 'error'; message: string }
  | { type: 'matched'; cat: Cat; xpAwarded: number; levelUp: boolean }
  | {
      type: 'confirm_needed';
      candidateCat: Cat;
      embedding: number[];
      photoUrl: string;
      userGPS: UserGPS;
    }
  | { type: 'new_cat'; cat: Cat; xpAwarded: number };

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ScanScreen() {
  const navigation = useNavigation<NavigationProp>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>({ type: 'camera' });
  const [confirmLoading, setConfirmLoading] = useState(false);
  // The native camera session isn't ready the instant CameraView mounts —
  // calling takePictureAsync() before onCameraReady fires throws "Failed to
  // capture image", which used to get mislabeled as a network error below.
  const [cameraReady, setCameraReady] = useState(false);
  // Guards against a second shutter tap while takePictureAsync() is still in
  // flight (the camera stays mounted until capture resolves, so the button
  // remains visible for that window).
  const capturingRef = useRef(false);
  const { latitude, longitude, refreshLocation } = useLocation();

  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  const handleCapture = async () => {
    if (!cameraRef.current || !cameraReady || capturingRef.current) return;
    capturingRef.current = true;

    let photoUri: string;
    try {
      // Capture BEFORE switching to the loading state: setting scanState to
      // 'loading' unmounts the CameraView, and tearing down the native camera
      // session while takePictureAsync() is in flight throws "Failed to
      // capture image" on Android.
      //
      // skipProcessing avoids a known expo-camera failure mode in Expo Go where
      // the native post-capture processing step (quality/orientation
      // adjustment) throws "Failed to capture image" on some Android devices.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      setScanState({ type: 'loading' });
      if (!photo?.uri) {
        setScanState({ type: 'no_cat' });
        return;
      }
      photoUri = photo.uri;
    } catch (err) {
      console.warn('Camera capture failed:', err);
      setScanState({
        type: 'error',
        message: 'Failed to capture photo. Please try again.',
      });
      return;
    } finally {
      capturingRef.current = false;
    }

    try {
      // Server expects multipart/form-data: a `photo` image file + `userGPS` JSON.
      const userGPS: UserGPS = { lat: latitude ?? 0, lng: longitude ?? 0 };
      const form = new FormData();
      form.append('photo', {
        uri: photoUri,
        name: 'scan.jpg',
        type: 'image/jpeg',
      } as unknown as Blob);
      form.append('userGPS', JSON.stringify(userGPS));

      const result = await api.postForm<RecognitionResult>('/recognition/scan', form);

      switch (result.result) {
        case 'no_cat':
          setScanState({ type: 'no_cat' });
          break;
        case 'matched':
          setScanState({
            type: 'matched',
            cat: result.cat,
            xpAwarded: result.xpAwarded,
            levelUp: result.levelUp,
          });
          break;
        case 'confirm_needed':
          setScanState({
            type: 'confirm_needed',
            candidateCat: result.candidateCat,
            embedding: result.embedding,
            photoUrl: result.photoUrl,
            userGPS,
          });
          break;
        case 'new_cat':
          setScanState({
            type: 'new_cat',
            cat: result.cat,
            xpAwarded: result.xpAwarded,
          });
          break;
      }
    } catch (err) {
      console.warn('Scan request failed:', err);
      // 422 is the genuine "no cat detected" result; anything else (503 AI
      // service down, 401, network) is a real failure — show it honestly rather
      // than misreporting it as "no cat".
      if (err instanceof ApiError && err.status === 422) {
        setScanState({ type: 'no_cat' });
      } else {
        const message =
          err instanceof ApiError
            ? err.serverMessage ?? `Request failed (${err.status})`
            : 'Could not reach the server. Check your connection.';
        setScanState({ type: 'error', message });
      }
    }
  };

  const handleConfirm = async (catId: string | 'new') => {
    if (scanState.type !== 'confirm_needed') return;
    const { embedding, photoUrl, userGPS } = scanState;

    setConfirmLoading(true);
    try {
      const result = await api.post<ConfirmResult>('/recognition/scan/confirm', {
        catId,
        embedding,
        userGPS,
        photoUrl,
      });
      if (result.result === 'matched') {
        setScanState({
          type: 'matched',
          cat: result.cat,
          xpAwarded: result.xpAwarded,
          levelUp: result.levelUp,
        });
      } else {
        setScanState({
          type: 'new_cat',
          cat: result.cat,
          xpAwarded: result.xpAwarded,
        });
      }
    } catch {
      handleRetry();
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleRetry = () => {
    // A fresh CameraView mounts when we return to the camera state; its
    // readiness must be re-confirmed via onCameraReady before capture works.
    setCameraReady(false);
    setScanState({ type: 'camera' });
  };

  const handleGoToProfile = (catId: string) => {
    // Replace (not push) ScanScreen with CatProfile: otherwise "Back" from
    // CatProfile pops back onto this screen's stale success state, which has
    // no capture control to scan again — dead end. Replacing means Back goes
    // straight to the map, and the next Scan navigation mounts fresh.
    navigation.replace('CatProfile', { catId });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          Camera access is required to scan cats.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleBack}>
          <Text style={styles.secondaryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Loading state
  if (scanState.type === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Scanning for cats...</Text>
      </View>
    );
  }

  // Service/network error (distinct from a genuine "no cat" result)
  if (scanState.type === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.resultCard}>
          <View style={styles.failBadge}>
            <Text style={styles.badgeIcon}>✕</Text>
          </View>
          <Text style={styles.errorText}>{scanState.message}</Text>
          <TouchableOpacity style={styles.button} onPress={handleRetry}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleBack}>
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // No cat detected
  if (scanState.type === 'no_cat') {
    return (
      <View style={styles.container}>
        <View style={styles.resultCard}>
          <View style={styles.failBadge}>
            <Text style={styles.badgeIcon}>✕</Text>
          </View>
          <Text style={styles.errorText}>No cat detected — please retake</Text>
          <TouchableOpacity style={styles.button} onPress={handleRetry}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleBack}>
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Matched cat
  if (scanState.type === 'matched') {
    return (
      <View style={styles.container}>
        <View style={styles.resultCard}>
          <View style={styles.successBadge}>
            <Text style={styles.badgeIcon}>✓</Text>
          </View>
          <Text style={styles.successText}>Cat Matched!</Text>
          {scanState.cat.photoUrl && (
            <Image
              source={{ uri: resolvePhotoUrl(scanState.cat.photoUrl) }}
              style={styles.catImage}
              onError={(e) =>
                console.warn('Failed to load cat photo:', resolvePhotoUrl(scanState.cat.photoUrl), e.nativeEvent.error)
              }
            />
          )}
          <Text style={styles.catName}>{scanState.cat.name}</Text>
          <Text style={styles.xpText}>+{scanState.xpAwarded} XP</Text>
          {scanState.levelUp && <Text style={styles.levelUpText}>Level Up!</Text>}
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleGoToProfile(scanState.cat.id)}
          >
            <Text style={styles.buttonText}>View Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // New cat registered
  if (scanState.type === 'new_cat') {
    return (
      <View style={styles.container}>
        <View style={styles.resultCard}>
          <View style={styles.successBadge}>
            <Text style={styles.badgeIcon}>✓</Text>
          </View>
          <Text style={styles.successText}>New Cat Discovered!</Text>
          {scanState.cat.photoUrl && (
            <Image
              source={{ uri: resolvePhotoUrl(scanState.cat.photoUrl) }}
              style={styles.catImage}
              onError={(e) =>
                console.warn('Failed to load cat photo:', resolvePhotoUrl(scanState.cat.photoUrl), e.nativeEvent.error)
              }
            />
          )}
          <Text style={styles.catName}>{scanState.cat.name}</Text>
          <Text style={styles.xpText}>+{scanState.xpAwarded} XP</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => handleGoToProfile(scanState.cat.id)}
          >
            <Text style={styles.buttonText}>View Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Confirm needed dialog
  if (scanState.type === 'confirm_needed') {
    return (
      <View style={styles.container}>
        <Modal visible transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {scanState.candidateCat.photoUrl && (
                <Image
                  source={{ uri: resolvePhotoUrl(scanState.candidateCat.photoUrl) }}
                  style={styles.catImage}
                />
              )}
              <Text style={styles.confirmText}>
                Does this look like {scanState.candidateCat.name || 'this cat'}?
              </Text>
              {confirmLoading ? (
                <ActivityIndicator size="small" color="#4CAF50" />
              ) : (
                <View style={styles.confirmButtons}>
                  <TouchableOpacity
                    style={styles.confirmYes}
                    onPress={() => handleConfirm(scanState.candidateCat.id)}
                  >
                    <Text style={styles.buttonText}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmNo}
                    onPress={() => handleConfirm('new')}
                  >
                    <Text style={styles.buttonText}>No</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Default: Camera view
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onCameraReady={() => setCameraReady(true)}
      />
      {/* CameraView does not support children — render the overlay as an
          absolutely-positioned sibling on top. box-none lets taps fall through
          to the camera everywhere except the buttons themselves. */}
      <View style={styles.cameraOverlay} pointerEvents="box-none">
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.captureButton, !cameraReady && styles.captureButtonDisabled]}
          onPress={handleCapture}
          disabled={!cameraReady}
        >
          {cameraReady ? (
            <View style={styles.captureInner} />
          ) : (
            <ActivityIndicator size="small" color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginLeft: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 30,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  errorText: {
    color: '#FF5252',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  successText: {
    color: '#4CAF50',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  resultCard: {
    backgroundColor: '#1c1c1c',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
    width: '85%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  successBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  failBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF5252',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  badgeIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  catImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
    marginBottom: 12,
  },
  catName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  xpText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  levelUpText: {
    color: '#FF9800',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#aaa',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#222',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '80%',
  },
  confirmText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  confirmYes: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  confirmNo: {
    backgroundColor: '#F44336',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
});
