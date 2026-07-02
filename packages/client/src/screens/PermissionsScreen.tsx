import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useLocation } from '../hooks/useLocation';
import { useCamera } from '../hooks/useCamera';

type PermissionsNavProp = NativeStackNavigationProp<RootStackParamList, 'Permissions'>;

type Step = 'explanation' | 'requesting';

/**
 * Permissions onboarding screen.
 *
 * Two-step flow:
 * 1. Explanation — tells the user why permissions are needed.
 * 2. Requesting — requests location then camera, shows denied messages, then navigates to Map.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */
export function PermissionsScreen() {
  const navigation = useNavigation<PermissionsNavProp>();
  const location = useLocation();
  const camera = useCamera();
  const [step, setStep] = useState<Step>('explanation');
  const [locationDenied, setLocationDenied] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleContinue = useCallback(() => {
    setStep('requesting');
  }, []);

  const handleRequestPermissions = useCallback(async () => {
    setProcessing(true);

    // Request location permission first (Requirement 1.1)
    const locationGranted = await location.requestPermission();

    if (!locationGranted) {
      // Requirement 1.3: Show message that map functionality is limited
      // Only disable map after explanation is successfully shown
      try {
        await new Promise<void>((resolve) => {
          Alert.alert(
            'Location Limited',
            'Map functionality will be limited without location access. You can enable it later in Settings.',
            [{ text: 'OK', onPress: () => resolve() }],
          );
        });
        setLocationDenied(true);
      } catch {
        // If explanation message fails to display, keep map enabled (Req 1.3)
        setLocationDenied(false);
      }
    }

    // Request camera permission second (Requirement 1.2)
    const cameraGranted = await camera.requestPermission();

    if (!cameraGranted) {
      // Requirement 1.4: Show message that scanning is unavailable
      Alert.alert(
        'Camera Unavailable',
        'Cat scanning will be unavailable without camera access. You can enable it later in Settings.',
        [{ text: 'OK' }],
      );
      setCameraDenied(true);
    }

    setProcessing(false);

    // Navigate to Map screen after permissions are handled
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  }, [location, camera, navigation]);

  if (step === 'explanation') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Welcome to CodingKitty 🐱</Text>
        <Text style={styles.subtitle}>
          Before we get started, we need a couple of permissions to give you the
          best experience.
        </Text>

        <View style={styles.permissionCard}>
          <Text style={styles.icon}>📍</Text>
          <View style={styles.permissionText}>
            <Text style={styles.permissionTitle}>Location</Text>
            <Text style={styles.permissionDesc}>
              We use your location to show nearby stray cats on the map and help
              you log sightings.
            </Text>
          </View>
        </View>

        <View style={styles.permissionCard}>
          <Text style={styles.icon}>📷</Text>
          <View style={styles.permissionText}>
            <Text style={styles.permissionTitle}>Camera</Text>
            <Text style={styles.permissionDesc}>
              The camera lets you scan and identify stray cats so we can track
              their care history.
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleContinue}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Step: requesting
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Setting Up Permissions</Text>

      {processing && (
        <Text style={styles.subtitle}>Requesting permissions…</Text>
      )}

      {!processing && (locationDenied || cameraDenied) && (
        <View style={styles.statusContainer}>
          {locationDenied && (
            <View style={styles.deniedCard}>
              <Text style={styles.deniedIcon}>⚠️</Text>
              <Text style={styles.deniedText}>
                Map functionality is limited without location permission.
              </Text>
            </View>
          )}
          {cameraDenied && (
            <View style={styles.deniedCard}>
              <Text style={styles.deniedIcon}>⚠️</Text>
              <Text style={styles.deniedText}>
                Cat scanning is unavailable without camera permission.
              </Text>
            </View>
          )}
        </View>
      )}

      {!processing && (
        <TouchableOpacity
          style={styles.button}
          onPress={handleRequestPermissions}
        >
          <Text style={styles.buttonText}>Grant Permissions</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFDF8',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
    color: '#2D2D2D',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  permissionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  icon: {
    fontSize: 32,
    marginRight: 16,
  },
  permissionText: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    color: '#2D2D2D',
  },
  permissionDesc: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#FF8C42',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 28,
    marginTop: 32,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusContainer: {
    width: '100%',
    marginBottom: 16,
  },
  deniedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    width: '100%',
  },
  deniedIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  deniedText: {
    flex: 1,
    fontSize: 14,
    color: '#E65100',
    lineHeight: 20,
  },
});
