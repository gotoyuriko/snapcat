import React, { useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Text, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { MapScreen } from '../screens/MapScreen';
import { CatpediaScreen } from '../screens/CatpediaScreen';
import { ShopScreen } from '../screens/ShopScreen';

const Tab = createBottomTabNavigator();

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const activeName = state.routes[state.index].name;
  const isCatpedia = activeName === 'Catpedia';
  const isMap = activeName === 'Map';
  const isShop = activeName === 'Shop';

  // Requirement 1.4: the scan button is disabled while camera permission is
  // denied. Tapping the greyed-out button re-requests when the OS still allows
  // prompting, otherwise points the user to Settings.
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraDenied = cameraPermission != null && !cameraPermission.granted;

  const handleScanPress = useCallback(() => {
    if (!cameraDenied) {
      navigation.getParent()?.navigate('Scan');
      return;
    }
    if (cameraPermission?.canAskAgain) {
      requestCameraPermission();
    } else {
      Alert.alert(
        'Camera Unavailable',
        'Cat scanning is unavailable without camera permission. Enable the camera for this app in your device Settings.',
      );
    }
  }, [cameraDenied, cameraPermission, requestCameraPermission, navigation]);

  return (
    <View style={styles.wrapper}>
      {/* Camera — floating FAB, detached above the bar, centered on screen */}
      <TouchableOpacity
        style={[styles.cameraButton, cameraDenied && styles.cameraButtonDisabled]}
        onPress={handleScanPress}
        activeOpacity={0.85}
        accessibilityLabel={cameraDenied ? 'Scanning unavailable — camera permission denied' : 'Scan a cat'}
        accessibilityRole="button"
        accessibilityState={{ disabled: cameraDenied }}
      >
        <Ionicons name="camera" size={30} color="#fff" />
      </TouchableOpacity>

      <View style={styles.container}>
        {/* Catpedia — left */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('Catpedia')}
          activeOpacity={0.7}
        >
          <Ionicons name="paw" size={24} color={isCatpedia ? '#FF6B35' : '#9E9E9E'} />
          <Text style={[styles.label, isCatpedia && styles.labelActive]}>Catpedia</Text>
        </TouchableOpacity>

        {/* Map — center, sits under the floating camera */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('Map')}
          activeOpacity={0.7}
        >
          <Ionicons name="map" size={24} color={isMap ? '#FF6B35' : '#9E9E9E'} />
          <Text style={[styles.label, isMap && styles.labelActive]}>Map</Text>
        </TouchableOpacity>

        {/* Donation Shop — right */}
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('Shop')}
          activeOpacity={0.7}
        >
          <Ionicons name="cart" size={24} color={isShop ? '#FF6B35' : '#9E9E9E'} />
          <Text style={[styles.label, isShop && styles.labelActive]}>Shop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
      initialRouteName="Map"
    >
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Catpedia" component={CatpediaScreen} />
      <Tab.Screen name="Shop" component={ShopScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    height: 70,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 6,
  },
  label: {
    fontSize: 11,
    marginTop: 3,
    color: '#9E9E9E',
    fontWeight: '500',
  },
  labelActive: {
    color: '#FF6B35',
  },
  cameraButton: {
    position: 'absolute',
    top: -68,
    left: '50%',
    marginLeft: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  cameraButtonDisabled: {
    backgroundColor: '#BDBDBD',
    shadowColor: '#000',
    shadowOpacity: 0.15,
  },
});
