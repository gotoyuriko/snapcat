import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { LoginScreen } from '../screens/LoginScreen';
import { PermissionsScreen } from '../screens/PermissionsScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { CatProfileScreen } from '../screens/CatProfileScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { WebARFeedingScreen } from '../screens/WebARFeedingScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { MedicalRequestScreen } from '../screens/MedicalRequestScreen';
import { CareRequestsScreen } from '../screens/CareRequestsScreen';
import { CareRequestDetailScreen } from '../screens/CareRequestDetailScreen';
import { LevelRewardsScreen } from '../screens/LevelRewardsScreen';
import { BadgeCatalogueScreen } from '../screens/BadgeCatalogueScreen';
import { MainTabs } from './MainTabs';

export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  Scan: undefined;
  CatProfile: { catId: string };
  Chat: { catId: string };
  Permissions: undefined;
  WebARFeeding: { catId: string };
  Profile: undefined;
  MedicalRequest: { catId: string };
  CareRequests: undefined;
  CareRequestDetail: { requestId: string };
  LevelRewards: { catId: string; catName?: string | null; level: number; xp: number };
  BadgeCatalogue: undefined;
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
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Scan" component={ScanScreen} />
            <Stack.Screen
              name="CatProfile"
              component={CatProfileScreen}
              options={{ title: 'Cat Profile' }}
            />
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
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ title: 'Profile' }}
            />
            <Stack.Screen
              name="MedicalRequest"
              component={MedicalRequestScreen}
              options={{ title: 'Request Care' }}
            />
            <Stack.Screen
              name="CareRequests"
              component={CareRequestsScreen}
              options={{ title: 'Care Requests' }}
            />
            <Stack.Screen
              name="CareRequestDetail"
              component={CareRequestDetailScreen}
              options={{ title: 'Care Request' }}
            />
            <Stack.Screen
              name="LevelRewards"
              component={LevelRewardsScreen}
              options={{ title: 'Level Rewards' }}
            />
            <Stack.Screen
              name="BadgeCatalogue"
              component={BadgeCatalogueScreen}
              options={{ title: 'Badge Catalogue' }}
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
