import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { LoginScreen } from '../screens/LoginScreen';
import { PermissionsScreen } from '../screens/PermissionsScreen';
import { MapScreen } from '../screens/MapScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { CatpediaScreen } from '../screens/CatpediaScreen';
import { CatProfileScreen } from '../screens/CatProfileScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { WebARFeedingScreen } from '../screens/WebARFeedingScreen';

export type RootStackParamList = {
  Login: undefined;
  Map: undefined;
  Scan: undefined;
  CatProfile: { catId: string };
  Catpedia: undefined;
  Chat: { catId: string };
  Wallet: undefined;
  Permissions: undefined;
  WebARFeeding: { catId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigation() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const loading = useAuth((s) => s.loading);
  const initialize = useAuth((s) => s.initialize);

  // Hydrate any persisted token once on startup.
  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#FF8C00" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          // Unauthenticated: only the login/register gate is reachable.
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          // Authenticated: the full app. First screen handles permissions.
          <>
            <Stack.Screen name="Permissions" component={PermissionsScreen} />
            <Stack.Screen name="Map" component={MapScreen} />
            <Stack.Screen name="Scan" component={ScanScreen} />
            <Stack.Screen
              name="CatProfile"
              component={CatProfileScreen}
              options={{ title: 'Cat Profile' }}
            />
            <Stack.Screen name="Catpedia" component={CatpediaScreen} />
            <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: 'Wallet' }} />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ title: 'Community Chat' }}
            />
            <Stack.Screen
              name="WebARFeeding"
              component={WebARFeedingScreen}
              options={{ title: 'Feed Cat' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
});
